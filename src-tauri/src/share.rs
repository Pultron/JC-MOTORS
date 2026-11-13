//! Compartir cotizaciones por WhatsApp / correo.
//!
//! Todo se valida aquí: el WebView solo entrega texto y bytes, nunca rutas libres ni URL.
//! Las URL se construyen en Rust a partir de partes validadas y se abren con el manejador
//! predeterminado del sistema (`ShellExecuteW`), sin shell intermedia.

use crate::error::{err, R};
use crate::files::write_atomic;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub const SHARED_DIR_NAME: &str = "enviados";
pub const MAX_PDF_BYTES: usize = 25 * 1024 * 1024;
pub const MAX_NAME_CHARS: usize = 120;
pub const MAX_EMAIL_CHARS: usize = 254;
pub const MAX_SUBJECT_CHARS: usize = 200;
pub const MAX_BODY_CHARS: usize = 4000;
pub const MAX_URL_CHARS: usize = 8000;
pub const RETENTION_DAYS: u64 = 30;

const RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3",
    "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

pub fn shared_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(SHARED_DIR_NAME)
}

// ---------------------------------------------------------------------------------------------
// File names
// ---------------------------------------------------------------------------------------------

/// Nombre de archivo seguro en Windows, SIN extensión. Conserva acentos; quita `<>:"/\|?*`, controles,
/// puntos/espacios finales, nombres reservados y limita la longitud.
pub fn sanitize_file_base(raw: &str) -> String {
    let filtered: String = raw
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'))
        .collect();
    let mut name = filtered.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.to_ascii_lowercase().ends_with(".pdf") {
        name.truncate(name.len() - 4);
    }
    let mut name: String = name.chars().take(MAX_NAME_CHARS).collect();
    name = name.trim_end_matches(['.', ' ']).trim_start().to_string();
    if name.is_empty() {
        name = "Documento".to_string();
    }
    let stem = name.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
    if RESERVED_NAMES.contains(&stem.as_str()) {
        name.insert(0, '_');
    }
    name
}

/// Escribe el PDF en `dir`. Si el nombre está ocupado (p. ej. abierto en otro programa) prueba " (2)", " (3)"…
pub fn save_shared_pdf_in(dir: &Path, filename_base: &str, bytes: &[u8]) -> R<PathBuf> {
    if bytes.len() > MAX_PDF_BYTES {
        return err("El PDF es demasiado grande para compartirlo.");
    }
    if !bytes.starts_with(b"%PDF-") {
        return err("El archivo generado no es un PDF válido");
    }
    crate::files::ensure_dir(dir)?;
    let base = sanitize_file_base(filename_base);
    let mut last_error = None;
    for attempt in 1..=5 {
        let name = if attempt == 1 { format!("{base}.pdf") } else { format!("{base} ({attempt}).pdf") };
        let target = dir.join(name);
        match write_atomic(&target, bytes) {
            Ok(()) => return Ok(target),
            Err(error) => last_error = Some(error),
        }
    }
    Err(last_error.unwrap_or_else(|| crate::error::AppError("No se pudo guardar el PDF.".into())))
}

// ---------------------------------------------------------------------------------------------
// Path validation (only direct children of enviados/)
// ---------------------------------------------------------------------------------------------

/// Acepta únicamente un archivo `.pdf` regular, hijo directo de `dir`, sin enlaces simbólicos ni `..`.
/// Devuelve la ruta `dir/<nombre>` (sin prefijo `\\?\`).
pub fn validate_shared_path(dir: &Path, path: &str) -> R<PathBuf> {
    const BAD: &str = "La ruta del archivo no es válida.";
    if path.is_empty() || path.len() > 1024 || path.contains('\0') {
        return err(BAD);
    }
    let requested = Path::new(path);
    if requested.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return err(BAD);
    }
    let Ok(dir_canon) = fs::canonicalize(dir) else { return err(BAD) };
    let Ok(file_canon) = fs::canonicalize(requested) else { return err(BAD) };
    if file_canon.parent() != Some(dir_canon.as_path()) {
        return err(BAD);
    }
    let Ok(meta) = fs::symlink_metadata(requested) else { return err(BAD) };
    if meta.file_type().is_symlink() || !meta.is_file() {
        return err(BAD);
    }
    let Some(file_name) = file_canon.file_name() else { return err(BAD) };
    if !Path::new(file_name).extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
        return err(BAD);
    }
    Ok(dir.join(file_name))
}

// ---------------------------------------------------------------------------------------------
// Contact validation and URL building
// ---------------------------------------------------------------------------------------------

/// Teléfono mexicano: exactamente 10 dígitos (se toleran espacios, guiones, puntos y paréntesis).
pub fn normalize_phone(phone: &str) -> R<String> {
    if phone.chars().count() > 30 || !phone.chars().all(|c| c.is_ascii_digit() || matches!(c, ' ' | '-' | '.' | '(' | ')')) {
        return err("El teléfono debe tener 10 dígitos.");
    }
    let digits: String = phone.chars().filter(char::is_ascii_digit).collect();
    if digits.len() != 10 {
        return err("El teléfono debe tener 10 dígitos.");
    }
    Ok(digits)
}

/// Correo ASCII `local@dominio.tld` sin espacios, comas ni caracteres que alteren una URL `mailto:`.
pub fn validate_email(email: &str) -> R<String> {
    const BAD: &str = "El correo no es válido.";
    let email = email.trim();
    if email.is_empty() || email.len() > MAX_EMAIL_CHARS || !email.is_ascii() {
        return err(BAD);
    }
    let Some((local, domain)) = email.split_once('@') else { return err(BAD) };
    let local_ok = !local.is_empty()
        && local.len() <= 64
        && !local.starts_with('.')
        && !local.ends_with('.')
        && !local.contains("..")
        && local.chars().all(|c| c.is_ascii_alphanumeric() || "!#$%&'*+/=?^_`{|}~.-".contains(c));
    let labels: Vec<&str> = domain.split('.').collect();
    let domain_ok = labels.len() >= 2
        && labels.iter().all(|l| {
            !l.is_empty() && l.len() <= 63 && !l.starts_with('-') && !l.ends_with('-') && l.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
        && labels.last().is_some_and(|tld| tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphabetic()));
    if !local_ok || !domain_ok {
        return err(BAD);
    }
    Ok(email.to_string())
}

/// Codifica en porcentaje todo lo que no sea no-reservado (RFC 3986): letras, dígitos y `-._~`.
pub fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 3);
    for byte in input.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn check_len(label: &str, value: &str, max: usize) -> R<()> {
    if value.chars().count() > max {
        return err(format!("{label} es demasiado largo."));
    }
    Ok(())
}

fn finish_url(url: String) -> R<String> {
    if url.len() > MAX_URL_CHARS {
        return err("El mensaje es demasiado largo para enviarlo.");
    }
    Ok(url)
}

pub fn whatsapp_url(phone: &str, text: &str) -> R<String> {
    let digits = normalize_phone(phone)?;
    check_len("El mensaje", text, MAX_BODY_CHARS)?;
    finish_url(format!("https://wa.me/52{digits}?text={}", percent_encode(text)))
}

pub fn mailto_url(email: &str, subject: &str, body: &str) -> R<String> {
    let email = validate_email(email)?;
    check_len("El asunto", subject, MAX_SUBJECT_CHARS)?;
    check_len("El mensaje", body, MAX_BODY_CHARS)?;
    finish_url(format!("mailto:{}?subject={}&body={}", percent_encode(&email).replace("%40", "@"), percent_encode(subject), percent_encode(body)))
}

pub fn gmail_url(email: &str, subject: &str, body: &str) -> R<String> {
    let email = validate_email(email)?;
    check_len("El asunto", subject, MAX_SUBJECT_CHARS)?;
    check_len("El mensaje", body, MAX_BODY_CHARS)?;
    finish_url(format!(
        "https://mail.google.com/mail/?view=cm&fs=1&to={}&su={}&body={}",
        percent_encode(&email),
        percent_encode(subject),
        percent_encode(body)
    ))
}

/// Última barrera antes de lanzar: solo estos tres orígenes, y solo ASCII sin controles ni espacios.
pub fn is_allowed_url(url: &str) -> bool {
    let prefix_ok = url.starts_with("https://wa.me/52") || url.starts_with("mailto:") || url.starts_with("https://mail.google.com/mail/?view=cm");
    prefix_ok && url.len() <= MAX_URL_CHARS && url.bytes().all(|b| b.is_ascii_graphic())
}

// ---------------------------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------------------------

/// Borra los `*.pdf` (archivos regulares, sin recursión) con más de `max_age` de antigüedad. Devuelve cuántos borró.
pub fn cleanup_old_pdfs(dir: &Path, now: SystemTime, max_age: Duration) -> usize {
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    let mut removed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else { continue };
        if !meta.is_file() || !path.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
            continue;
        }
        let Ok(modified) = meta.modified() else { continue };
        if now.duration_since(modified).is_ok_and(|age| age > max_age) && fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    removed
}

pub fn cleanup_shared_dir(data_dir: &Path) -> usize {
    cleanup_old_pdfs(&shared_dir(data_dir), SystemTime::now(), Duration::from_secs(RETENTION_DAYS * 24 * 60 * 60))
}

// ---------------------------------------------------------------------------------------------
// Windows integration
// ---------------------------------------------------------------------------------------------

/// Bloque `DROPFILES` (formato CF_HDROP) con una sola ruta ancha: cabecera de 20 bytes, ruta UTF-16, doble NUL.
pub fn build_hdrop(path: &str) -> Vec<u8> {
    let mut buffer = Vec::with_capacity(20 + (path.len() + 2) * 2);
    buffer.extend_from_slice(&20u32.to_le_bytes()); // pFiles: desplazamiento a la lista
    buffer.extend_from_slice(&0i32.to_le_bytes()); // pt.x
    buffer.extend_from_slice(&0i32.to_le_bytes()); // pt.y
    buffer.extend_from_slice(&0u32.to_le_bytes()); // fNC
    buffer.extend_from_slice(&1u32.to_le_bytes()); // fWide = UTF-16
    for unit in path.encode_utf16() {
        buffer.extend_from_slice(&unit.to_le_bytes());
    }
    buffer.extend_from_slice(&[0, 0, 0, 0]); // fin de la ruta + fin de la lista
    buffer
}

#[cfg(windows)]
pub fn open_url(url: &str) -> R<()> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    if !is_allowed_url(url) {
        return err("Enlace no permitido.");
    }
    let wide: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
    let verb: Vec<u16> = "open\0".encode_utf16().collect();
    // SAFETY: cadenas terminadas en NUL que viven durante la llamada; sin ventana padre ni parámetros.
    let result = unsafe { ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), wide.as_ptr(), std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL) };
    if (result as usize) <= 32 {
        return err("No se pudo abrir el enlace.");
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn open_url(_url: &str) -> R<()> {
    err("Abrir enlaces solo está disponible en Windows.")
}

#[cfg(windows)]
pub fn put_file_on_clipboard(owner: windows_sys::Win32::Foundation::HWND, path: &Path) -> R<()> {
    use windows_sys::Win32::Foundation::GlobalFree;
    use windows_sys::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    const CF_HDROP: u32 = 15;
    const FAIL: &str = "No se pudo copiar el archivo al portapapeles.";
    let data = build_hdrop(&path.to_string_lossy());
    // SAFETY: bloque global movible con el tamaño exacto; tras SetClipboardData exitoso el sistema es dueño del bloque.
    unsafe {
        let mut opened = false;
        for _ in 0..10 {
            if OpenClipboard(owner) != 0 {
                opened = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(30));
        }
        if !opened {
            return err(FAIL);
        }
        let mut ok = false;
        if EmptyClipboard() != 0 {
            let handle = GlobalAlloc(GMEM_MOVEABLE, data.len());
            if !handle.is_null() {
                let locked = GlobalLock(handle) as *mut u8;
                if locked.is_null() {
                    GlobalFree(handle);
                } else {
                    std::ptr::copy_nonoverlapping(data.as_ptr(), locked, data.len());
                    GlobalUnlock(handle);
                    if SetClipboardData(CF_HDROP, handle as _).is_null() {
                        GlobalFree(handle);
                    } else {
                        ok = true;
                    }
                }
            }
        }
        CloseClipboard();
        if !ok {
            return err(FAIL);
        }
    }
    Ok(())
}

#[cfg(windows)]
pub fn reveal(path: &Path) -> R<()> {
    use std::os::windows::process::CommandExt;
    let text = path.to_string_lossy();
    if text.contains('"') {
        return err("La ruta del archivo no es válida.");
    }
    // Explorer devuelve código de salida 1 aun con éxito: solo se verifica que se pudo lanzar.
    std::process::Command::new("explorer.exe").raw_arg(format!("/select,\"{text}\"")).spawn()?;
    Ok(())
}

#[cfg(not(windows))]
pub fn reveal(_path: &Path) -> R<()> {
    err("Mostrar en la carpeta solo está disponible en Windows.")
}

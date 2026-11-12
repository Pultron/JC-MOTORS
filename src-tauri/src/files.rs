use crate::error::{err, R};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

pub fn hex(bytes: impl AsRef<[u8]>) -> String {
    bytes.as_ref().iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex(Sha256::digest(bytes))
}

pub fn sha256_file(path: &Path) -> R<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex(hasher.finalize()))
}

/// Escribe a un temporal junto al destino y lo renombra: nunca queda un archivo a medias con el nombre final.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> R<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut temp_name = path.file_name().map(|name| name.to_os_string()).unwrap_or_default();
    temp_name.push(".tmp");
    let temp = path.with_file_name(temp_name);
    if let Err(error) = fs::write(&temp, bytes).and_then(|_| fs::rename(&temp, path)) {
        let _ = fs::remove_file(&temp);
        return Err(error.into());
    }
    Ok(())
}

/// Identificador apto para nombre de archivo (UUID de factura).
pub fn safe_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Nombre simple dentro de una carpeta (sin separadores ni `..`).
pub fn safe_file_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 200
        && name != "."
        && name != ".."
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Tamaño total y cantidad de archivos de una carpeta (recursivo). Carpeta inexistente = (0, 0).
pub fn dir_size(path: &Path) -> (u64, u64) {
    let mut bytes = 0;
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                let (b, c) = dir_size(&entry.path());
                bytes += b;
                count += c;
            } else {
                bytes += meta.len();
                count += 1;
            }
        }
    }
    (bytes, count)
}

pub fn unique_suffix() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}-{}-{}", std::process::id(), COUNTER.fetch_add(1, Ordering::Relaxed))
}

pub fn db_path(data_dir: &Path) -> PathBuf {
    data_dir.join("jcmotors.db")
}

pub fn facturas_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("facturas")
}

pub fn auto_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("respaldos-auto")
}

pub fn ensure_dir(path: &Path) -> R<()> {
    if path.exists() && !path.is_dir() {
        return err("Una ruta de datos no es una carpeta.");
    }
    fs::create_dir_all(path)?;
    Ok(())
}

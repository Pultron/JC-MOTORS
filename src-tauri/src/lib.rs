use std::fs::{self, OpenOptions};
use std::io::Write;
use tauri::Manager;

#[tauri::command]
fn save_quotation_pdf(
    app: tauri::AppHandle,
    folio: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if !bytes.starts_with(b"%PDF-") {
        return Err("El archivo generado no es un PDF válido".into());
    }

    let safe_folio: String = folio
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || *character == '-' || *character == '_'
        })
        .take(80)
        .collect();
    if safe_folio.is_empty() {
        return Err("El folio de la cotización no es válido".into());
    }

    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&downloads).map_err(|error| error.to_string())?;

    for copy in 0..1000 {
        let file_name = if copy == 0 {
            format!("{safe_folio}.pdf")
        } else {
            format!("{safe_folio} ({copy}).pdf")
        };
        let path = downloads.join(file_name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                if let Err(error) = file.write_all(&bytes) {
                    drop(file);
                    let _ = fs::remove_file(&path);
                    return Err(error.to_string());
                }
                return Ok(path.to_string_lossy().into_owned());
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }

    Err("Hay demasiados archivos con este folio en Descargas".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_quotation_pdf])
        .run(tauri::generate_context!())
        .expect("error while running JC Motors Cotizador");
}

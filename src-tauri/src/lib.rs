use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
fn save_quotation_pdf(
    app: tauri::AppHandle,
    folio: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
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
    let selected_path = app
        .dialog()
        .file()
        .set_title("Guardar cotización como PDF")
        .set_directory(downloads)
        .set_file_name(format!("{safe_folio}.pdf"))
        .add_filter("Documento PDF", &["pdf"])
        .blocking_save_file();
    let Some(selected_path) = selected_path else {
        return Ok(None);
    };
    let mut path: PathBuf = selected_path.into_path().map_err(|error| error.to_string())?;
    if !path.extension().is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case("pdf")) {
        path.set_extension("pdf");
    }
    fs::write(&path, &bytes).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_quotation_pdf])
        .run(tauri::generate_context!())
        .expect("error while running JC Motors Cotizador");
}

use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

fn save_pdf(
    app: &tauri::AppHandle,
    title: &str,
    name: &str,
    bytes: &[u8],
) -> Result<Option<String>, String> {
    if !bytes.starts_with(b"%PDF-") {
        return Err("El archivo generado no es un PDF válido".into());
    }
    save_file(app, title, name, bytes, "pdf", "Documento PDF")
}

fn save_file(
    app: &tauri::AppHandle,
    title: &str,
    name: &str,
    bytes: &[u8],
    extension_name: &str,
    filter_name: &str,
) -> Result<Option<String>, String> {

    let safe_name: String = name
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(*character, '-' | '_' | ' ')
        })
        .take(80)
        .collect();
    if safe_name.is_empty() {
        return Err("El nombre del archivo no es válido".into());
    }

    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    let selected_path = app
        .dialog()
        .file()
        .set_title(title)
        .set_directory(downloads)
        .set_file_name(format!("{safe_name}.{extension_name}"))
        .add_filter(filter_name, &[extension_name])
        .blocking_save_file();
    let Some(selected_path) = selected_path else {
        return Ok(None);
    };
    let mut path: PathBuf = selected_path.into_path().map_err(|error| error.to_string())?;
    if !path.extension().is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case(extension_name)) {
        path.set_extension(extension_name);
    }
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn save_quotation_pdf(
    app: tauri::AppHandle,
    folio: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    save_pdf(&app, "Guardar cotización como PDF", &folio, &bytes)
}

#[tauri::command]
fn save_invoice_pdf(
    app: tauri::AppHandle,
    folio: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    save_pdf(&app, "Guardar factura como PDF", &folio, &bytes)
}

#[tauri::command]
fn save_invoice_xml(
    app: tauri::AppHandle,
    folio: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    save_file(&app, "Guardar factura como XML", &folio, &bytes, "xml", "Documento XML")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_quotation_pdf, save_invoice_pdf, save_invoice_xml])
        .run(tauri::generate_context!())
        .expect("error while running JC Motors Cotizador");
}

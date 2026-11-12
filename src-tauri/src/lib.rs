pub mod backup;
pub mod db;
pub mod error;
pub mod files;
pub mod migrate;
pub mod store;
#[cfg(test)]
mod tests;

use rusqlite::Connection;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

/// Estado administrado: la única conexión abierta y el respaldo preparado por `backup_pick`.
#[derive(Default)]
struct AppState {
    conn: Mutex<Option<Connection>>,
    staged: Mutex<Option<backup::Staged>>,
}

const LOCKED: &str = "La base de datos está ocupada; intenta de nuevo.";

/// Carpeta de datos. `JCM_DATA_DIR` existe SOLO para pruebas aisladas; en uso normal es `app_data_dir`.
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(custom) = std::env::var_os("JCM_DATA_DIR") {
        return Ok(PathBuf::from(custom));
    }
    app.path().app_data_dir().map_err(|error| error.to_string())
}

/// Los ganchos de falla simulada solo funcionan en el entorno de pruebas aisladas.
fn test_hook(name: &str) -> bool {
    std::env::var_os("JCM_DATA_DIR").is_some() && std::env::var_os(name).is_some()
}

fn with_conn<T>(state: &AppState, f: impl FnOnce(&Connection) -> error::R<T>) -> Result<T, String> {
    let guard = state.conn.lock().map_err(|_| LOCKED.to_string())?;
    let conn = guard.as_ref().ok_or_else(|| "La base de datos no está abierta.".to_string())?;
    f(conn).map_err(String::from)
}

#[tauri::command]
async fn db_open(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<db::DbStatus, String> {
    let dir = data_dir(&app)?;
    let mut guard = state.conn.lock().map_err(|_| LOCKED.to_string())?;
    let mut moved = None;
    if guard.is_none() {
        let _ = fs::create_dir_all(&dir);
        db::cleanup_stale(&dir);
        let opened = db::open_db(&dir).map_err(String::from)?;
        moved = opened.corrupt_moved_to;
        *guard = Some(opened.conn);
    }
    let conn = guard.as_ref().ok_or_else(|| "La base de datos no está abierta.".to_string())?;
    db::status(conn, &dir, moved).map_err(String::from)
}

#[tauri::command]
async fn db_load_snapshot(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    let dir = data_dir(&app)?;
    with_conn(&state, |conn| store::snapshot(conn, &dir))
}

#[tauri::command]
async fn db_apply(app: tauri::AppHandle, state: State<'_, AppState>, changes: Vec<store::Change>) -> Result<(), String> {
    let dir = data_dir(&app)?;
    with_conn(&state, |conn| store::apply_changes(conn, &dir, &changes))
}

#[tauri::command]
async fn db_mark_initialized(state: State<'_, AppState>) -> Result<(), String> {
    with_conn(&state, db::mark_initialized)
}

#[tauri::command]
async fn db_migrate_from_local(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    keys: HashMap<String, String>,
) -> Result<migrate::MigrationReport, String> {
    let dir = data_dir(&app)?;
    let fail = test_hook("JCM_TEST_FAIL_MIGRATION");
    with_conn(&state, |conn| migrate::migrate_from_local(conn, &dir, &keys, chrono::Local::now(), fail))
}

#[tauri::command]
async fn db_usage(app: tauri::AppHandle) -> Result<backup::Usage, String> {
    Ok(backup::usage(&data_dir(&app)?))
}

#[tauri::command]
async fn db_auto_backup(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let dir = data_dir(&app)?;
    with_conn(&state, |conn| backup::auto_backup(conn, &dir, chrono::Local::now()))
}

#[tauri::command]
async fn backup_export(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Option<backup::ExportResult>, String> {
    let dir = data_dir(&app)?;
    let downloads = app.path().download_dir().map_err(|error| error.to_string())?;
    let selected = app
        .dialog()
        .file()
        .set_title("Guardar respaldo de JC Motors")
        .set_directory(downloads)
        .set_file_name(backup::default_export_name(chrono::Local::now()))
        .add_filter("Respaldo JC Motors", &["jcm"])
        .blocking_save_file();
    let Some(selected) = selected else { return Ok(None) };
    let mut path: PathBuf = selected.into_path().map_err(|error| error.to_string())?;
    if !path.extension().is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case("jcm")) {
        path.set_extension("jcm");
    }
    with_conn(&state, |conn| backup::export_to(conn, &dir, &path, chrono::Utc::now())).map(Some)
}

#[tauri::command]
async fn backup_pick(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Option<backup::PickedBackup>, String> {
    let dir = data_dir(&app)?;
    let selected = app
        .dialog()
        .file()
        .set_title("Elegir respaldo de JC Motors")
        .add_filter("Respaldo JC Motors", &["jcm", "json"])
        .blocking_pick_file();
    let Some(selected) = selected else { return Ok(None) };
    let path: PathBuf = selected.into_path().map_err(|error| error.to_string())?;
    if let Some(previous) = state.staged.lock().map_err(|_| LOCKED.to_string())?.take() {
        previous.discard();
    }
    let has_data = with_conn(&state, store::has_data)?;
    let (staged, summary) = backup::stage_backup(&dir, &path, has_data).map_err(String::from)?;
    *state.staged.lock().map_err(|_| LOCKED.to_string())? = Some(staged);
    Ok(Some(summary))
}

#[tauri::command]
async fn backup_apply(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<backup::RestoreResult, String> {
    let dir = data_dir(&app)?;
    let staged = state
        .staged
        .lock()
        .map_err(|_| LOCKED.to_string())?
        .clone()
        .ok_or_else(|| "No hay un respaldo preparado. Elige el archivo de nuevo.".to_string())?;
    let fail = test_hook("JCM_TEST_FAIL_RESTORE");
    let result = {
        let mut guard = state.conn.lock().map_err(|_| LOCKED.to_string())?;
        backup::restore(&mut guard, &dir, &staged, chrono::Local::now(), fail).map_err(String::from)
    };
    if result.is_ok() {
        staged.discard();
        *state.staged.lock().map_err(|_| LOCKED.to_string())? = None;
    }
    result
}

#[tauri::command]
async fn backup_discard(state: State<'_, AppState>) -> Result<(), String> {
    if let Some(previous) = state.staged.lock().map_err(|_| LOCKED.to_string())?.take() {
        previous.discard();
    }
    Ok(())
}

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

#[tauri::command]
fn save_backup_json(
    app: tauri::AppHandle,
    folio: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    if !bytes.starts_with(b"{") {
        return Err("El respaldo generado no es válido".into());
    }
    save_file(&app, "Guardar respaldo de JC Motors", &folio, &bytes, "json", "Respaldo JC Motors")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            save_quotation_pdf,
            save_invoice_pdf,
            save_invoice_xml,
            save_backup_json,
            db_open,
            db_load_snapshot,
            db_apply,
            db_mark_initialized,
            db_migrate_from_local,
            db_usage,
            db_auto_backup,
            backup_export,
            backup_pick,
            backup_apply,
            backup_discard
        ])
        .run(tauri::generate_context!())
        .expect("error while running JC Motors Cotizador");
}

pub mod backup;
pub mod close_guard;
pub mod db;
pub mod drop_files;
pub mod error;
pub mod files;
pub mod migrate;
pub mod share;
pub mod store;
pub mod wipe;
#[cfg(test)]
mod share_tests;
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
    /// The single backup file dropped on the window; only `backup_pick_dropped` consumes it.
    dropped: Mutex<Option<PathBuf>>,
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

/// Validates and prepares `path` (never given by JavaScript: it comes from the native dialog or from a window drop).
fn stage_path(dir: &std::path::Path, state: &AppState, path: &std::path::Path) -> Result<backup::PickedBackup, String> {
    if let Some(previous) = state.staged.lock().map_err(|_| LOCKED.to_string())?.take() {
        previous.discard();
    }
    let has_data = with_conn(state, store::has_data)?;
    let (staged, summary) = backup::stage_backup(dir, path, has_data).map_err(String::from)?;
    *state.staged.lock().map_err(|_| LOCKED.to_string())? = Some(staged);
    Ok(summary)
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
    stage_path(&dir, &state, &path).map(Some)
}

/// Stages the file the user dropped on the window. Takes no arguments: the path was stored by the window-event handler.
#[tauri::command]
async fn backup_pick_dropped(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Option<backup::PickedBackup>, String> {
    let dir = data_dir(&app)?;
    let Some(path) = state.dropped.lock().map_err(|_| LOCKED.to_string())?.take() else { return Ok(None) };
    stage_path(&dir, &state, &path).map(Some)
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
async fn wipe_all_data(app: tauri::AppHandle, state: State<'_, AppState>, include_workshop: bool) -> Result<wipe::WipeResult, String> {
    let dir = data_dir(&app)?;
    let hooks = wipe::WipeHooks { fail_backup: test_hook("JCM_TEST_FAIL_WIPE_BACKUP"), fail_midway: test_hook("JCM_TEST_FAIL_WIPE") };
    with_conn(&state, |conn| wipe::wipe_all(conn, &dir, include_workshop, chrono::Local::now(), hooks))
}

#[tauri::command]
async fn backup_discard(state: State<'_, AppState>) -> Result<(), String> {
    *state.dropped.lock().map_err(|_| LOCKED.to_string())? = None;
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

/// Guarda el PDF a compartir en `<datos>/enviados/` y devuelve la ruta completa.
#[tauri::command]
async fn save_shared_pdf(app: tauri::AppHandle, filename_base: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = share::shared_dir(&data_dir(&app)?);
    let path = share::save_shared_pdf_in(&dir, &filename_base, &bytes).map_err(String::from)?;
    Ok(path.to_string_lossy().into_owned())
}

/// Pone el archivo (CF_HDROP) en el portapapeles para pegarlo en WhatsApp. Solo archivos de `enviados/`.
#[tauri::command]
async fn copy_file_to_clipboard(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dir = share::shared_dir(&data_dir(&app)?);
    let file = share::validate_shared_path(&dir, &path).map_err(String::from)?;
    #[cfg(windows)]
    {
        let window = app.get_webview_window("main").ok_or("No se encontró la ventana principal.")?;
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        share::put_file_on_clipboard(hwnd.0 as _, &file).map_err(String::from)
    }
    #[cfg(not(windows))]
    {
        let _ = file;
        Err("Copiar al portapapeles solo está disponible en Windows.".to_string())
    }
}

/// Abre el Explorador con el archivo seleccionado. Solo archivos de `enviados/`.
#[tauri::command]
async fn reveal_in_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dir = share::shared_dir(&data_dir(&app)?);
    let file = share::validate_shared_path(&dir, &path).map_err(String::from)?;
    share::reveal(&file).map_err(String::from)
}

#[tauri::command]
async fn open_whatsapp(phone: String, text: String) -> Result<(), String> {
    let url = share::whatsapp_url(&phone, &text).map_err(String::from)?;
    share::open_url(&url).map_err(String::from)
}

#[tauri::command]
async fn open_mailto(email: String, subject: String, body: String) -> Result<(), String> {
    let url = share::mailto_url(&email, &subject, &body).map_err(String::from)?;
    share::open_url(&url).map_err(String::from)
}

#[tauri::command]
async fn open_gmail(email: String, subject: String, body: String) -> Result<(), String> {
    let url = share::gmail_url(&email, &subject, &body).map_err(String::from)?;
    share::open_url(&url).map_err(String::from)
}

/// The page reports whether it has unsaved changes. Only a boolean; also clears any pending close.
#[tauri::command]
fn set_close_guard(guard: tauri::State<close_guard::CloseGuard>, active: bool) {
    guard.set_active(active);
}

/// Closes the app's own main window (the page calls it after the user chose to leave). Takes no arguments.
#[tauri::command]
fn close_app_window(app: tauri::AppHandle, guard: tauri::State<close_guard::CloseGuard>) -> Result<(), String> {
    guard.set_active(false);
    let window = app.get_webview_window("main").ok_or("No se encontró la ventana principal.")?;
    window.destroy().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .manage(close_guard::CloseGuard::default())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if window.state::<close_guard::CloseGuard>().on_close_requested() {
                        api.prevent_close();
                        if let Some(webview) = window.app_handle().get_webview_window("main") {
                            // Constant script, no user data; evaluated from Rust so no event permission is needed.
                            let _ = webview.eval(close_guard::CLOSE_REQUESTED_SCRIPT);
                        }
                    }
                }
                tauri::WindowEvent::DragDrop(drag) => {
                    let Some(webview) = window.app_handle().get_webview_window("main") else { return };
                    match drag {
                        tauri::DragDropEvent::Enter { .. } => {
                            let _ = webview.eval(drop_files::DRAG_ENTER_SCRIPT);
                        }
                        tauri::DragDropEvent::Leave => {
                            let _ = webview.eval(drop_files::DRAG_LEAVE_SCRIPT);
                        }
                        tauri::DragDropEvent::Drop { paths, .. } => match drop_files::accepted_drop(paths) {
                            Some(path) => {
                                if let Ok(mut slot) = window.state::<AppState>().dropped.lock() {
                                    *slot = Some(path);
                                }
                                let _ = webview.eval(drop_files::DROPPED_SCRIPT);
                            }
                            None => {
                                let _ = webview.eval(drop_files::REJECTED_SCRIPT);
                            }
                        },
                        _ => {}
                    }
                }
                _ => {}
            }
        })
        .setup(|app| {
            // Limpieza de PDF compartidos con más de 30 días; los errores se ignoran.
            if let Ok(dir) = data_dir(app.handle()) {
                share::cleanup_shared_dir(&dir);
            }
            Ok(())
        })
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
            backup_pick_dropped,
            backup_apply,
            backup_discard,
            wipe_all_data,
            save_shared_pdf,
            copy_file_to_clipboard,
            reveal_in_folder,
            open_whatsapp,
            open_mailto,
            open_gmail,
            set_close_guard,
            close_app_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running JC Motors Cotizador");
}

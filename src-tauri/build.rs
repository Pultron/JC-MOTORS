fn main() {
    // Declare the app's own commands so Tauri generates one permission per command (allow-<command>).
    // The capability then lists exactly these and nothing else (see docs/SECURITY.md).
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "save_quotation_pdf",
                "save_invoice_pdf",
                "save_invoice_xml",
                "save_backup_json",
                "db_open",
                "db_load_snapshot",
                "db_apply",
                "db_mark_initialized",
                "db_migrate_from_local",
                "db_usage",
                "db_auto_backup",
                "backup_export",
                "backup_pick",
                "backup_apply",
                "backup_discard",
                "save_shared_pdf",
                "copy_file_to_clipboard",
                "reveal_in_folder",
                "open_whatsapp",
                "open_mailto",
                "open_gmail",
                "set_close_guard",
                "close_app_window",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}

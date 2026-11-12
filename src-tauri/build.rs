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
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}

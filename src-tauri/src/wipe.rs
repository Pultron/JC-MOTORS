//! "Borrar todos los datos": copia previa verificada, borrado en UNA transacción y, solo después del
//! commit, limpieza de los archivos de facturas y enviados. Nada de esto toca `respaldos-auto/`.
use crate::backup;
use crate::error::{err, R};
use crate::files::{auto_dir, ensure_dir, facturas_dir};
use crate::share::SHARED_DIR_NAME;
use crate::store::{self, K_AUTOSAVE, K_BUSINESS};
use chrono::{DateTime, Local, Utc};
use rusqlite::Connection;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Tablas de negocio, de los hijos a los padres (las claves foráneas están activas).
const BUSINESS_TABLES: [&str; 10] = [
    "invoice_files",
    "invoices",
    "quotation_items",
    "quotations",
    "customers",
    "vehicles",
    "templates",
    "internal_costs",
    "internal_controls",
    "quote_drafts",
];

/// Ganchos de falla simulada; solo las pruebas (y el entorno aislado de `lib.rs`) los activan.
#[derive(Default, Clone, Copy)]
pub struct WipeHooks {
    pub fail_backup: bool,
    /// Falla a mitad de la transacción, con filas ya borradas, para comprobar el rollback.
    pub fail_midway: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WipeResult {
    pub quotations: i64,
    pub customers: i64,
    pub invoices: i64,
    pub backup_path: String,
    pub files_removed: u64,
    /// Archivos que no se pudieron borrar tras el commit (los datos ya están limpios; quedan huérfanos).
    pub files_failed: u64,
}

fn backup_destination(data_dir: &Path, now: DateTime<Local>) -> PathBuf {
    let dir = auto_dir(data_dir);
    let stem = format!("antes-de-borrar-{}", now.format("%Y-%m-%d-%H%M"));
    let mut candidate = dir.join(format!("{stem}.jcm"));
    let mut n = 2;
    // Nunca se pisa la copia previa de un borrado anterior.
    while candidate.exists() {
        candidate = dir.join(format!("{stem}-{n}.jcm"));
        n += 1;
    }
    candidate
}

fn make_prewipe_backup(conn: &Connection, data_dir: &Path, now: DateTime<Local>, hooks: WipeHooks) -> R<PathBuf> {
    if hooks.fail_backup {
        return err("Falla simulada de la copia previa.");
    }
    ensure_dir(&auto_dir(data_dir))?;
    let dest = backup_destination(data_dir, now);
    backup::export_to(conn, data_dir, &dest, Utc::now())?;
    if !dest.is_file() {
        return err("No se pudo comprobar la copia previa.");
    }
    backup::read_jcm(&dest, None)?;
    Ok(dest)
}

/// Borra el contenido de una carpeta y conserva la carpeta. Devuelve (borrados, fallidos).
fn empty_dir(dir: &Path) -> (u64, u64) {
    let Ok(entries) = fs::read_dir(dir) else { return (0, 0) };
    let (mut removed, mut failed) = (0, 0);
    for entry in entries.flatten() {
        let path = entry.path();
        let ok = if path.is_dir() { fs::remove_dir_all(&path).is_ok() } else { fs::remove_file(&path).is_ok() };
        if ok {
            removed += 1;
        } else {
            failed += 1;
        }
    }
    (removed, failed)
}

pub fn wipe_all(conn: &Connection, data_dir: &Path, include_workshop: bool, now: DateTime<Local>, hooks: WipeHooks) -> R<WipeResult> {
    // 1. Copia previa verificada: si falla, no se borra nada.
    let backup_path = make_prewipe_backup(conn, data_dir, now, hooks)?;
    let counts = store::counts(conn)?;

    // 2. Una sola transacción; cualquier error la deshace por completo.
    let tx = conn.unchecked_transaction()?;
    for (index, table) in BUSINESS_TABLES.iter().enumerate() {
        tx.execute(&format!("DELETE FROM {table}"), [])?;
        if hooks.fail_midway && index == 3 {
            return err("Falla simulada durante el borrado.");
        }
    }
    // Los consecutivos vuelven a cero: la siguiente cotización es JC-0001 y la factura 0001.
    tx.execute("UPDATE counters SET last_number = 0", [])?;
    tx.execute("DELETE FROM sqlite_sequence WHERE name = 'vehicles'", [])?;
    tx.execute("DELETE FROM settings WHERE key = ?1", [K_AUTOSAVE])?;
    if include_workshop {
        tx.execute("DELETE FROM settings WHERE key = ?1", [K_BUSINESS])?;
    }
    // `meta` (initialized, created_at, local_migration) y el resto de `settings` no se tocan.
    tx.commit()?;

    // 3. Solo con la base ya limpia se vacían las carpetas (las carpetas y respaldos-auto/ se conservan).
    let (r1, f1) = empty_dir(&facturas_dir(data_dir));
    let (r2, f2) = empty_dir(&data_dir.join(SHARED_DIR_NAME));
    Ok(WipeResult {
        quotations: counts.quotations,
        customers: counts.customers,
        invoices: counts.invoices,
        backup_path: backup_path.to_string_lossy().into_owned(),
        files_removed: r1 + r2,
        files_failed: f1 + f2,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::store::{apply_changes, Change, K_CUSTOMERS, K_INVOICES, K_INVOICE_FOLIO, K_QUOTATIONS, K_QUOTATION_FOLIO, K_SCHEMA};
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    use serde_json::{json, Value};
    use tempfile::TempDir;

    fn change(key: &str, value: String) -> Change {
        Change { key: key.into(), value: Some(value) }
    }

    fn seeded(dir: &Path) -> Connection {
        let conn = db::open_db(dir).unwrap().conn;
        db::mark_initialized(&conn).unwrap();
        let quotation = json!({
            "id": "q-1", "folio": "JC-0007", "createdAt": "2026-10-01T10:00:00.000Z", "status": "Pendiente", "customerId": "c1",
            "customer": {"name": "Ana", "phone": "6671234567"}, "vehicle": {"make": "Nissan", "model": "Sentra", "year": 2020, "plates": "ABC"},
            "items": [{"id": "i-1", "type": "part", "description": "Filtro", "quantity": 2, "saleUnitPrice": 100.5, "amount": 201}],
            "includeVat": true, "subtotalNeto": 201, "ivaAmount": 32.16, "total": 233.16
        });
        let invoice = json!({
            "folio": 1, "uuid": "uuid-1", "fechaEmision": "2026-10-02T09:00:00", "total": "1001.50", "estado": "timbrada",
            "archivoOriginal": B64.encode(b"%PDF-1.4 factura"), "archivoTipo": "pdf", "archivoNombre": "f1.pdf", "conceptos": []
        });
        let changes = vec![
            change(K_QUOTATIONS, Value::Array(vec![quotation]).to_string()),
            change(K_CUSTOMERS, Value::Array(vec![json!({"id": "c1", "name": "Ana", "aliases": []})]).to_string()),
            change(K_INVOICES, Value::Array(vec![invoice]).to_string()),
            change(K_QUOTATION_FOLIO, "{\"lastNumber\":9}".into()),
            change(K_INVOICE_FOLIO, "4".into()),
            change(K_BUSINESS, "{\"name\":\"JC\"}".into()),
            change(K_SCHEMA, "{\"quotations\":1}".into()),
        ];
        apply_changes(&conn, dir, &changes).unwrap();
        fs::create_dir_all(dir.join(SHARED_DIR_NAME)).unwrap();
        fs::write(dir.join(SHARED_DIR_NAME).join("cotizacion.pdf"), b"%PDF-1.4 x").unwrap();
        conn
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap()
    }

    fn setting(conn: &Connection, key: &str) -> Option<String> {
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).ok()
    }

    fn dir_entries(dir: &Path) -> usize {
        fs::read_dir(dir).map(|e| e.count()).unwrap_or(0)
    }

    #[test]
    fn success_wipes_data_resets_folios_and_removes_files_but_keeps_auto_backups() {
        let tmp = TempDir::new().unwrap();
        let conn = seeded(tmp.path());
        assert!(dir_entries(&facturas_dir(tmp.path())) > 0);
        ensure_dir(&auto_dir(tmp.path())).unwrap();
        fs::write(auto_dir(tmp.path()).join("auto-2026-10-01-1000.db"), b"keep").unwrap();

        let result = wipe_all(&conn, tmp.path(), false, Local::now(), WipeHooks::default()).unwrap();

        assert_eq!((result.quotations, result.customers, result.invoices), (1, 1, 1));
        for table in BUSINESS_TABLES {
            assert_eq!(count(&conn, table), 0, "{table}");
        }
        assert_eq!(store::counter(&conn, "quotation").unwrap(), 0);
        assert_eq!(store::counter(&conn, "invoice").unwrap(), 0);
        assert_eq!(dir_entries(&facturas_dir(tmp.path())), 0);
        assert!(facturas_dir(tmp.path()).is_dir());
        assert_eq!(dir_entries(&tmp.path().join(SHARED_DIR_NAME)), 0);
        assert!(tmp.path().join(SHARED_DIR_NAME).is_dir());
        assert!(auto_dir(tmp.path()).join("auto-2026-10-01-1000.db").is_file());
        assert!(Path::new(&result.backup_path).is_file());
        assert!(result.backup_path.contains("antes-de-borrar-") && result.backup_path.ends_with(".jcm"));
        assert!(Path::new(&result.backup_path).starts_with(auto_dir(tmp.path())));
        // Still "initialized" so the app never re-imports from localStorage.
        assert_eq!(db::meta_get(&conn, "initialized").unwrap().as_deref(), Some("1"));
        assert!(setting(&conn, K_SCHEMA).is_some());
    }

    #[test]
    fn workshop_settings_survive_unless_requested() {
        let tmp = TempDir::new().unwrap();
        let conn = seeded(tmp.path());
        wipe_all(&conn, tmp.path(), false, Local::now(), WipeHooks::default()).unwrap();
        assert!(setting(&conn, K_BUSINESS).is_some());

        let tmp2 = TempDir::new().unwrap();
        let conn2 = seeded(tmp2.path());
        wipe_all(&conn2, tmp2.path(), true, Local::now(), WipeHooks::default()).unwrap();
        assert!(setting(&conn2, K_BUSINESS).is_none());
        assert_eq!(db::meta_get(&conn2, "initialized").unwrap().as_deref(), Some("1"));
    }

    #[test]
    fn backup_failure_deletes_nothing() {
        let tmp = TempDir::new().unwrap();
        let conn = seeded(tmp.path());
        let files_before = dir_entries(&facturas_dir(tmp.path()));
        let hooks = WipeHooks { fail_backup: true, fail_midway: false };
        assert!(wipe_all(&conn, tmp.path(), true, Local::now(), hooks).is_err());
        assert_eq!(count(&conn, "quotations"), 1);
        assert_eq!(count(&conn, "invoices"), 1);
        assert_eq!(store::counter(&conn, "quotation").unwrap(), 9);
        assert!(setting(&conn, K_BUSINESS).is_some());
        assert_eq!(dir_entries(&facturas_dir(tmp.path())), files_before);
        assert_eq!(dir_entries(&tmp.path().join(SHARED_DIR_NAME)), 1);
    }

    #[test]
    fn midway_failure_rolls_back_data_and_keeps_files() {
        let tmp = TempDir::new().unwrap();
        let conn = seeded(tmp.path());
        let files_before = dir_entries(&facturas_dir(tmp.path()));
        let hooks = WipeHooks { fail_backup: false, fail_midway: true };
        assert!(wipe_all(&conn, tmp.path(), true, Local::now(), hooks).is_err());
        assert_eq!(count(&conn, "quotations"), 1);
        assert_eq!(count(&conn, "quotation_items"), 1);
        assert_eq!(count(&conn, "customers"), 1);
        assert_eq!(count(&conn, "invoices"), 1);
        assert_eq!(count(&conn, "invoice_files"), 1);
        assert_eq!(store::counter(&conn, "invoice").unwrap(), 4);
        assert!(setting(&conn, K_BUSINESS).is_some());
        assert_eq!(dir_entries(&facturas_dir(tmp.path())), files_before);
        assert_eq!(dir_entries(&tmp.path().join(SHARED_DIR_NAME)), 1);
        // The connection is usable again (no dangling transaction).
        assert!(conn.execute("UPDATE counters SET last_number = last_number", []).is_ok());
    }

    #[test]
    fn repeated_wipes_in_the_same_minute_do_not_overwrite_the_previous_backup() {
        let tmp = TempDir::new().unwrap();
        let conn = seeded(tmp.path());
        let now = Local::now();
        let first = wipe_all(&conn, tmp.path(), false, now, WipeHooks::default()).unwrap();
        let second = wipe_all(&conn, tmp.path(), false, now, WipeHooks::default()).unwrap();
        assert_ne!(first.backup_path, second.backup_path);
        assert!(Path::new(&first.backup_path).is_file() && Path::new(&second.backup_path).is_file());
    }
}

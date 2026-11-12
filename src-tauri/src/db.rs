use crate::error::{err, R};
use crate::files::{db_path, ensure_dir};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use std::fs;
use std::path::Path;

pub const CURRENT_VERSION: i64 = 1;

const V1: &str = r#"
CREATE TABLE quotations (
  id TEXT PRIMARY KEY, position INTEGER NOT NULL, folio TEXT, created_at TEXT, status TEXT,
  customer_id TEXT, customer_name TEXT, total_cents INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL
);
CREATE INDEX quotations_created ON quotations(created_at DESC);
CREATE INDEX quotations_status ON quotations(status);
CREATE INDEX quotations_folio ON quotations(folio);
CREATE TABLE quotation_items (
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, item_id TEXT, type TEXT, description TEXT, quantity REAL,
  sale_unit_price_cents INTEGER, amount_cents INTEGER,
  PRIMARY KEY (quotation_id, position)
);
CREATE TABLE customers (
  id TEXT PRIMARY KEY, position INTEGER NOT NULL, name TEXT, phone TEXT, data TEXT NOT NULL
);
CREATE INDEX customers_phone ON customers(phone);
CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id TEXT NOT NULL DEFAULT '',
  make TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', year INTEGER, plates TEXT NOT NULL DEFAULT '',
  UNIQUE (customer_id, plates, make, model)
);
CREATE TABLE invoices (
  uuid TEXT PRIMARY KEY, position INTEGER NOT NULL, folio INTEGER, fecha_emision TEXT,
  total_text TEXT, total_cents INTEGER NOT NULL DEFAULT 0, estado TEXT, data TEXT NOT NULL
);
CREATE TABLE invoice_files (
  invoice_uuid TEXT PRIMARY KEY REFERENCES invoices(uuid) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pdf','xml')), name TEXT NOT NULL DEFAULT '',
  rel_path TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL
);
CREATE TABLE templates (id TEXT PRIMARY KEY, position INTEGER NOT NULL, name TEXT, data TEXT NOT NULL);
CREATE TABLE internal_costs (quote_id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE internal_controls (quotation_id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE quote_drafts (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE counters (name TEXT PRIMARY KEY, last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0));
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO counters (name, last_number) VALUES ('quotation', 0), ('invoice', 0);
"#;

/// La i-ésima migración lleva el esquema de la versión i a i+1.
const MIGRATIONS: &[&str] = &[V1];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DbStatus {
    pub initialized: bool,
    pub schema_version: i64,
    pub local_migration_done: bool,
    pub corrupt_moved_to: Option<String>,
    pub data_dir: String,
}

pub struct Opened {
    pub conn: Connection,
    pub corrupt_moved_to: Option<String>,
}

pub fn user_version(conn: &Connection) -> R<i64> {
    Ok(conn.query_row("PRAGMA user_version", [], |row| row.get(0))?)
}

/// Aplica las migraciones pendientes, cada una en su propia transacción. Rechaza una base más nueva que la app.
pub fn migrate(conn: &Connection) -> R<()> {
    let version = user_version(conn)?;
    if version > CURRENT_VERSION {
        return err("La base de datos es de una versión más nueva; actualiza el sistema primero.");
    }
    for index in version..CURRENT_VERSION {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(MIGRATIONS[index as usize])?;
        tx.execute_batch(&format!("PRAGMA user_version = {}", index + 1))?;
        tx.commit()?;
    }
    Ok(())
}

pub fn integrity_ok(conn: &Connection) -> bool {
    conn.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        .map(|result| result == "ok")
        .unwrap_or(false)
}

fn looks_healthy(path: &Path) -> bool {
    match Connection::open(path) {
        Ok(conn) => integrity_ok(&conn),
        Err(_) => false,
    }
}

/// Abre (o crea) la base. Si el archivo existente no pasa `integrity_check`, se aparta como
/// `jcmotors.db.corrupt-<fecha>` y se crea una vacía: nunca se sobrescribe.
pub fn open_db(data_dir: &Path) -> R<Opened> {
    ensure_dir(data_dir)?;
    let path = db_path(data_dir);
    let mut moved = None;
    if path.exists() && !looks_healthy(&path) {
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
        let name = format!("jcmotors.db.corrupt-{stamp}");
        fs::rename(&path, data_dir.join(&name))?;
        for suffix in ["-wal", "-shm"] {
            let sidecar = data_dir.join(format!("jcmotors.db{suffix}"));
            if sidecar.exists() {
                let _ = fs::rename(&sidecar, data_dir.join(format!("{name}{suffix}")));
            }
        }
        moved = Some(name);
    }
    let conn = Connection::open(&path)?;
    conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get::<_, String>(0))?;
    conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;")?;
    migrate(&conn)?;
    Ok(Opened { conn, corrupt_moved_to: moved })
}

pub fn meta_get(conn: &Connection, key: &str) -> R<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| row.get(0))
        .optional()?)
}

pub fn meta_set(conn: &Connection, key: &str, value: &str) -> R<()> {
    conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)", [key, value])?;
    Ok(())
}

pub fn mark_initialized(conn: &Connection) -> R<()> {
    meta_set(conn, "initialized", "1")?;
    if meta_get(conn, "created_at")?.is_none() {
        meta_set(conn, "created_at", &chrono::Utc::now().to_rfc3339())?;
    }
    Ok(())
}

pub fn status(conn: &Connection, data_dir: &Path, corrupt_moved_to: Option<String>) -> R<DbStatus> {
    Ok(DbStatus {
        initialized: meta_get(conn, "initialized")?.as_deref() == Some("1"),
        schema_version: user_version(conn)?,
        local_migration_done: meta_get(conn, "local_migration")?.is_some(),
        corrupt_moved_to,
        data_dir: data_dir.to_string_lossy().into_owned(),
    })
}

/// Borra restos de operaciones interrumpidas (exportaciones/restauraciones a medias). No toca datos.
pub fn cleanup_stale(data_dir: &Path) {
    let Ok(entries) = fs::read_dir(data_dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("tmp-restore-") || name.starts_with("tmp-export-") {
            let _ = fs::remove_dir_all(entry.path());
        } else if name == "jcmotors.db.new" {
            let _ = fs::remove_file(entry.path());
        }
    }
}

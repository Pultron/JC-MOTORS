//! Respaldo `.jcm` (zip), copias automáticas, restauración atómica y uso de espacio.
use crate::db::{self, CURRENT_VERSION};
use crate::error::{err, AppError, R};
use crate::files::*;
use crate::migrate::LastFolio;
use crate::store::{self, Counts};
use chrono::{DateTime, Local, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

pub const MSG_NOT_OURS: &str = "Este archivo no es un respaldo de JC Motors.";
pub const MSG_DAMAGED: &str = "El archivo está dañado y no se puede leer como respaldo de JC Motors.";
pub const MSG_NEWER: &str = "Este respaldo es de una versión más nueva; actualiza el sistema primero.";
pub const MSG_HASH: &str = "El respaldo está dañado: la verificación de integridad (huellas) falló.";
pub const AUTO_KEEP: usize = 7;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub app: String,
    pub format: String,
    pub schema_version: i64,
    pub app_version: String,
    pub exported_at: String,
    pub counts: Counts,
    pub totals_cents: ManifestTotals,
    pub last_folio: ManifestFolio,
    pub files: BTreeMap<String, String>,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ManifestTotals {
    pub quotations: i64,
    pub invoices: i64,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ManifestFolio {
    pub quotation: i64,
    pub invoice: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub size_bytes: u64,
    pub exported_at: String,
    pub counts: Counts,
    pub skipped_files: usize,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PickedBackup {
    pub kind: String,
    pub file_name: String,
    pub exported_at: String,
    pub quotations: i64,
    pub customers: i64,
    pub invoices: i64,
    pub last_quotation_folio: i64,
    pub last_invoice_folio: i64,
    pub has_current_data: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub quotations: i64,
    pub customers: i64,
    pub invoices: i64,
    pub last_quotation_folio: i64,
    pub last_invoice_folio: i64,
    /// Claves que viven fuera de la base (preferencias de interfaz) y que el frontend debe aplicar.
    pub local_keys: HashMap<String, String>,
}

#[derive(Clone, Debug)]
pub enum Staged {
    Jcm { dir: PathBuf },
    Json { claves: HashMap<String, String> },
}

impl Staged {
    pub fn discard(&self) {
        if let Staged::Jcm { dir } = self {
            let _ = fs::remove_dir_all(dir);
        }
    }
}

fn iso(now: DateTime<Utc>) -> String {
    now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn last_folios(conn: &Connection) -> R<LastFolio> {
    Ok(LastFolio { quotation: store::counter(conn, "quotation")?, invoice: store::counter(conn, "invoice")? })
}

/// Copia consistente de la base (nunca se copia el archivo vivo).
pub fn vacuum_into(conn: &Connection, dest: &Path) -> R<()> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    if dest.exists() {
        fs::remove_file(dest)?;
    }
    conn.execute("VACUUM INTO ?1", [dest.to_string_lossy().as_ref()])?;
    Ok(())
}

// ------------------------------------------------------------------ exportar

pub fn default_export_name(now: DateTime<Local>) -> String {
    format!("Respaldo JC Motors {}.jcm", now.format("%Y-%m-%d %H%M"))
}

/// Crea el `.jcm` en `dest`: temporal junto al destino → se reabre y verifica → se renombra.
pub fn export_to(conn: &Connection, data_dir: &Path, dest: &Path, now: DateTime<Utc>) -> R<ExportResult> {
    let work = data_dir.join(format!("tmp-export-{}", unique_suffix()));
    ensure_dir(&work)?;
    let result = export_inner(conn, data_dir, dest, now, &work);
    let _ = fs::remove_dir_all(&work);
    result
}

fn export_inner(conn: &Connection, data_dir: &Path, dest: &Path, now: DateTime<Utc>, work: &Path) -> R<ExportResult> {
    let db_copy = work.join("jcmotors.db");
    vacuum_into(conn, &db_copy)?;
    let counts = store::counts(conn)?;
    let totals = store::totals_cents(conn)?;
    let folios = last_folios(conn)?;
    let schema_version = db::user_version(conn)?;

    let mut files: BTreeMap<String, String> = BTreeMap::new();
    let mut payloads: Vec<(String, PathBuf)> = vec![("jcmotors.db".into(), db_copy.clone())];
    files.insert("jcmotors.db".into(), sha256_file(&db_copy)?);
    let mut skipped = 0;
    let mut stmt = conn.prepare("SELECT rel_path FROM invoice_files ORDER BY rel_path")?;
    let rels = stmt.query_map([], |r| r.get::<_, String>(0))?;
    for rel in rels {
        let rel = rel?;
        let path = data_dir.join(&rel);
        let name_ok = rel.strip_prefix("facturas/").is_some_and(safe_file_name);
        if !name_ok || !path.is_file() {
            skipped += 1;
            continue;
        }
        files.insert(rel.clone(), sha256_file(&path)?);
        payloads.push((rel, path));
    }
    drop(stmt);

    let exported_at = iso(now);
    let manifest = Manifest {
        app: "jc-motors".into(),
        format: "jcm".into(),
        schema_version,
        app_version: env!("CARGO_PKG_VERSION").into(),
        exported_at: exported_at.clone(),
        counts: counts.clone(),
        totals_cents: ManifestTotals { quotations: totals.quotations, invoices: totals.invoices },
        last_folio: ManifestFolio { quotation: folios.quotation, invoice: folios.invoice },
        files,
    };

    let file_name = dest.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "respaldo.jcm".into());
    let temp = dest.with_file_name(format!("{file_name}.tmp"));
    let written = write_zip(&temp, &manifest, &payloads);
    if let Err(error) = written {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    // Se reabre desde el disco y se comparan todas las huellas.
    match read_jcm(&temp, None) {
        Ok(read) if read.files == manifest.files => {}
        Ok(_) => {
            let _ = fs::remove_file(&temp);
            return err("El respaldo escrito no coincide con lo esperado; no se guardó.");
        }
        Err(error) => {
            let _ = fs::remove_file(&temp);
            return Err(AppError(format!("No se pudo verificar el respaldo escrito ({}). No se guardó.", error.0)));
        }
    }
    if let Err(error) = fs::rename(&temp, dest) {
        let _ = fs::remove_file(&temp);
        return Err(error.into());
    }
    let size_bytes = fs::metadata(dest)?.len();
    Ok(ExportResult { path: dest.to_string_lossy().into_owned(), size_bytes, exported_at, counts, skipped_files: skipped })
}

pub(crate) fn write_zip(path: &Path, manifest: &Manifest, payloads: &[(String, PathBuf)]) -> R<()> {
    let file = fs::File::create(path)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("manifest.json", options)?;
    zip.write_all(serde_json::to_string_pretty(manifest)?.as_bytes())?;
    for (name, source) in payloads {
        zip.start_file(name.as_str(), options)?;
        let mut input = fs::File::open(source)?;
        std::io::copy(&mut input, &mut zip)?;
    }
    let file = zip.finish()?;
    file.sync_all()?;
    Ok(())
}

// ------------------------------------------------------------------ leer / validar

fn entry_allowed(name: &str) -> bool {
    name == "jcmotors.db" || name.strip_prefix("facturas/").is_some_and(safe_file_name)
}

/// Lee y valida un `.jcm`: manifest, app, versión y huella de cada archivo. Con `extract_to` también lo extrae.
pub fn read_jcm(path: &Path, extract_to: Option<&Path>) -> R<Manifest> {
    let file = fs::File::open(path).map_err(|_| AppError(MSG_DAMAGED.into()))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| AppError(MSG_DAMAGED.into()))?;
    let manifest: Manifest = {
        let mut entry = archive.by_name("manifest.json").map_err(|_| AppError(MSG_NOT_OURS.into()))?;
        if entry.size() > 5_000_000 {
            return err(MSG_DAMAGED);
        }
        let mut raw = String::new();
        entry.read_to_string(&mut raw).map_err(|_| AppError(MSG_DAMAGED.into()))?;
        let value: Value = serde_json::from_str(&raw).map_err(|_| AppError(MSG_NOT_OURS.into()))?;
        if value.get("app").and_then(Value::as_str) != Some("jc-motors") || value.get("format").and_then(Value::as_str) != Some("jcm") {
            return err(MSG_NOT_OURS);
        }
        match value.get("schemaVersion").and_then(Value::as_i64) {
            Some(version) if version > CURRENT_VERSION => return err(MSG_NEWER),
            Some(version) if version >= 1 => {}
            _ => return err(MSG_NOT_OURS),
        }
        serde_json::from_value(value).map_err(|_| AppError(MSG_NOT_OURS.into()))?
    };
    for index in 0..archive.len() {
        let name = archive.by_index(index).map_err(|_| AppError(MSG_DAMAGED.into()))?.name().to_string();
        if name != "manifest.json" && !manifest.files.contains_key(&name) {
            return err(MSG_HASH);
        }
    }
    for (name, expected) in &manifest.files {
        if !entry_allowed(name) {
            return err(MSG_NOT_OURS);
        }
        let mut entry = archive.by_name(name).map_err(|_| AppError(MSG_HASH.into()))?;
        let mut out = match extract_to {
            Some(root) => {
                let target = root.join(name);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                Some(fs::File::create(target)?)
            }
            None => None,
        };
        let mut hasher = <sha2::Sha256 as sha2::Digest>::new();
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let read = entry.read(&mut buffer).map_err(|_| AppError(MSG_HASH.into()))?;
            if read == 0 {
                break;
            }
            sha2::Digest::update(&mut hasher, &buffer[..read]);
            if let Some(out) = out.as_mut() {
                out.write_all(&buffer[..read])?;
            }
        }
        if hex(sha2::Digest::finalize(hasher)) != *expected {
            return err(MSG_HASH);
        }
    }
    if !manifest.files.contains_key("jcmotors.db") {
        return err(MSG_NOT_OURS);
    }
    Ok(manifest)
}

fn sniff(path: &Path) -> R<&'static str> {
    let mut head = [0u8; 4];
    let read = fs::File::open(path)?.read(&mut head)?;
    let head = &head[..read];
    if head.starts_with(b"PK") {
        return Ok("jcm");
    }
    let trimmed: Vec<u8> = head.iter().copied().skip_while(|b| b.is_ascii_whitespace() || *b == 0xEF || *b == 0xBB || *b == 0xBF).collect();
    if trimmed.first() == Some(&b'{') {
        return Ok("json");
    }
    err(MSG_NOT_OURS)
}

/// Valida y prepara (sin tocar los datos actuales). Devuelve lo preparado y su resumen.
pub fn stage_backup(data_dir: &Path, path: &Path, has_current_data: bool) -> R<(Staged, PickedBackup)> {
    let file_name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    match sniff(path)? {
        "jcm" => stage_jcm(data_dir, path, &file_name, has_current_data),
        _ => stage_json(path, &file_name, has_current_data),
    }
}

fn stage_jcm(data_dir: &Path, path: &Path, file_name: &str, has_current_data: bool) -> R<(Staged, PickedBackup)> {
    let dir = data_dir.join(format!("tmp-restore-{}", unique_suffix()));
    ensure_dir(&dir)?;
    let staged = Staged::Jcm { dir: dir.clone() };
    let result = (|| -> R<PickedBackup> {
        let manifest = read_jcm(path, Some(&dir))?;
        let db_file = dir.join("jcmotors.db");
        let conn = rusqlite::Connection::open(&db_file).map_err(|_| AppError(MSG_DAMAGED.into()))?;
        if !db::integrity_ok(&conn) {
            return err("El respaldo está dañado: la base de datos no pasó la verificación de integridad.");
        }
        let version = db::user_version(&conn)?;
        if version > CURRENT_VERSION {
            return err(MSG_NEWER);
        }
        db::migrate(&conn)?; // versión más vieja: se actualiza la copia extraída, no la base actual.
        let counts = store::counts(&conn)?;
        let folios = last_folios(&conn)?;
        drop(conn);
        Ok(PickedBackup {
            kind: "jcm".into(),
            file_name: file_name.to_string(),
            exported_at: manifest.exported_at,
            quotations: counts.quotations,
            customers: counts.customers,
            invoices: counts.invoices,
            last_quotation_folio: folios.quotation,
            last_invoice_folio: folios.invoice,
            has_current_data,
        })
    })();
    match result {
        Ok(summary) => Ok((staged, summary)),
        Err(error) => {
            staged.discard();
            Err(error)
        }
    }
}

fn stage_json(path: &Path, file_name: &str, has_current_data: bool) -> R<(Staged, PickedBackup)> {
    let raw = fs::read_to_string(path).map_err(|_| AppError(MSG_DAMAGED.into()))?;
    let value: Value = serde_json::from_str(raw.trim_start_matches('\u{feff}')).map_err(|_| AppError(MSG_DAMAGED.into()))?;
    if value.get("app").and_then(Value::as_str) != Some("jc-motors") {
        return err(MSG_NOT_OURS);
    }
    match value.get("schemaVersion").and_then(Value::as_i64) {
        Some(1) => {}
        Some(v) if v > 1 => return err(MSG_NEWER),
        _ => return err(MSG_NOT_OURS),
    }
    let exported_at = value.get("exportedAt").and_then(Value::as_str).filter(|s| chrono::DateTime::parse_from_rfc3339(s).is_ok());
    let Some(exported_at) = exported_at else { return err(MSG_DAMAGED) };
    let Some(Value::Object(map)) = value.get("claves") else { return err(MSG_DAMAGED) };
    let mut claves = HashMap::new();
    for (key, raw) in map {
        let Some(raw) = raw.as_str() else { return err(MSG_DAMAGED) };
        if !store::BACKUP_EXPORT_KEYS.contains(&key.as_str()) {
            return err(MSG_NOT_OURS);
        }
        claves.insert(key.clone(), raw.to_string());
    }
    // Validación temprana de las listas y los consecutivos.
    let mut lists: HashMap<&str, Vec<Value>> = HashMap::new();
    for key in store::LIST_KEYS {
        if let Some(raw) = claves.get(key) {
            lists.insert(key, store::parse_list(key, raw).map_err(|_| AppError(MSG_DAMAGED.into()))?);
        }
    }
    let len = |key: &str| lists.get(key).map(|l| l.len() as i64).unwrap_or(0);
    let empty = Vec::new();
    let counter_q = claves.get(store::K_QUOTATION_FOLIO).map(|r| store::parse_quotation_counter(r)).transpose()?.unwrap_or(0);
    let counter_i = claves.get(store::K_INVOICE_FOLIO).map(|r| store::parse_invoice_counter(r)).transpose()?.unwrap_or(0);
    let summary = PickedBackup {
        kind: "json".into(),
        file_name: file_name.to_string(),
        exported_at: exported_at.to_string(),
        quotations: len(store::K_QUOTATIONS),
        customers: len(store::K_CUSTOMERS),
        invoices: len(store::K_INVOICES),
        last_quotation_folio: counter_q.max(store::highest_quotation_folio(lists.get(store::K_QUOTATIONS).unwrap_or(&empty))),
        last_invoice_folio: counter_i.max(store::highest_invoice_folio(lists.get(store::K_INVOICES).unwrap_or(&empty))),
        has_current_data,
    };
    Ok((Staged::Json { claves }, summary))
}

// ------------------------------------------------------------------ restaurar

/// Copia de los datos actuales antes de reemplazar (solo si hay datos).
fn pre_restore_copy(conn: &Connection, data_dir: &Path, now: DateTime<Local>) -> R<Option<PathBuf>> {
    if !store::has_data(conn)? {
        return Ok(None);
    }
    let dest = auto_dir(data_dir).join(format!("pre-restauracion-{}.db", now.format("%Y-%m-%d-%H%M%S")));
    vacuum_into(conn, &dest)?;
    Ok(Some(dest))
}

pub fn restore(
    slot: &mut Option<Connection>,
    data_dir: &Path,
    staged: &Staged,
    now: DateTime<Local>,
    fail_midway: bool,
) -> R<RestoreResult> {
    let Some(conn) = slot.as_ref() else { return err("La base de datos no está abierta.") };
    pre_restore_copy(conn, data_dir, now)?;
    match staged {
        Staged::Json { claves } => restore_json(conn, data_dir, claves, fail_midway),
        Staged::Jcm { dir } => restore_jcm(slot, data_dir, dir, fail_midway),
    }
}

fn summary_of(conn: &Connection, local_keys: HashMap<String, String>) -> R<RestoreResult> {
    let counts = store::counts(conn)?;
    let folios = last_folios(conn)?;
    Ok(RestoreResult {
        quotations: counts.quotations,
        customers: counts.customers,
        invoices: counts.invoices,
        last_quotation_folio: folios.quotation,
        last_invoice_folio: folios.invoice,
        local_keys,
    })
}

pub fn restore_json(conn: &Connection, data_dir: &Path, claves: &HashMap<String, String>, fail_midway: bool) -> R<RestoreResult> {
    let tx = conn.unchecked_transaction()?;
    let mut fx = store::FileFx::default();
    let result: R<()> = (|| {
        for (index, key) in store::LIST_KEYS.iter().enumerate() {
            match claves.get(*key) {
                Some(raw) => store::apply_key(&tx, data_dir, key, Some(raw), &mut fx)?,
                // Un respaldo anterior a las plantillas no dice nada de ellas: las locales se quedan.
                None if *key == store::K_TEMPLATES || *key == store::K_DRAFTS => {}
                None => store::apply_key(&tx, data_dir, key, None, &mut fx)?,
            }
            if fail_midway && index == 0 {
                return err("Fallo simulado a mitad de la restauración.");
            }
        }
        for key in [store::K_QUOTATION_FOLIO, store::K_INVOICE_FOLIO, store::K_BUSINESS] {
            if let Some(raw) = claves.get(key) {
                store::apply_key(&tx, data_dir, key, Some(raw), &mut fx)?;
            }
        }
        db::mark_initialized(&tx)?;
        Ok(())
    })();
    match result {
        Ok(()) => match tx.commit() {
            Ok(()) => fx.finish(),
            Err(error) => {
                fx.rollback();
                return Err(error.into());
            }
        },
        Err(error) => {
            drop(tx);
            fx.rollback();
            return Err(error);
        }
    }
    let mut local = HashMap::new();
    if let Some(theme) = claves.get(store::K_THEME) {
        local.insert(store::K_THEME.to_string(), theme.clone());
    }
    summary_of(conn, local)
}

/// Estado de un intercambio de base/carpeta para poder deshacerlo.
struct Swap {
    data_dir: PathBuf,
    facturas_moved: bool,
    facturas_installed: bool,
    db_moved: bool,
    wal_moved: bool,
    shm_moved: bool,
    new_installed: bool,
}

impl Swap {
    fn p(&self, name: &str) -> PathBuf {
        self.data_dir.join(name)
    }
    fn undo(&mut self) {
        if self.new_installed {
            for name in ["jcmotors.db", "jcmotors.db-wal", "jcmotors.db-shm"] {
                let _ = fs::remove_file(self.p(name));
            }
            self.new_installed = false;
        }
        if self.shm_moved {
            let _ = fs::rename(self.p("jcmotors.db.old-shm"), self.p("jcmotors.db-shm"));
        }
        if self.wal_moved {
            let _ = fs::rename(self.p("jcmotors.db.old-wal"), self.p("jcmotors.db-wal"));
        }
        if self.db_moved {
            let _ = fs::rename(self.p("jcmotors.db.old"), self.p("jcmotors.db"));
        }
        if self.facturas_installed {
            let _ = fs::remove_dir_all(self.p("facturas"));
        }
        if self.facturas_moved {
            let _ = fs::rename(self.p("facturas.old"), self.p("facturas"));
        }
    }
    fn commit(&self) {
        for name in ["jcmotors.db.old", "jcmotors.db.old-wal", "jcmotors.db.old-shm"] {
            let _ = fs::remove_file(self.p(name));
        }
        let _ = fs::remove_dir_all(self.p("facturas.old"));
    }
}

fn swap_in(data_dir: &Path, staged_dir: &Path, fail_midway: bool) -> R<Swap> {
    let mut swap = Swap {
        data_dir: data_dir.to_path_buf(),
        facturas_moved: false,
        facturas_installed: false,
        db_moved: false,
        wal_moved: false,
        shm_moved: false,
        new_installed: false,
    };
    let steps = (|| -> R<()> {
        let _ = fs::remove_dir_all(swap.p("facturas.old"));
        for name in ["jcmotors.db.old", "jcmotors.db.old-wal", "jcmotors.db.old-shm"] {
            let _ = fs::remove_file(swap.p(name));
        }
        if swap.p("facturas").exists() {
            fs::rename(swap.p("facturas"), swap.p("facturas.old"))?;
            swap.facturas_moved = true;
        }
        let staged_facturas = staged_dir.join("facturas");
        if staged_facturas.is_dir() {
            fs::rename(&staged_facturas, swap.p("facturas"))?;
        } else {
            fs::create_dir_all(swap.p("facturas"))?;
        }
        swap.facturas_installed = true;
        if swap.p("jcmotors.db").exists() {
            fs::rename(swap.p("jcmotors.db"), swap.p("jcmotors.db.old"))?;
            swap.db_moved = true;
        }
        if swap.p("jcmotors.db-wal").exists() {
            fs::rename(swap.p("jcmotors.db-wal"), swap.p("jcmotors.db.old-wal"))?;
            swap.wal_moved = true;
        }
        if swap.p("jcmotors.db-shm").exists() {
            fs::rename(swap.p("jcmotors.db-shm"), swap.p("jcmotors.db.old-shm"))?;
            swap.shm_moved = true;
        }
        fs::rename(swap.p("jcmotors.db.new"), swap.p("jcmotors.db"))?;
        swap.new_installed = true;
        if fail_midway {
            return err("Fallo simulado a mitad de la restauración.");
        }
        Ok(())
    })();
    match steps {
        Ok(()) => Ok(swap),
        Err(error) => {
            swap.undo();
            Err(error)
        }
    }
}

pub fn restore_jcm(slot: &mut Option<Connection>, data_dir: &Path, staged_dir: &Path, fail_midway: bool) -> R<RestoreResult> {
    let staged_db = staged_dir.join("jcmotors.db");
    if !staged_db.is_file() {
        return err("El respaldo preparado ya no está disponible. Elige el archivo de nuevo.");
    }
    // Contadores actuales: los folios nunca bajan.
    let (current_q, current_i) = match slot.as_ref() {
        Some(conn) => (store::counter(conn, "quotation")?, store::counter(conn, "invoice")?),
        None => (0, 0),
    };
    let new_db = data_dir.join("jcmotors.db.new");
    let _ = fs::remove_file(&new_db);
    fs::copy(&staged_db, &new_db)?;
    let prepared = (|| -> R<()> {
        let conn = Connection::open(&new_db)?;
        store::bump_counter(&conn, "quotation", current_q)?;
        store::bump_counter(&conn, "invoice", current_i)?;
        db::mark_initialized(&conn)?;
        Ok(())
    })();
    if let Err(error) = prepared {
        let _ = fs::remove_file(&new_db);
        return Err(error);
    }

    // Se cierra la conexión (checkpoint del WAL) para poder mover los archivos.
    if let Some(conn) = slot.take() {
        if let Err((conn, error)) = conn.close() {
            *slot = Some(conn);
            let _ = fs::remove_file(&new_db);
            return Err(error.into());
        }
    }

    let outcome = swap_in(data_dir, staged_dir, fail_midway).and_then(|mut swap| match db::open_db(data_dir) {
        Ok(opened) if opened.corrupt_moved_to.is_none() => Ok((swap, opened.conn)),
        Ok(opened) => {
            drop(opened.conn);
            if let Some(name) = &opened.corrupt_moved_to {
                for suffix in ["", "-wal", "-shm"] {
                    let _ = fs::remove_file(data_dir.join(format!("{name}{suffix}")));
                }
            }
            swap.undo();
            err("El respaldo no pasó la verificación al abrirlo; se conservaron tus datos.")
        }
        Err(error) => {
            swap.undo();
            Err(error)
        }
    });
    match outcome {
        Ok((swap, conn)) => {
            swap.commit();
            let _ = fs::remove_dir_all(staged_dir);
            let result = summary_of(&conn, HashMap::new());
            *slot = Some(conn);
            result
        }
        Err(error) => {
            let _ = fs::remove_file(&new_db);
            // Los datos anteriores vuelven a estar en su sitio: se reabren.
            match db::open_db(data_dir) {
                Ok(opened) => *slot = Some(opened.conn),
                Err(reopen) => return Err(AppError(format!("{} (además no se pudo reabrir la base: {})", error.0, reopen.0))),
            }
            Err(error)
        }
    }
}

// ------------------------------------------------------------------ copias automáticas y uso

pub fn auto_backup(conn: &Connection, data_dir: &Path, now: DateTime<Local>) -> R<Option<String>> {
    let dir = auto_dir(data_dir);
    ensure_dir(&dir)?;
    let today = format!("auto-{}-", now.format("%Y-%m-%d"));
    let mut names = auto_names(&dir);
    if names.iter().any(|name| name.starts_with(&today)) {
        return Ok(None);
    }
    let dest = dir.join(format!("auto-{}.db", now.format("%Y-%m-%d-%H%M")));
    vacuum_into(conn, &dest)?;
    names = auto_names(&dir);
    names.sort();
    while names.len() > AUTO_KEEP {
        let oldest = names.remove(0);
        let _ = fs::remove_file(dir.join(oldest));
    }
    Ok(Some(dest.to_string_lossy().into_owned()))
}

fn auto_names(dir: &Path) -> Vec<String> {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|name| name.starts_with("auto-") && name.ends_with(".db"))
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub db_bytes: u64,
    pub files_bytes: u64,
    pub files_count: u64,
    pub auto_bytes: u64,
    pub auto_count: u64,
}

pub fn usage(data_dir: &Path) -> Usage {
    let size = |name: &str| fs::metadata(data_dir.join(name)).map(|m| m.len()).unwrap_or(0);
    let (files_bytes, files_count) = dir_size(&facturas_dir(data_dir));
    let (auto_bytes, _) = dir_size(&auto_dir(data_dir));
    Usage {
        db_bytes: size("jcmotors.db") + size("jcmotors.db-wal"),
        files_bytes,
        files_count,
        auto_bytes,
        auto_count: auto_names(&auto_dir(data_dir)).len() as u64,
    }
}

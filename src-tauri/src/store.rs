//! Traducción entre las claves de almacenamiento (`jc-motors:*:v1`) y las tablas relacionales.
//! La columna `data` es la fuente de verdad para reconstruir; las demás columnas son derivadas.
use crate::error::{err, R};
use crate::files::{facturas_dir, safe_id, sha256_hex, write_atomic};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rusqlite::{params_from_iter, types::Value as SqlV, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub const K_QUOTATIONS: &str = "jc-motors:quotations:v1";
pub const K_DRAFTS: &str = "jc-motors:quote-drafts:v1";
pub const K_AUTOSAVE: &str = "jc-motors:quote-autosave:v1";
pub const K_CUSTOMERS: &str = "jc-motors:customers:v1";
pub const K_TEMPLATES: &str = "jc-motors:templates:v1";
pub const K_CONTROLS: &str = "jc-motors:internal-controls:v1";
pub const K_COSTS: &str = "jc-motors:internal-costs:v1";
pub const K_INVOICES: &str = "jc-motors:invoices:v1";
pub const K_INVOICE_FOLIO: &str = "jc-motors:invoice-folio:v1";
pub const K_QUOTATION_FOLIO: &str = "jc-motors:quotation-folio:v1";
pub const K_BUSINESS: &str = "jc-motors:business-info:v1";
pub const K_SCHEMA: &str = "jc-motors:meta:schema:v1";
pub const K_LAST_BACKUP: &str = "jc-motors:meta:last-backup:v1";
pub const K_MIGRATION: &str = "jc-motors:meta:migration:v1";
pub const K_THEME: &str = "jc-motors:sidebar-theme:v1";

pub const LIST_KEYS: [&str; 7] = [K_QUOTATIONS, K_CUSTOMERS, K_TEMPLATES, K_CONTROLS, K_COSTS, K_INVOICES, K_DRAFTS];
pub const SETTING_KEYS: [&str; 5] = [K_BUSINESS, K_AUTOSAVE, K_SCHEMA, K_LAST_BACKUP, K_MIGRATION];
/// Claves del formato de respaldo del lote 1.
pub const BACKUP_EXPORT_KEYS: [&str; 10] = [
    K_QUOTATIONS, K_CUSTOMERS, K_TEMPLATES, K_CONTROLS, K_COSTS, K_INVOICES, K_INVOICE_FOLIO, K_QUOTATION_FOLIO, K_THEME,
    K_BUSINESS,
];

pub fn is_known_key(key: &str) -> bool {
    LIST_KEYS.contains(&key) || SETTING_KEYS.contains(&key) || key == K_INVOICE_FOLIO || key == K_QUOTATION_FOLIO
}

#[derive(Deserialize, Debug, Clone)]
pub struct Change {
    pub key: String,
    pub value: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Quotations,
    Customers,
    Templates,
    Controls,
    Costs,
    Invoices,
    Drafts,
}

impl Kind {
    fn from_key(key: &str) -> Option<Kind> {
        Some(match key {
            K_QUOTATIONS => Kind::Quotations,
            K_CUSTOMERS => Kind::Customers,
            K_TEMPLATES => Kind::Templates,
            K_CONTROLS => Kind::Controls,
            K_COSTS => Kind::Costs,
            K_INVOICES => Kind::Invoices,
            K_DRAFTS => Kind::Drafts,
            _ => return None,
        })
    }
    fn table(self) -> &'static str {
        match self {
            Kind::Quotations => "quotations",
            Kind::Customers => "customers",
            Kind::Templates => "templates",
            Kind::Controls => "internal_controls",
            Kind::Costs => "internal_costs",
            Kind::Invoices => "invoices",
            Kind::Drafts => "quote_drafts",
        }
    }
    fn id_col(self) -> &'static str {
        match self {
            Kind::Controls => "quotation_id",
            Kind::Costs => "quote_id",
            Kind::Invoices => "uuid",
            _ => "id",
        }
    }
    fn id_field(self) -> &'static str {
        match self {
            Kind::Controls => "quotationId",
            Kind::Costs => "quoteId",
            Kind::Invoices => "uuid",
            _ => "id",
        }
    }
}

/// Efectos sobre archivos de una operación, para poder deshacerlos o completarlos según la transacción.
#[derive(Default)]
pub struct FileFx {
    undo: Vec<(PathBuf, Option<Vec<u8>>)>,
    to_delete: Vec<PathBuf>,
    pub written: usize,
}

impl FileFx {
    /// Tras ROLLBACK: devuelve los archivos a como estaban.
    pub fn rollback(&mut self) {
        for (path, old) in self.undo.drain(..).rev() {
            match old {
                Some(bytes) => {
                    let _ = fs::write(&path, bytes);
                }
                None => {
                    let _ = fs::remove_file(&path);
                }
            }
        }
        self.to_delete.clear();
    }
    /// Tras COMMIT: borra los archivos que ya no pertenecen a ninguna factura.
    pub fn finish(&mut self) {
        for path in self.to_delete.drain(..) {
            let _ = fs::remove_file(path);
        }
        self.undo.clear();
    }
}

// ---------------------------------------------------------------- helpers JSON

fn path_of<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for step in path {
        current = current.get(*step)?;
    }
    Some(current)
}
fn text(value: &Value, path: &[&str]) -> SqlV {
    match path_of(value, path).and_then(Value::as_str) {
        Some(s) => SqlV::Text(s.to_string()),
        None => SqlV::Null,
    }
}
fn cents_of(number: f64) -> i64 {
    (number * 100.0).round() as i64
}
pub fn text_to_cents(text: &str) -> i64 {
    text.trim().parse::<f64>().map(cents_of).unwrap_or(0)
}
fn number_cents(value: &Value, path: &[&str]) -> i64 {
    path_of(value, path).and_then(Value::as_f64).map(cents_of).unwrap_or(0)
}

pub fn folio_number(folio: &str) -> i64 {
    folio
        .strip_prefix("JC-")
        .filter(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()))
        .and_then(|rest| rest.parse().ok())
        .unwrap_or(0)
}

pub fn highest_quotation_folio(items: &[Value]) -> i64 {
    items.iter().filter_map(|q| q.get("folio").and_then(Value::as_str)).map(folio_number).max().unwrap_or(0)
}
pub fn highest_invoice_folio(items: &[Value]) -> i64 {
    items.iter().filter_map(|q| q.get("folio").and_then(Value::as_i64)).max().unwrap_or(0)
}

pub fn parse_quotation_counter(raw: &str) -> R<i64> {
    let parsed: Value = serde_json::from_str(raw).map_err(|_| crate::error::AppError("El consecutivo de cotizaciones no es válido.".into()))?;
    let number = parsed.get("lastNumber").unwrap_or(&parsed);
    match number.as_i64() {
        Some(n) if n >= 0 => Ok(n),
        _ => err("El consecutivo de cotizaciones no es válido."),
    }
}
pub fn parse_invoice_counter(raw: &str) -> R<i64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 12 || !trimmed.chars().all(|c| c.is_ascii_digit()) {
        return err("El consecutivo de facturas no es válido.");
    }
    Ok(trimmed.parse()?)
}

/// `UPDATE … RETURNING` monótono: el contador solo sube.
pub fn bump_counter(conn: &Connection, name: &str, at_least: i64) -> R<i64> {
    Ok(conn.query_row(
        "UPDATE counters SET last_number = MAX(last_number, ?1) WHERE name = ?2 RETURNING last_number",
        rusqlite::params![at_least, name],
        |row| row.get(0),
    )?)
}
pub fn counter(conn: &Connection, name: &str) -> R<i64> {
    Ok(conn.query_row("SELECT last_number FROM counters WHERE name = ?1", [name], |row| row.get(0))?)
}

// ---------------------------------------------------------------- lectura de listas

pub fn parse_list(key: &str, raw: &str) -> R<Vec<Value>> {
    let kind = Kind::from_key(key).ok_or_else(|| crate::error::AppError(format!("Clave no reconocida: {key}")))?;
    let parsed: Value = serde_json::from_str(raw).map_err(|_| crate::error::AppError("Los datos tienen un formato dañado.".into()))?;
    let Value::Array(items) = parsed else { return err("Los datos tienen un formato no válido (se esperaba una lista).") };
    let mut seen = HashSet::new();
    for item in &items {
        let Some(id) = item.as_object().and_then(|o| o.get(kind.id_field())).and_then(Value::as_str).filter(|s| !s.is_empty()) else {
            return err("Hay un registro sin identificador; no se guardó nada.");
        };
        if !seen.insert(id.to_string()) {
            return err("Hay registros con el mismo identificador; no se guardó nada.");
        }
    }
    Ok(items)
}

// ---------------------------------------------------------------- escritura

struct FileSpec {
    ext: &'static str,
    kind: &'static str,
    name: String,
    sha: String,
    bytes: Vec<u8>,
}

struct Prepared {
    id: String,
    json: String,
    value: Value,
    file: Option<FileSpec>,
}

fn prepare(kind: Kind, mut value: Value) -> R<Prepared> {
    let id = value[kind.id_field()].as_str().unwrap_or_default().to_string();
    let mut file = None;
    if kind == Kind::Invoices && safe_id(&id) {
        if let Some(object) = value.as_object_mut() {
            let original = object.get("archivoOriginal").and_then(Value::as_str).unwrap_or("").to_string();
            let ext = match object.get("archivoTipo").and_then(Value::as_str) {
                Some("pdf") => Some(("pdf", "pdf")),
                Some("xml") => Some(("xml", "xml")),
                _ => None,
            };
            if let (false, Some((ext, kind_name))) = (original.is_empty(), ext) {
                if let Ok(bytes) = B64.decode(&original) {
                    if B64.encode(&bytes) == original {
                        let name = object.get("archivoNombre").and_then(Value::as_str).unwrap_or("").to_string();
                        file = Some(FileSpec { ext, kind: kind_name, name, sha: sha256_hex(&bytes), bytes });
                        object.insert("archivoOriginal".into(), Value::String(String::new()));
                    }
                }
            }
        }
    }
    let json = serde_json::to_string(&value)?;
    Ok(Prepared { id, json, value, file })
}

fn derived(kind: Kind, value: &Value) -> Vec<(&'static str, SqlV)> {
    match kind {
        Kind::Quotations => vec![
            ("folio", text(value, &["folio"])),
            ("created_at", text(value, &["createdAt"])),
            ("status", text(value, &["status"])),
            ("customer_id", text(value, &["customerId"])),
            ("customer_name", text(value, &["customer", "name"])),
            ("total_cents", SqlV::Integer(number_cents(value, &["total"]))),
        ],
        Kind::Customers => vec![("name", text(value, &["name"])), ("phone", text(value, &["phone"]))],
        Kind::Templates => vec![("name", text(value, &["name"]))],
        Kind::Invoices => vec![
            ("folio", path_of(value, &["folio"]).and_then(Value::as_i64).map(SqlV::Integer).unwrap_or(SqlV::Null)),
            ("fecha_emision", text(value, &["fechaEmision"])),
            ("total_text", text(value, &["total"])),
            (
                "total_cents",
                SqlV::Integer(path_of(value, &["total"]).and_then(Value::as_str).map(text_to_cents).unwrap_or(0)),
            ),
            ("estado", text(value, &["estado"])),
        ],
        _ => vec![],
    }
}

fn sync_list(conn: &Connection, data_dir: &Path, kind: Kind, items: Vec<Value>, fx: &mut FileFx) -> R<()> {
    let table = kind.table();
    let id_col = kind.id_col();
    let highest_q = if kind == Kind::Quotations { highest_quotation_folio(&items) } else { 0 };
    let highest_i = if kind == Kind::Invoices { highest_invoice_folio(&items) } else { 0 };
    let mut prepared = Vec::with_capacity(items.len());
    for item in items {
        prepared.push(prepare(kind, item)?);
    }

    let mut existing: HashMap<String, (String, i64)> = HashMap::new();
    {
        let mut stmt = conn.prepare(&format!("SELECT {id_col}, data, position FROM {table}"))?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?)))?;
        for row in rows {
            let (id, data, position) = row?;
            existing.insert(id, (data, position));
        }
    }
    let new_ids: HashSet<&str> = prepared.iter().map(|p| p.id.as_str()).collect();
    let removed: Vec<String> = existing.keys().filter(|id| !new_ids.contains(id.as_str())).cloned().collect();
    for id in &removed {
        if kind == Kind::Invoices {
            let rel: Option<String> =
                conn.query_row("SELECT rel_path FROM invoice_files WHERE invoice_uuid = ?1", [id], |r| r.get(0)).optional()?;
            if let Some(rel) = rel {
                fx.to_delete.push(data_dir.join(rel));
            }
        }
        conn.execute(&format!("DELETE FROM {table} WHERE {id_col} = ?1"), [id])?;
    }

    let mut changed: Vec<usize> = Vec::new();
    for (index, p) in prepared.iter().enumerate() {
        let position = index as i64;
        match existing.get(&p.id) {
            Some((data, old_position)) if *data == p.json => {
                if *old_position != position {
                    conn.execute(&format!("UPDATE {table} SET position = ?1 WHERE {id_col} = ?2"), rusqlite::params![position, p.id])?;
                }
            }
            _ => {
                let extra = derived(kind, &p.value);
                let mut columns = vec![id_col.to_string(), "position".into(), "data".into()];
                let mut values = vec![SqlV::Text(p.id.clone()), SqlV::Integer(position), SqlV::Text(p.json.clone())];
                for (column, value) in extra {
                    columns.push(column.to_string());
                    values.push(value);
                }
                let placeholders: Vec<String> = (1..=columns.len()).map(|n| format!("?{n}")).collect();
                let updates: Vec<String> = columns.iter().skip(1).map(|c| format!("{c} = excluded.{c}")).collect();
                let sql = format!(
                    "INSERT INTO {table} ({}) VALUES ({}) ON CONFLICT({id_col}) DO UPDATE SET {}",
                    columns.join(", "),
                    placeholders.join(", "),
                    updates.join(", ")
                );
                conn.execute(&sql, params_from_iter(values))?;
                changed.push(index);
            }
        }
    }

    match kind {
        Kind::Quotations => {
            for &index in &changed {
                let p = &prepared[index];
                conn.execute("DELETE FROM quotation_items WHERE quotation_id = ?1", [&p.id])?;
                if let Some(Value::Array(items)) = p.value.get("items") {
                    for (position, item) in items.iter().enumerate() {
                        conn.execute(
                            "INSERT INTO quotation_items (quotation_id, position, item_id, type, description, quantity, sale_unit_price_cents, amount_cents)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                            params_from_iter(vec![
                                SqlV::Text(p.id.clone()),
                                SqlV::Integer(position as i64),
                                text(item, &["id"]),
                                text(item, &["type"]),
                                text(item, &["description"]),
                                path_of(item, &["quantity"]).and_then(Value::as_f64).map(SqlV::Real).unwrap_or(SqlV::Null),
                                SqlV::Integer(number_cents(item, &["saleUnitPrice"])),
                                SqlV::Integer(number_cents(item, &["amount"])),
                            ]),
                        )?;
                    }
                }
            }
            if !changed.is_empty() || !removed.is_empty() {
                conn.execute("DELETE FROM vehicles", [])?;
                for p in &prepared {
                    let Some(vehicle) = p.value.get("vehicle") else { continue };
                    let s = |field: &str| vehicle.get(field).and_then(Value::as_str).unwrap_or("").to_string();
                    conn.execute(
                        "INSERT OR IGNORE INTO vehicles (customer_id, make, model, year, plates) VALUES (?1, ?2, ?3, ?4, ?5)",
                        params_from_iter(vec![
                            SqlV::Text(p.value.get("customerId").and_then(Value::as_str).unwrap_or("").to_string()),
                            SqlV::Text(s("make")),
                            SqlV::Text(s("model")),
                            vehicle.get("year").and_then(Value::as_i64).map(SqlV::Integer).unwrap_or(SqlV::Null),
                            SqlV::Text(s("plates")),
                        ]),
                    )?;
                }
            }
            bump_counter(conn, "quotation", highest_q)?;
        }
        Kind::Invoices => {
            for p in &prepared {
                let current: Option<(String, String)> = conn
                    .query_row("SELECT sha256, rel_path FROM invoice_files WHERE invoice_uuid = ?1", [&p.id], |r| Ok((r.get(0)?, r.get(1)?)))
                    .optional()?;
                match &p.file {
                    Some(file) => {
                        let rel = format!("facturas/{}.{}", p.id, file.ext);
                        let path = data_dir.join(&rel);
                        let same = current.as_ref().is_some_and(|(sha, old_rel)| {
                            *sha == file.sha
                                && *old_rel == rel
                                && path.metadata().map(|m| m.len() == file.bytes.len() as u64).unwrap_or(false)
                        });
                        if same {
                            continue;
                        }
                        fs::create_dir_all(facturas_dir(data_dir))?;
                        fx.undo.push((path.clone(), fs::read(&path).ok()));
                        write_atomic(&path, &file.bytes)?;
                        fx.written += 1;
                        if let Some((_, old_rel)) = &current {
                            if *old_rel != rel {
                                fx.to_delete.push(data_dir.join(old_rel));
                            }
                        }
                        conn.execute(
                            "INSERT OR REPLACE INTO invoice_files (invoice_uuid, kind, name, rel_path, sha256, size_bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                            rusqlite::params![p.id, file.kind, file.name, rel, file.sha, file.bytes.len() as i64],
                        )?;
                    }
                    None => {
                        if let Some((_, old_rel)) = current {
                            conn.execute("DELETE FROM invoice_files WHERE invoice_uuid = ?1", [&p.id])?;
                            fx.to_delete.push(data_dir.join(old_rel));
                        }
                    }
                }
            }
            bump_counter(conn, "invoice", highest_i)?;
        }
        _ => {}
    }
    Ok(())
}

/// Aplica una clave dentro de la transacción en curso del llamador.
pub fn apply_key(conn: &Connection, data_dir: &Path, key: &str, value: Option<&str>, fx: &mut FileFx) -> R<()> {
    if let Some(kind) = Kind::from_key(key) {
        let items = match value {
            Some(raw) => parse_list(key, raw)?,
            None => Vec::new(),
        };
        return sync_list(conn, data_dir, kind, items, fx);
    }
    if key == K_QUOTATION_FOLIO {
        if let Some(raw) = value {
            bump_counter(conn, "quotation", parse_quotation_counter(raw)?)?;
        }
        return Ok(());
    }
    if key == K_INVOICE_FOLIO {
        if let Some(raw) = value {
            bump_counter(conn, "invoice", parse_invoice_counter(raw)?)?;
        }
        return Ok(());
    }
    if SETTING_KEYS.contains(&key) {
        match value {
            Some(v) => conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)", [key, v])?,
            None => conn.execute("DELETE FROM settings WHERE key = ?1", [key])?,
        };
        return Ok(());
    }
    err(format!("Clave no reconocida: {key}"))
}

/// UNA transacción para todo el lote: si algo falla no se escribe nada (ni archivos de factura).
pub fn apply_changes(conn: &Connection, data_dir: &Path, changes: &[Change]) -> R<()> {
    let tx = conn.unchecked_transaction()?;
    let mut fx = FileFx::default();
    let result: R<()> = (|| {
        for change in changes {
            apply_key(&tx, data_dir, &change.key, change.value.as_deref(), &mut fx)?;
        }
        Ok(())
    })();
    match result {
        Ok(()) => match tx.commit() {
            Ok(()) => {
                fx.finish();
                Ok(())
            }
            Err(error) => {
                fx.rollback();
                Err(error.into())
            }
        },
        Err(error) => {
            drop(tx);
            fx.rollback();
            Err(error)
        }
    }
}

// ---------------------------------------------------------------- lectura / reconstrucción

fn read_list(conn: &Connection, data_dir: &Path, kind: Kind) -> R<Option<String>> {
    let mut stmt = conn.prepare(&format!("SELECT data{} FROM {} ORDER BY position", if kind == Kind::Invoices { ", uuid" } else { "" }, kind.table()))?;
    let mut parts: Vec<String> = Vec::new();
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let data: String = row.get(0)?;
        if kind == Kind::Invoices {
            let uuid: String = row.get(1)?;
            parts.push(inflate_invoice(conn, data_dir, &uuid, data)?);
        } else {
            parts.push(data);
        }
    }
    if parts.is_empty() {
        return Ok(None);
    }
    Ok(Some(format!("[{}]", parts.join(","))))
}

fn inflate_invoice(conn: &Connection, data_dir: &Path, uuid: &str, data: String) -> R<String> {
    let file: Option<(String, String)> = conn
        .query_row("SELECT rel_path, sha256 FROM invoice_files WHERE invoice_uuid = ?1", [uuid], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()?;
    let Some((rel, sha)) = file else { return Ok(data) };
    let bytes = match fs::read(data_dir.join(&rel)) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("[jc-motors] No se pudo leer el original de la factura {uuid}: {error}");
            return Ok(data);
        }
    };
    if sha256_hex(&bytes) != sha {
        eprintln!("[jc-motors] El original de la factura {uuid} no coincide con su huella; se devuelve tal cual.");
    }
    let mut value: Value = serde_json::from_str(&data)?;
    if let Some(object) = value.as_object_mut() {
        object.insert("archivoOriginal".into(), Value::String(B64.encode(bytes)));
    }
    Ok(serde_json::to_string(&value)?)
}

/// Todas las claves reconstruidas. Las listas vacías no aparecen (igual que un localStorage sin escribir).
pub fn snapshot(conn: &Connection, data_dir: &Path) -> R<HashMap<String, String>> {
    let mut out = HashMap::new();
    for key in LIST_KEYS {
        let kind = Kind::from_key(key).expect("clave de lista");
        if let Some(raw) = read_list(conn, data_dir, kind)? {
            out.insert(key.to_string(), raw);
        }
    }
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    for row in rows {
        let (key, value) = row?;
        out.insert(key, value);
    }
    let quotation = counter(conn, "quotation")?;
    if quotation > 0 {
        out.insert(K_QUOTATION_FOLIO.into(), format!("{{\"lastNumber\":{quotation}}}"));
    }
    let invoice = counter(conn, "invoice")?;
    if invoice > 0 {
        out.insert(K_INVOICE_FOLIO.into(), invoice.to_string());
    }
    Ok(out)
}

// ---------------------------------------------------------------- resúmenes

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub quotations: i64,
    pub customers: i64,
    pub invoices: i64,
    pub templates: i64,
    pub internal_costs: i64,
    pub internal_controls: i64,
    pub drafts: i64,
}

pub fn counts(conn: &Connection) -> R<Counts> {
    let n = |table: &str| -> R<i64> { Ok(conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))?) };
    Ok(Counts {
        quotations: n("quotations")?,
        customers: n("customers")?,
        invoices: n("invoices")?,
        templates: n("templates")?,
        internal_costs: n("internal_costs")?,
        internal_controls: n("internal_controls")?,
        drafts: n("quote_drafts")?,
    })
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct Totals {
    pub quotations: i64,
    pub invoices: i64,
}

pub fn totals_cents(conn: &Connection) -> R<Totals> {
    let sum = |table: &str| -> R<i64> { Ok(conn.query_row(&format!("SELECT COALESCE(SUM(total_cents), 0) FROM {table}"), [], |r| r.get(0))?) };
    Ok(Totals { quotations: sum("quotations")?, invoices: sum("invoices")? })
}

pub fn has_data(conn: &Connection) -> R<bool> {
    let c = counts(conn)?;
    Ok(c.quotations + c.customers + c.invoices + c.templates + c.internal_costs + c.internal_controls + c.drafts > 0)
}

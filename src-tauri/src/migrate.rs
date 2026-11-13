//! Migración única desde localStorage: respaldo previo → importación en UNA transacción → verificación → COMMIT.
use crate::db::{meta_get, meta_set};
use crate::error::{err, AppError, R};
use crate::files::{auto_dir, write_atomic};
use crate::store::*;
use chrono::{DateTime, Local};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    pub counts: Counts,
    pub totals_cents: Totals,
    pub last_folio: LastFolio,
    pub files_written: usize,
    pub pre_backup_path: String,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct LastFolio {
    pub quotation: i64,
    pub invoice: i64,
}

fn mismatch(what: &str) -> AppError {
    AppError(format!("La verificación de la migración falló: {what}. No se cambió nada."))
}

fn sum_cents(items: &[Value], f: impl Fn(&Value) -> i64) -> i64 {
    items.iter().map(f).sum()
}

/// Escribe el respaldo JSON del lote 1 con las claves de exportación presentes.
pub fn write_pre_migration_backup(data_dir: &Path, keys: &HashMap<String, String>, now: DateTime<Local>) -> R<String> {
    let mut claves = serde_json::Map::new();
    for key in BACKUP_EXPORT_KEYS {
        if let Some(raw) = keys.get(key) {
            claves.insert(key.to_string(), Value::String(raw.clone()));
        }
    }
    let document = serde_json::json!({
        "app": "jc-motors",
        "schemaVersion": 1,
        "exportedAt": now.with_timezone(&chrono::Utc).to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "claves": Value::Object(claves),
    });
    let path = auto_dir(data_dir).join(format!("pre-migracion-{}.json", now.format("%Y-%m-%d-%H%M%S")));
    write_atomic(&path, serde_json::to_string_pretty(&document)?.as_bytes())?;
    let written = std::fs::read(&path)?;
    if serde_json::from_slice::<Value>(&written).is_err() {
        return err("No se pudo guardar el respaldo previo a la migración.");
    }
    Ok(path.to_string_lossy().into_owned())
}

pub fn migrate_from_local(
    conn: &Connection,
    data_dir: &Path,
    keys: &HashMap<String, String>,
    now: DateTime<Local>,
    fail_midway: bool,
) -> R<MigrationReport> {
    if meta_get(conn, "initialized")?.as_deref() == Some("1") {
        return err("La base ya tiene datos; no se migra encima.");
    }
    let pre_backup_path = write_pre_migration_backup(data_dir, keys, now)?;

    // Solo claves conocidas con contenido, listas primero.
    let mut ordered: Vec<(&str, &str)> = Vec::new();
    for key in LIST_KEYS.iter().chain([K_QUOTATION_FOLIO, K_INVOICE_FOLIO].iter()).chain(SETTING_KEYS.iter()) {
        if let Some(raw) = keys.get(*key).filter(|raw| !raw.is_empty()) {
            ordered.push((key, raw));
        }
    }

    let tx = conn.unchecked_transaction()?;
    let mut fx = FileFx::default();
    let result: R<MigrationReport> = (|| {
        for (index, (key, raw)) in ordered.iter().enumerate() {
            apply_key(&tx, data_dir, key, Some(raw), &mut fx)?;
            if fail_midway && index == 1 {
                return err("Fallo simulado a mitad de la migración.");
            }
        }
        let report = verify(&tx, data_dir, keys, &ordered, &pre_backup_path, fx.written)?;
        meta_set(&tx, "initialized", "1")?;
        meta_set(&tx, "created_at", &chrono::Utc::now().to_rfc3339())?;
        meta_set(
            &tx,
            "local_migration",
            &serde_json::json!({ "date": chrono::Utc::now().to_rfc3339(), "counts": report.counts }).to_string(),
        )?;
        Ok(report)
    })();
    match result {
        Ok(report) => match tx.commit() {
            Ok(()) => {
                fx.finish();
                Ok(report)
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

fn verify(
    conn: &Connection,
    data_dir: &Path,
    keys: &HashMap<String, String>,
    ordered: &[(&str, &str)],
    pre_backup_path: &str,
    files_written: usize,
) -> R<MigrationReport> {
    let db_counts = counts(conn)?;
    let mut input_lists: HashMap<&str, Vec<Value>> = HashMap::new();
    for (key, raw) in ordered {
        if LIST_KEYS.contains(key) {
            input_lists.insert(key, parse_list(key, raw)?);
        }
    }
    let len = |key: &str| input_lists.get(key).map(|l| l.len() as i64).unwrap_or(0);
    let expected = Counts {
        quotations: len(K_QUOTATIONS),
        customers: len(K_CUSTOMERS),
        invoices: len(K_INVOICES),
        templates: len(K_TEMPLATES),
        internal_costs: len(K_COSTS),
        internal_controls: len(K_CONTROLS),
        drafts: len(K_DRAFTS),
    };
    if db_counts != expected {
        return Err(mismatch("las cantidades por entidad no coinciden"));
    }

    // Suma de totales al centavo.
    let db_totals = totals_cents(conn)?;
    let empty = Vec::new();
    let quotations = input_lists.get(K_QUOTATIONS).unwrap_or(&empty);
    let invoices = input_lists.get(K_INVOICES).unwrap_or(&empty);
    let expected_q = sum_cents(quotations, |q| q.get("total").and_then(Value::as_f64).map(|x| (x * 100.0).round() as i64).unwrap_or(0));
    let expected_i = sum_cents(invoices, |i| i.get("total").and_then(Value::as_str).map(text_to_cents).unwrap_or(0));
    if db_totals.quotations != expected_q || db_totals.invoices != expected_i {
        return Err(mismatch("la suma de totales no coincide"));
    }

    // Contadores: el mayor entre el contador y el folio más alto.
    let input_q = keys.get(K_QUOTATION_FOLIO).map(|raw| parse_quotation_counter(raw)).transpose()?.unwrap_or(0);
    let input_i = keys.get(K_INVOICE_FOLIO).map(|raw| parse_invoice_counter(raw)).transpose()?.unwrap_or(0);
    let want_q = input_q.max(highest_quotation_folio(quotations));
    let want_i = input_i.max(highest_invoice_folio(invoices));
    let (got_q, got_i) = (counter(conn, "quotation")?, counter(conn, "invoice")?);
    if got_q != want_q || got_i != want_i {
        return Err(mismatch("los contadores de folio no coinciden"));
    }

    // Reconstrucción (incluye releer los archivos de factura y comprobar su huella).
    let mut stmt = conn.prepare("SELECT rel_path, sha256 FROM invoice_files")?;
    let files = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for file in files {
        let (rel, sha) = file?;
        let actual = crate::files::sha256_file(&data_dir.join(rel)).map_err(|_| mismatch("falta un archivo de factura"))?;
        if actual != sha {
            return Err(mismatch("la huella de un archivo de factura no coincide"));
        }
    }
    let rebuilt = snapshot(conn, data_dir)?;
    for (key, items) in &input_lists {
        let back: Value = serde_json::from_str(rebuilt.get(*key).map(String::as_str).unwrap_or("[]"))?;
        if back != Value::Array(items.clone()) {
            return Err(mismatch("los datos reconstruidos no son idénticos a los originales"));
        }
    }
    for (key, raw) in ordered {
        if SETTING_KEYS.contains(key) && rebuilt.get(*key).map(String::as_str) != Some(*raw) {
            return Err(mismatch("un ajuste no coincide"));
        }
    }

    Ok(MigrationReport {
        counts: db_counts,
        totals_cents: db_totals,
        last_folio: LastFolio { quotation: got_q, invoice: got_i },
        files_written,
        pre_backup_path: pre_backup_path.to_string(),
    })
}

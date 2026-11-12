use crate::backup::{self, Staged};
use crate::db;
use crate::files::*;
use crate::migrate;
use crate::store::{self, Change, *};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::Local;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tempfile::TempDir;

fn open(dir: &Path) -> Connection {
    db::open_db(dir).unwrap().conn
}

fn quotation(n: i64) -> Value {
    json!({
        "id": format!("q-{n}"), "folio": format!("JC-{n:04}"), "createdAt": "2026-10-01T10:00:00.000Z", "status": "Pendiente",
        "customerId": "c1", "customer": {"name": "Ana", "phone": "6671234567"},
        "vehicle": {"make": "Nissan", "model": "Sentra", "year": 2020, "plates": "ABC"},
        "items": [{"id": format!("i-{n}"), "type": "part", "description": "Filtro", "quantity": 2, "saleUnitPrice": 100.5, "amount": 201}],
        "includeVat": true, "subtotalNeto": 201, "ivaAmount": 32.16, "total": 233.16 + n as f64, "unknownField": {"keep": [1, 2, 3]}
    })
}

fn pdf_bytes(n: i64) -> Vec<u8> {
    format!("%PDF-1.4 factura numero {n} {}", "x".repeat(500)).into_bytes()
}

fn invoice(n: i64) -> Value {
    json!({
        "folio": n, "uuid": format!("uuid-{n}"), "fechaEmision": "2026-10-02T09:00:00", "total": format!("{}.50", 1000 + n), "estado": "timbrada",
        "archivoOriginal": B64.encode(pdf_bytes(n)), "archivoTipo": "pdf", "archivoNombre": format!("f{n}.pdf"), "conceptos": []
    })
}

fn list(items: Vec<Value>) -> String {
    Value::Array(items).to_string()
}

fn change(key: &str, value: &str) -> Change {
    Change { key: key.into(), value: Some(value.into()) }
}

fn seed(conn: &Connection, dir: &Path) {
    let changes = vec![
        change(K_QUOTATIONS, &list(vec![quotation(3), quotation(2), quotation(1)])),
        change(K_CUSTOMERS, &list(vec![json!({"id": "c1", "name": "Ana", "aliases": []}), json!({"id": "c2", "name": "Luis", "aliases": ["Lu"]})])),
        change(K_INVOICES, &list(vec![invoice(2), invoice(1)])),
        change(K_COSTS, &list(vec![json!({"quoteId": "q-1", "itemCosts": []})])),
        change(K_CONTROLS, &list(vec![json!({"quotationId": "q-1", "partCosts": []})])),
        change(K_QUOTATION_FOLIO, "{\"lastNumber\":9}"),
        change(K_INVOICE_FOLIO, "4"),
        change(K_BUSINESS, "{\"name\":\"JC\"}"),
    ];
    apply_changes(conn, dir, &changes).unwrap();
}

fn norm(raw: &str) -> String {
    serde_json::to_string(&serde_json::from_str::<Value>(raw).unwrap()).unwrap()
}

#[test]
fn schema_creation_and_version() {
    let dir = TempDir::new().unwrap();
    let conn = open(dir.path());
    assert_eq!(db::user_version(&conn).unwrap(), db::CURRENT_VERSION);
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    for table in ["quotations", "quotation_items", "customers", "vehicles", "invoices", "invoice_files", "templates", "internal_costs", "internal_controls", "quote_drafts", "settings", "counters", "meta"] {
        assert!(tables.contains(&table.to_string()), "falta {table}");
    }
    let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
    assert_eq!(mode, "wal");
    let fk: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
    assert_eq!(fk, 1);
    // Reabrir es idempotente.
    drop(conn);
    assert_eq!(db::user_version(&open(dir.path())).unwrap(), 1);
}

#[test]
fn apply_and_load_roundtrip_keeps_order_and_sparse_objects() {
    let dir = TempDir::new().unwrap();
    let conn = open(dir.path());
    let sparse = "[{\"uuid\":\"u-1\",\"folio\":1},{\"uuid\":\"u-2\",\"folio\":2}]";
    let quotations = list(vec![quotation(3), quotation(2), quotation(1)]);
    apply_changes(&conn, dir.path(), &[change(K_INVOICES, sparse), change(K_QUOTATIONS, &quotations)]).unwrap();
    let snap = snapshot(&conn, dir.path()).unwrap();
    assert_eq!(snap[K_INVOICES], sparse);
    assert_eq!(snap[K_QUOTATIONS], norm(&quotations), "mismo orden de claves y de registros");
    assert!(snap[K_QUOTATIONS].find("\"unknownField\"").is_some());
    // Reordenar y quitar actualiza posiciones y borra lo ausente.
    let reordered = list(vec![quotation(1), quotation(3)]);
    apply_changes(&conn, dir.path(), &[change(K_QUOTATIONS, &reordered)]).unwrap();
    assert_eq!(snapshot(&conn, dir.path()).unwrap()[K_QUOTATIONS], norm(&reordered));
    let items: i64 = conn.query_row("SELECT COUNT(*) FROM quotation_items", [], |r| r.get(0)).unwrap();
    assert_eq!(items, 2);
    // Una lista vacía borra todo; clave sin identificador se rechaza sin tocar nada.
    assert!(apply_changes(&conn, dir.path(), &[change(K_CUSTOMERS, "[{\"name\":\"sin id\"}]")]).is_err());
    assert!(apply_changes(&conn, dir.path(), &[change(K_CUSTOMERS, "no es json")]).is_err());
    apply_changes(&conn, dir.path(), &[change(K_QUOTATIONS, "[]")]).unwrap();
    assert!(!snapshot(&conn, dir.path()).unwrap().contains_key(K_QUOTATIONS));
}

#[test]
fn counters_never_go_back_and_are_independent() {
    let dir = TempDir::new().unwrap();
    let conn = open(dir.path());
    apply_changes(&conn, dir.path(), &[change(K_QUOTATION_FOLIO, "{\"lastNumber\":9}"), change(K_INVOICE_FOLIO, "4")]).unwrap();
    apply_changes(&conn, dir.path(), &[change(K_QUOTATION_FOLIO, "{\"lastNumber\":3}"), change(K_INVOICE_FOLIO, "1")]).unwrap();
    assert_eq!((counter(&conn, "quotation").unwrap(), counter(&conn, "invoice").unwrap()), (9, 4));
    // Borrar cotizaciones no baja el contador; una lista con folio más alto lo sube.
    apply_changes(&conn, dir.path(), &[change(K_QUOTATIONS, &list(vec![quotation(12)]))]).unwrap();
    assert_eq!(counter(&conn, "quotation").unwrap(), 12);
    assert_eq!(counter(&conn, "invoice").unwrap(), 4);
    apply_changes(&conn, dir.path(), &[change(K_QUOTATIONS, "[]"), Change { key: K_QUOTATION_FOLIO.into(), value: None }]).unwrap();
    assert_eq!(counter(&conn, "quotation").unwrap(), 12);
    let snap = snapshot(&conn, dir.path()).unwrap();
    assert_eq!(snap[K_QUOTATION_FOLIO], "{\"lastNumber\":12}");
    assert_eq!(snap[K_INVOICE_FOLIO], "4");
    assert!(apply_changes(&conn, dir.path(), &[change(K_INVOICE_FOLIO, "abc")]).is_err());
}

#[test]
fn invoice_files_are_written_hashed_skipped_and_deleted_after_commit() {
    let dir = TempDir::new().unwrap();
    let conn = open(dir.path());
    let first = list(vec![invoice(1), invoice(2)]);
    apply_changes(&conn, dir.path(), &[change(K_INVOICES, &first)]).unwrap();
    let path1 = dir.path().join("facturas/uuid-1.pdf");
    assert_eq!(fs::read(&path1).unwrap(), pdf_bytes(1));
    let (rel, sha, size): (String, String, i64) =
        conn.query_row("SELECT rel_path, sha256, size_bytes FROM invoice_files WHERE invoice_uuid='uuid-1'", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap();
    assert_eq!(rel, "facturas/uuid-1.pdf");
    assert_eq!(sha, sha256_hex(&pdf_bytes(1)));
    assert_eq!(size as usize, pdf_bytes(1).len());
    // El JSON guardado no lleva el base64.
    let data: String = conn.query_row("SELECT data FROM invoices WHERE uuid='uuid-1'", [], |r| r.get(0)).unwrap();
    assert!(!data.contains(&B64.encode(pdf_bytes(1))));
    // Hash igual => no se reescribe (se nota porque un archivo alterado del mismo tamaño NO se repara si el hash coincide).
    let modified_before = fs::metadata(&path1).unwrap().modified().unwrap();
    std::thread::sleep(std::time::Duration::from_millis(30));
    apply_changes(&conn, dir.path(), &[change(K_INVOICES, &first)]).unwrap();
    assert_eq!(fs::metadata(&path1).unwrap().modified().unwrap(), modified_before);
    // La lectura reinyecta el original idéntico.
    assert_eq!(snapshot(&conn, dir.path()).unwrap()[K_INVOICES], norm(&first));
    // Borrar la factura borra su archivo; el otro sigue.
    apply_changes(&conn, dir.path(), &[change(K_INVOICES, &list(vec![invoice(2)]))]).unwrap();
    assert!(!path1.exists());
    assert!(dir.path().join("facturas/uuid-2.pdf").exists());
    // Un lote que falla a medias no borra ni deja archivos nuevos.
    let bad = apply_changes(&conn, dir.path(), &[change(K_INVOICES, &list(vec![invoice(3)])), change(K_CUSTOMERS, "[{\"x\":1}]")]);
    assert!(bad.is_err());
    assert!(!dir.path().join("facturas/uuid-3.pdf").exists());
    assert!(dir.path().join("facturas/uuid-2.pdf").exists(), "lo borrado solo se borra tras confirmar");
    assert_eq!(snapshot(&conn, dir.path()).unwrap()[K_INVOICES], norm(&list(vec![invoice(2)])));
}

#[test]
fn invalid_base64_stays_inline() {
    let dir = TempDir::new().unwrap();
    let conn = open(dir.path());
    let mut bad = invoice(1);
    bad["archivoOriginal"] = json!("esto no es base64 válido!!");
    let mut unsafe_id = invoice(2);
    unsafe_id["uuid"] = json!("../evil");
    let raw = list(vec![bad, unsafe_id]);
    apply_changes(&conn, dir.path(), &[change(K_INVOICES, &raw)]).unwrap();
    assert_eq!(snapshot(&conn, dir.path()).unwrap()[K_INVOICES], norm(&raw));
    let files: i64 = conn.query_row("SELECT COUNT(*) FROM invoice_files", [], |r| r.get(0)).unwrap();
    assert_eq!(files, 0);
    assert!(!dir.path().join("facturas").exists() || fs::read_dir(dir.path().join("facturas")).unwrap().count() == 0);
}

fn local_keys() -> HashMap<String, String> {
    let mut keys = HashMap::new();
    keys.insert(K_QUOTATIONS.to_string(), list(vec![quotation(3), quotation(2), quotation(1)]));
    keys.insert(K_CUSTOMERS.to_string(), list(vec![json!({"id": "c1", "name": "Ana", "aliases": []})]));
    keys.insert(K_INVOICES.to_string(), list(vec![invoice(2), invoice(1)]));
    keys.insert(K_QUOTATION_FOLIO.to_string(), "{\"lastNumber\":9}".into());
    keys.insert(K_INVOICE_FOLIO.to_string(), "4".into());
    keys.insert(K_BUSINESS.to_string(), "{\"name\":\"JC\"}".into());
    keys.insert(K_THEME.to_string(), "light".into());
    keys
}

#[test]
fn migration_happy_path_verifies_everything() {
    let dir = TempDir::new().unwrap();
    let conn = open(dir.path());
    let keys = local_keys();
    let report = migrate::migrate_from_local(&conn, dir.path(), &keys, Local::now(), false).unwrap();
    assert_eq!((report.counts.quotations, report.counts.customers, report.counts.invoices), (3, 1, 2));
    let expected: i64 = (1..=3).map(|n| ((233.16 + n as f64) * 100.0).round() as i64).sum();
    assert_eq!(report.totals_cents.quotations, expected);
    assert_eq!(report.totals_cents.invoices, 100150 + 100250);
    assert_eq!((report.last_folio.quotation, report.last_folio.invoice), (9, 4));
    assert_eq!(report.files_written, 2);
    // Respaldo previo en formato del lote 1.
    let backup: Value = serde_json::from_str(&fs::read_to_string(&report.pre_backup_path).unwrap()).unwrap();
    assert_eq!(backup["app"], "jc-motors");
    assert_eq!(backup["schemaVersion"], 1);
    assert_eq!(backup["claves"][K_THEME], "light");
    assert!(report.pre_backup_path.contains("respaldos-auto"));
    // Estado final.
    let status = db::status(&conn, dir.path(), None).unwrap();
    assert!(status.initialized && status.local_migration_done);
    for (name, bytes) in [("uuid-1", pdf_bytes(1)), ("uuid-2", pdf_bytes(2))] {
        assert_eq!(sha256_file(&dir.path().join(format!("facturas/{name}.pdf"))).unwrap(), sha256_hex(&bytes));
    }
    let snap = snapshot(&conn, dir.path()).unwrap();
    assert_eq!(snap[K_INVOICES], norm(&keys[K_INVOICES]));
    assert!(!snap.contains_key(K_THEME), "la preferencia de interfaz no entra a la base");
    // No se migra dos veces.
    assert!(migrate::migrate_from_local(&conn, dir.path(), &keys, Local::now(), false).is_err());
}

#[test]
fn failed_migration_rolls_back_everything() {
    let dir = TempDir::new().unwrap();
    let conn = open(dir.path());
    let keys = local_keys();
    let error = migrate::migrate_from_local(&conn, dir.path(), &keys, Local::now(), true).unwrap_err();
    assert!(error.0.contains("Fallo simulado"));
    assert!(!store::has_data(&conn).unwrap());
    let status = db::status(&conn, dir.path(), None).unwrap();
    assert!(!status.initialized && !status.local_migration_done);
    assert_eq!((counter(&conn, "quotation").unwrap(), counter(&conn, "invoice").unwrap()), (0, 0));
    assert!(!dir.path().join("facturas").exists() || fs::read_dir(dir.path().join("facturas")).unwrap().count() == 0, "archivos limpiados");
    // Un dato inválido también aborta sin dejar nada y se puede reintentar después.
    let mut broken = local_keys();
    broken.insert(K_CUSTOMERS.to_string(), "[{\"sinId\":true}]".into());
    assert!(migrate::migrate_from_local(&conn, dir.path(), &broken, Local::now(), false).is_err());
    assert!(!store::has_data(&conn).unwrap());
    assert!(migrate::migrate_from_local(&conn, dir.path(), &keys, Local::now(), false).is_ok());
}

fn export_from(conn: &Connection, dir: &Path, name: &str) -> std::path::PathBuf {
    let dest = dir.join(name);
    backup::export_to(conn, dir, &dest, chrono::Utc::now()).unwrap();
    dest
}

#[test]
fn export_pick_apply_roundtrip_on_a_new_data_dir() {
    let pc_a = TempDir::new().unwrap();
    let usb = TempDir::new().unwrap();
    let conn_a = open(pc_a.path());
    seed(&conn_a, pc_a.path());
    let result = backup::export_to(&conn_a, pc_a.path(), &usb.path().join("Respaldo.jcm"), chrono::Utc::now()).unwrap();
    assert!(result.size_bytes > 0);
    assert_eq!(result.counts.quotations, 3);
    assert!(!usb.path().join("Respaldo.jcm.tmp").exists(), "no queda temporal");
    let before = snapshot(&conn_a, pc_a.path()).unwrap();
    let totals_a = totals_cents(&conn_a).unwrap();

    let pc_b = TempDir::new().unwrap();
    let (staged, summary) = backup::stage_backup(pc_b.path(), &usb.path().join("Respaldo.jcm"), false).unwrap();
    assert_eq!((summary.kind.as_str(), summary.quotations, summary.customers, summary.invoices), ("jcm", 3, 2, 2));
    assert_eq!((summary.last_quotation_folio, summary.last_invoice_folio), (9, 4));
    let mut slot = Some(open(pc_b.path()));
    let restored = backup::restore(&mut slot, pc_b.path(), &staged, Local::now(), false).unwrap();
    assert_eq!((restored.quotations, restored.customers, restored.invoices), (3, 2, 2));
    let conn_b = slot.as_ref().unwrap();
    assert_eq!(snapshot(conn_b, pc_b.path()).unwrap(), before, "datos idénticos, PDFs incluidos");
    assert_eq!(totals_cents(conn_b).unwrap(), totals_a);
    for n in [1, 2] {
        assert_eq!(sha256_file(&pc_b.path().join(format!("facturas/uuid-{n}.pdf"))).unwrap(), sha256_hex(&pdf_bytes(n)));
    }
    // El siguiente folio es el correcto: el contador sigue donde estaba.
    assert_eq!(bump_counter(conn_b, "quotation", 0).unwrap() + 1, 10);
    assert_eq!(bump_counter(conn_b, "invoice", 0).unwrap() + 1, 5);
    assert!(db::status(conn_b, pc_b.path(), None).unwrap().initialized);
    assert!(!matches!(staged, Staged::Json { .. }));
    assert!(fs::read_dir(pc_b.path()).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with("tmp-restore")));
}

fn forge(source: &Path, workdir: &Path, name: &str, mutate: impl FnOnce(&mut backup::Manifest)) -> std::path::PathBuf {
    let extracted = workdir.join(format!("x-{name}"));
    fs::create_dir_all(&extracted).unwrap();
    let mut manifest = backup::read_jcm(source, Some(&extracted)).unwrap();
    let payloads: Vec<(String, std::path::PathBuf)> = manifest.files.keys().map(|k| (k.clone(), extracted.join(k))).collect();
    mutate(&mut manifest);
    let out = workdir.join(name);
    backup::write_zip(&out, &manifest, &payloads).unwrap();
    out
}

#[test]
fn invalid_backups_are_rejected_without_touching_anything() {
    let pc_a = TempDir::new().unwrap();
    let work = TempDir::new().unwrap();
    let conn_a = open(pc_a.path());
    seed(&conn_a, pc_a.path());
    let good = export_from(&conn_a, work.path(), "good.jcm");

    let pc_b = TempDir::new().unwrap();
    let conn_b = open(pc_b.path());
    apply_changes(&conn_b, pc_b.path(), &[change(K_QUOTATIONS, &list(vec![quotation(7)]))]).unwrap();
    let before = snapshot(&conn_b, pc_b.path()).unwrap();

    fs::write(work.path().join("garbage.jcm"), b"PK\x03\x04esto no es un zip de verdad").unwrap();
    fs::write(work.path().join("random.jcm"), b"hola mundo").unwrap();
    let _tampered = forge(&good, work.path(), "tampered.jcm", |m| {
        m.files.insert("jcmotors.db".into(), "0".repeat(64));
    });
    let _foreign = forge(&good, work.path(), "foreign.jcm", |m| m.app = "otra-app".into());
    let _newer = forge(&good, work.path(), "newer.jcm", |m| m.schema_version = 99);
    let truncated = work.path().join("truncated.jcm");
    let bytes = fs::read(&good).unwrap();
    fs::write(&truncated, &bytes[..bytes.len() / 2]).unwrap();

    let cases: Vec<(&str, &str)> = vec![
        ("garbage.jcm", backup::MSG_DAMAGED),
        ("random.jcm", backup::MSG_NOT_OURS),
        ("tampered.jcm", backup::MSG_HASH),
        ("foreign.jcm", backup::MSG_NOT_OURS),
        ("newer.jcm", backup::MSG_NEWER),
        ("truncated.jcm", backup::MSG_DAMAGED),
    ];
    for (name, message) in cases {
        let error = backup::stage_backup(pc_b.path(), &work.path().join(name), true).unwrap_err();
        assert_eq!(error.0, message, "{name}");
    }
    assert_eq!(snapshot(&conn_b, pc_b.path()).unwrap(), before);
    assert!(fs::read_dir(pc_b.path()).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with("tmp-restore")), "sin carpetas temporales");
    assert!(backup::stage_backup(pc_b.path(), &good, true).is_ok(), "el bueno sí pasa");
}

#[test]
fn failed_restore_leaves_current_data_intact() {
    let pc_a = TempDir::new().unwrap();
    let work = TempDir::new().unwrap();
    let conn_a = open(pc_a.path());
    seed(&conn_a, pc_a.path());
    let good = export_from(&conn_a, work.path(), "good.jcm");

    let pc_b = TempDir::new().unwrap();
    let conn_b = open(pc_b.path());
    apply_changes(&conn_b, pc_b.path(), &[change(K_QUOTATIONS, &list(vec![quotation(70)])), change(K_INVOICES, &list(vec![invoice(50)]))]).unwrap();
    let before = snapshot(&conn_b, pc_b.path()).unwrap();
    let mut slot = Some(conn_b);
    let (staged, summary) = backup::stage_backup(pc_b.path(), &good, true).unwrap();
    assert!(summary.has_current_data);
    let error = backup::restore(&mut slot, pc_b.path(), &staged, Local::now(), true).unwrap_err();
    assert!(error.0.contains("Fallo simulado"));
    let conn = slot.as_ref().expect("la base sigue abierta");
    assert_eq!(snapshot(conn, pc_b.path()).unwrap(), before);
    assert_eq!(fs::read(pc_b.path().join("facturas/uuid-50.pdf")).unwrap(), pdf_bytes(50));
    for leftover in ["jcmotors.db.old", "jcmotors.db.new", "facturas.old"] {
        assert!(!pc_b.path().join(leftover).exists(), "{leftover}");
    }
    // Y se puede reintentar con éxito; antes de reemplazar quedó una copia de lo actual.
    let restored = backup::restore(&mut slot, pc_b.path(), &staged, Local::now(), false).unwrap();
    assert_eq!(restored.quotations, 3);
    let pre: Vec<_> = fs::read_dir(auto_dir(pc_b.path())).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with("pre-restauracion-")).collect();
    assert!(!pre.is_empty());
    // Los folios nunca bajan respecto a lo que ya había (70 > 9 del respaldo).
    assert_eq!(counter(slot.as_ref().unwrap(), "quotation").unwrap(), 70);
}

#[test]
fn restore_from_lote_1_json_backup() {
    let dir = TempDir::new().unwrap();
    let conn = open(dir.path());
    apply_changes(&conn, dir.path(), &[change(K_QUOTATIONS, &list(vec![quotation(40)])), change(K_TEMPLATES, "[{\"id\":\"t1\",\"name\":\"Mi plantilla\"}]")]).unwrap();
    let keys = local_keys();
    let document = json!({"app": "jc-motors", "schemaVersion": 1, "exportedAt": "2026-11-06T18:00:00.000Z", "claves": keys});
    let file = dir.path().join("lote1.json");
    fs::write(&file, serde_json::to_string_pretty(&document).unwrap()).unwrap();
    let (staged, summary) = backup::stage_backup(dir.path(), &file, true).unwrap();
    assert_eq!((summary.kind.as_str(), summary.quotations, summary.invoices, summary.last_quotation_folio), ("json", 3, 2, 9));
    let mut slot = Some(conn);
    // Una falla a medias deja todo como estaba.
    let before = snapshot(slot.as_ref().unwrap(), dir.path()).unwrap();
    assert!(backup::restore(&mut slot, dir.path(), &staged, Local::now(), true).is_err());
    assert_eq!(snapshot(slot.as_ref().unwrap(), dir.path()).unwrap(), before);
    let result = backup::restore(&mut slot, dir.path(), &staged, Local::now(), false).unwrap();
    assert_eq!((result.quotations, result.customers, result.invoices), (3, 1, 2));
    assert_eq!(result.local_keys[K_THEME], "light");
    let conn = slot.as_ref().unwrap();
    let snap = snapshot(conn, dir.path()).unwrap();
    assert_eq!(snap[K_INVOICES], norm(&keys[K_INVOICES]));
    assert!(snap.contains_key(K_TEMPLATES), "un respaldo sin plantillas no borra las locales");
    assert_eq!(counter(conn, "quotation").unwrap(), 40, "no baja");
    assert_eq!(counter(conn, "invoice").unwrap(), 4);
    // Rechazos del formato del lote 1.
    for (name, body) in [
        ("otra.json", "{\"app\":\"otra\",\"schemaVersion\":1,\"exportedAt\":\"2026-01-01T00:00:00Z\",\"claves\":{}}"),
        ("nueva.json", "{\"app\":\"jc-motors\",\"schemaVersion\":2,\"exportedAt\":\"2026-01-01T00:00:00Z\",\"claves\":{}}"),
        ("rota.json", "{\"app\":\"jc-motors\",\"schemaVersion\":1,\"exportedAt\":\"2026-01-01T00:00:00Z\",\"claves\":{\"jc-motors:quotations:v1\":\"[{\"}}"),
    ] {
        fs::write(dir.path().join(name), body).unwrap();
        assert!(backup::stage_backup(dir.path(), &dir.path().join(name), true).is_err(), "{name}");
    }
}

#[test]
fn auto_backup_is_daily_and_keeps_seven() {
    let dir = TempDir::new().unwrap();
    let conn = open(dir.path());
    seed(&conn, dir.path());
    let auto = auto_dir(dir.path());
    fs::create_dir_all(&auto).unwrap();
    for day in 1..=9 {
        fs::write(auto.join(format!("auto-2026-10-{day:02}-0900.db")), b"x").unwrap();
    }
    fs::write(auto.join("pre-migracion-2026-10-01-090000.json"), b"{}").unwrap();
    let now = Local::now();
    assert!(backup::auto_backup(&conn, dir.path(), now).unwrap().is_some());
    assert!(backup::auto_backup(&conn, dir.path(), now).unwrap().is_none(), "una vez al día");
    let mut names: Vec<String> = fs::read_dir(&auto).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.starts_with("auto-")).collect();
    names.sort();
    assert_eq!(names.len(), 7);
    assert!(names.last().unwrap().starts_with(&format!("auto-{}", now.format("%Y-%m-%d"))));
    assert!(!names.contains(&"auto-2026-10-01-0900.db".to_string()));
    assert!(auto.join("pre-migracion-2026-10-01-090000.json").exists(), "las demás copias no rotan");
    let copy = Connection::open(auto.join(names.last().unwrap())).unwrap();
    assert_eq!(counts(&copy).unwrap().quotations, 3);
    let usage = backup::usage(dir.path());
    assert!(usage.db_bytes > 0 && usage.files_count == 2 && usage.auto_count == 7 && usage.auto_bytes > 0);
}

#[test]
fn corrupt_database_is_moved_aside_not_overwritten() {
    let dir = TempDir::new().unwrap();
    {
        let conn = open(dir.path());
        seed(&conn, dir.path());
    }
    let path = db_path(dir.path());
    let mut bytes = fs::read(&path).unwrap();
    for byte in bytes.iter_mut().skip(100).take(4000) {
        *byte = 0xAB;
    }
    let _ = fs::remove_file(dir.path().join("jcmotors.db-wal"));
    let _ = fs::remove_file(dir.path().join("jcmotors.db-shm"));
    fs::write(&path, &bytes).unwrap();
    let opened = db::open_db(dir.path()).unwrap();
    let moved = opened.corrupt_moved_to.clone().expect("debe apartarse");
    assert!(moved.starts_with("jcmotors.db.corrupt-"));
    assert!(dir.path().join(&moved).exists());
    assert!(!store::has_data(&opened.conn).unwrap(), "base nueva vacía");
    assert_eq!(db::user_version(&opened.conn).unwrap(), 1);
    // Una base de una versión más nueva NO se trata como corrupta: se rechaza.
    drop(opened);
    let newer = TempDir::new().unwrap();
    {
        let conn = open(newer.path());
        conn.execute_batch("PRAGMA user_version = 99").unwrap();
    }
    assert!(db::open_db(newer.path()).is_err());
    assert!(!fs::read_dir(newer.path()).unwrap().flatten().any(|e| e.file_name().to_string_lossy().contains("corrupt")));
}

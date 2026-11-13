use crate::share::*;
use std::fs;
use std::time::{Duration, SystemTime};
use tempfile::TempDir;

fn pdf() -> Vec<u8> {
    b"%PDF-1.4 test".to_vec()
}

#[test]
fn sanitize_keeps_accents_and_strips_invalid_chars() {
    assert_eq!(sanitize_file_base("Cotización JC-0005 - Nombre Cliente"), "Cotización JC-0005 - Nombre Cliente");
    assert_eq!(sanitize_file_base("Cotización JC-0005 - Ana <\"/\\|?*:> Pérez"), "Cotización JC-0005 - Ana Pérez");
    assert_eq!(sanitize_file_base("a\u{0}b\r\nc\u{7f}"), "abc");
    assert_eq!(sanitize_file_base("nombre.pdf"), "nombre");
    assert_eq!(sanitize_file_base("nombre... "), "nombre");
    assert_eq!(sanitize_file_base("../../evil"), "....evil");
    assert_eq!(sanitize_file_base("   "), "Documento");
    assert_eq!(sanitize_file_base("???"), "Documento");
    assert_eq!(sanitize_file_base("con"), "_con");
    assert_eq!(sanitize_file_base("NUL.txt"), "_NUL.txt");
    assert_eq!(sanitize_file_base("LPT1"), "_LPT1");
    assert_eq!(sanitize_file_base("console"), "console");
    assert_eq!(sanitize_file_base(&"ñ".repeat(500)).chars().count(), MAX_NAME_CHARS);
}

#[test]
fn save_shared_pdf_writes_forced_pdf_in_dir() {
    let tmp = TempDir::new().unwrap();
    let dir = shared_dir(tmp.path());
    let path = save_shared_pdf_in(&dir, "Cotización JC-0005 - Ana: Pérez", &pdf()).unwrap();
    assert_eq!(path, dir.join("Cotización JC-0005 - Ana Pérez.pdf"));
    assert_eq!(fs::read(&path).unwrap(), pdf());
    assert!(fs::read_dir(&dir).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".tmp")));
    assert!(save_shared_pdf_in(&dir, "x", b"not a pdf").is_err());
    assert!(save_shared_pdf_in(&dir, "x", &[]).is_err());
    let mut huge = pdf();
    huge.resize(MAX_PDF_BYTES + 1, b'x');
    assert!(save_shared_pdf_in(&dir, "x", &huge).is_err());
    // A malicious name never leaves the folder.
    let evil = save_shared_pdf_in(&dir, "..\\..\\x/../y", &pdf()).unwrap();
    assert_eq!(evil.parent().unwrap(), dir);
}

#[test]
fn validate_shared_path_accepts_only_pdf_children() {
    let tmp = TempDir::new().unwrap();
    let dir = shared_dir(tmp.path());
    let ok = save_shared_pdf_in(&dir, "a", &pdf()).unwrap();
    assert_eq!(validate_shared_path(&dir, &ok.to_string_lossy()).unwrap(), ok);
    let outside = tmp.path().join("fuera.pdf");
    fs::write(&outside, pdf()).unwrap();
    assert!(validate_shared_path(&dir, &outside.to_string_lossy()).is_err());
    let traversal = format!("{}/../enviados/a.pdf", dir.display());
    assert!(validate_shared_path(&dir, &traversal).is_err());
    let traversal2 = format!("{}/../fuera.pdf", dir.display());
    assert!(validate_shared_path(&dir, &traversal2).is_err());
    assert!(validate_shared_path(&dir, &dir.join("no-existe.pdf").to_string_lossy()).is_err());
    assert!(validate_shared_path(&dir, &dir.to_string_lossy()).is_err());
    assert!(validate_shared_path(&dir, "").is_err());
    assert!(validate_shared_path(&dir, "a\0.pdf").is_err());
    let txt = dir.join("nota.txt");
    fs::write(&txt, "x").unwrap();
    assert!(validate_shared_path(&dir, &txt.to_string_lossy()).is_err());
    let sub = dir.join("sub");
    fs::create_dir_all(&sub).unwrap();
    fs::write(sub.join("b.pdf"), pdf()).unwrap();
    assert!(validate_shared_path(&dir, &sub.join("b.pdf").to_string_lossy()).is_err());
    assert!(validate_shared_path(&dir, "a.pdf").is_err());
}

#[test]
fn phone_validation() {
    assert_eq!(normalize_phone("6671234567").unwrap(), "6671234567");
    assert_eq!(normalize_phone("(667) 123-4567").unwrap(), "6671234567");
    for bad in ["", "123456789", "66712345678", "+526671234567", "667123456a", "667\n1234567", "٦٦٧١٢٣٤٥٦٧"] {
        assert!(normalize_phone(bad).is_err(), "{bad:?}");
    }
}

#[test]
fn email_validation() {
    for ok in ["ana@correo.com", "ana.perez+taller@sub.dominio.mx", "a_b-c@x-y.io"] {
        assert!(validate_email(ok).is_ok(), "{ok}");
    }
    for bad in [
        "", "ana", "ana@", "@correo.com", "ana@correo", "ana@correo.c", "a b@correo.com", "ana@@correo.com", "ana@correo..com", ".ana@correo.com",
        "ana.@correo.com", "ana,bob@correo.com", "ana@correo.com,bob@x.com", "ana@correo.com\nBcc: x@y.com", "ana<@correo.com", "añá@correo.com",
        "ana@-correo.com", "ana@correo.123",
    ] {
        assert!(validate_email(bad).is_err(), "{bad:?}");
    }
    assert!(validate_email(&format!("{}@correo.com", "a".repeat(65))).is_err());
}

#[test]
fn percent_encoding_handles_special_chars() {
    assert_eq!(percent_encode("Hola Ana"), "Hola%20Ana");
    assert_eq!(percent_encode("cotización"), "cotizaci%C3%B3n");
    assert_eq!(percent_encode("a\nb\r\n"), "a%0Ab%0D%0A");
    assert_eq!(percent_encode("$1,000 #1 & más=?"), "%241%2C000%20%231%20%26%20m%C3%A1s%3D%3F");
    assert_eq!(percent_encode("-._~"), "-._~");
}

#[test]
fn url_builders() {
    let wa = whatsapp_url("(667) 123-4567", "Hola Ana,\nTotal: $1,000 #5 & más").unwrap();
    assert_eq!(wa, "https://wa.me/526671234567?text=Hola%20Ana%2C%0ATotal%3A%20%241%2C000%20%235%20%26%20m%C3%A1s");
    assert!(whatsapp_url("123", "x").is_err());
    assert!(whatsapp_url("6671234567", &"x".repeat(MAX_BODY_CHARS + 1)).is_err());
    let mail = mailto_url("ana@correo.com", "Cotización JC-0005", "Línea 1\nLínea 2 & $").unwrap();
    assert_eq!(mail, "mailto:ana@correo.com?subject=Cotizaci%C3%B3n%20JC-0005&body=L%C3%ADnea%201%0AL%C3%ADnea%202%20%26%20%24");
    let gmail = gmail_url("ana@correo.com", "Asunto #1", "Hola\nmundo").unwrap();
    assert_eq!(gmail, "https://mail.google.com/mail/?view=cm&fs=1&to=ana%40correo.com&su=Asunto%20%231&body=Hola%0Amundo");
    assert!(mailto_url("malo", "a", "b").is_err());
    assert!(gmail_url("ana@correo.com", &"s".repeat(MAX_SUBJECT_CHARS + 1), "b").is_err());
    assert!(gmail_url("ana@correo.com", "a", &"ñ".repeat(MAX_BODY_CHARS)).is_err(), "encoded URL over the cap");
    for url in [&wa, &mail, &gmail] {
        assert!(is_allowed_url(url));
    }
}

#[test]
fn only_allowed_urls_launch() {
    for bad in [
        "http://wa.me/526671234567", "https://evil.com/", "https://wa.me.evil.com/52", "file:///C:/Windows/notepad.exe", "ms-msdt:/id x",
        "javascript:alert(1)", "https://mail.google.com/other", "mailto:a@b.co x", "mailto:a@b.co\nx", "https://wa.me/52667 123",
    ] {
        assert!(!is_allowed_url(bad), "{bad}");
    }
}

#[test]
fn hdrop_buffer_layout() {
    let path = "C:\\a b\\ñ.pdf";
    let buffer = build_hdrop(path);
    assert_eq!(u32::from_le_bytes(buffer[0..4].try_into().unwrap()), 20, "pFiles");
    assert_eq!(&buffer[4..16], &[0u8; 12], "pt and fNC are zero");
    assert_eq!(u32::from_le_bytes(buffer[16..20].try_into().unwrap()), 1, "fWide");
    let units: Vec<u16> = buffer[20..].chunks(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    assert_eq!(units.len(), path.encode_utf16().count() + 2);
    assert_eq!(&units[units.len() - 2..], &[0, 0], "double NUL");
    assert_eq!(String::from_utf16(&units[..units.len() - 2]).unwrap(), path);
}

#[test]
fn cleanup_removes_only_old_pdfs_in_dir() {
    let tmp = TempDir::new().unwrap();
    let dir = shared_dir(tmp.path());
    fs::create_dir_all(dir.join("sub")).unwrap();
    for name in ["viejo.pdf", "nuevo.pdf", "viejo.txt", "sub/viejo.pdf"] {
        fs::write(dir.join(name), pdf()).unwrap();
    }
    fs::write(tmp.path().join("fuera.pdf"), pdf()).unwrap();
    let day30 = Duration::from_secs(30 * 24 * 3600);
    assert_eq!(cleanup_old_pdfs(&dir, SystemTime::now() + Duration::from_secs(29 * 24 * 3600), day30), 0, "nothing is 30 days old yet");
    let future = SystemTime::now() + Duration::from_secs(31 * 24 * 3600);
    let recent = fs::File::options().write(true).open(dir.join("nuevo.pdf")).unwrap();
    recent.set_modified(future - Duration::from_secs(3600)).unwrap();
    drop(recent);
    assert_eq!(cleanup_old_pdfs(&dir, future, day30), 1, "only viejo.pdf: nuevo is recent, txt and subfolder are untouched");
    assert!(!dir.join("viejo.pdf").exists());
    assert!(dir.join("nuevo.pdf").exists());
    assert!(dir.join("viejo.txt").exists());
    assert!(dir.join("sub/viejo.pdf").exists());
    assert!(tmp.path().join("fuera.pdf").exists());
    assert_eq!(cleanup_old_pdfs(&tmp.path().join("no-existe"), future, day30), 0);
}

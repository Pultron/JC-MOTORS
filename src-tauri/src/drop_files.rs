//! Files dropped on the window. Rust keeps the dropped path; the page only learns THAT a file was dropped
//! (a constant script, no data) and then asks for it through `backup_pick_dropped`, which stages the stored path
//! with the same code as `backup_pick`. JavaScript never supplies a path and no event/webview permission is needed.

use std::path::{Path, PathBuf};

/// Constant scripts evaluated in the webview. They carry no data.
pub const DRAG_ENTER_SCRIPT: &str = "window.dispatchEvent(new CustomEvent('jc:file-drag-enter'))";
pub const DRAG_LEAVE_SCRIPT: &str = "window.dispatchEvent(new CustomEvent('jc:file-drag-leave'))";
pub const DROPPED_SCRIPT: &str = "window.dispatchEvent(new CustomEvent('jc:file-dropped'))";
pub const REJECTED_SCRIPT: &str = "window.dispatchEvent(new CustomEvent('jc:file-rejected'))";

fn has_backup_extension(path: &Path) -> bool {
    path.extension().is_some_and(|extension| {
        let extension = extension.to_string_lossy();
        extension.eq_ignore_ascii_case("jcm") || extension.eq_ignore_ascii_case("json")
    })
}

/// A drop is accepted only when it is exactly one file with a `.jcm` or `.json` extension.
/// (The content is still fully validated by `stage_backup`; this is only the first filter.)
pub fn accepted_drop(paths: &[PathBuf]) -> Option<PathBuf> {
    match paths {
        [only] if has_backup_extension(only) => Some(only.clone()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(names: &[&str]) -> Vec<PathBuf> {
        names.iter().map(PathBuf::from).collect()
    }

    #[test]
    fn accepts_one_jcm_or_json_file_in_any_case() {
        assert_eq!(accepted_drop(&paths(&["E:\\Respaldo.jcm"])), Some(PathBuf::from("E:\\Respaldo.jcm")));
        assert!(accepted_drop(&paths(&["a.JSON"])).is_some());
        assert!(accepted_drop(&paths(&["a.JcM"])).is_some());
    }

    #[test]
    fn rejects_other_extensions_no_extension_and_several_files() {
        for name in ["foto.png", "respaldo", "respaldo.jcm.exe", "respaldo.zip", ".jcm"] {
            assert_eq!(accepted_drop(&paths(&[name])), None, "{name}");
        }
        assert_eq!(accepted_drop(&paths(&["a.jcm", "b.jcm"])), None);
        assert_eq!(accepted_drop(&[]), None);
    }
}

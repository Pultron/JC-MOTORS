//! Guard against closing the window with unsaved changes.
//!
//! The webview only tells Rust "the screen is dirty" (a boolean). When the user closes the window while
//! it is dirty, Rust cancels that close once and asks the page to show its own dialog; the page answers by
//! calling `close_app_window` (leave) or `set_close_guard(true)` (keep editing).

use std::sync::atomic::{AtomicBool, Ordering};

/// Constant script evaluated in the webview. Carries no data.
pub const CLOSE_REQUESTED_SCRIPT: &str = "window.dispatchEvent(new CustomEvent('jc:close-requested'))";

#[derive(Default)]
pub struct CloseGuard {
    pub active: AtomicBool,
    /// A close was already intercepted and the page has not answered yet.
    pub pending: AtomicBool,
}

impl CloseGuard {
    pub fn set_active(&self, active: bool) {
        self.active.store(active, Ordering::SeqCst);
        self.pending.store(false, Ordering::SeqCst);
    }

    /// Applies `decide_close` to the current state and returns whether the close must be prevented.
    pub fn on_close_requested(&self) -> bool {
        let decision = decide_close(self.active.load(Ordering::SeqCst), self.pending.load(Ordering::SeqCst));
        if decision.set_pending {
            self.pending.store(true, Ordering::SeqCst);
        }
        decision.prevent
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct CloseDecision {
    pub prevent: bool,
    pub set_pending: bool,
}

/// Prevent the close only when the guard is active and no earlier close is still unanswered.
/// A second close request while one is pending is let through, so the app can never become unclosable.
pub fn decide_close(active: bool, pending: bool) -> CloseDecision {
    if active && !pending {
        CloseDecision { prevent: true, set_pending: true }
    } else {
        CloseDecision { prevent: false, set_pending: false }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inactive_guard_never_prevents() {
        assert_eq!(decide_close(false, false), CloseDecision { prevent: false, set_pending: false });
        assert_eq!(decide_close(false, true), CloseDecision { prevent: false, set_pending: false });
    }

    #[test]
    fn first_close_while_active_is_prevented_and_marks_pending() {
        assert_eq!(decide_close(true, false), CloseDecision { prevent: true, set_pending: true });
    }

    #[test]
    fn second_close_while_pending_is_let_through() {
        assert_eq!(decide_close(true, true), CloseDecision { prevent: false, set_pending: false });
    }

    #[test]
    fn set_active_resets_pending_so_keep_editing_re_arms_the_guard() {
        let guard = CloseGuard::default();
        guard.set_active(true);
        assert!(guard.on_close_requested());
        assert!(!guard.on_close_requested(), "failsafe: unanswered dialog must not trap the app");
        guard.set_active(true);
        assert!(guard.on_close_requested());
        guard.set_active(false);
        assert!(!guard.on_close_requested());
    }
}

//! Licence verification.
//!
//! The open shell has no licence and no check — it simply runs the free
//! engine. This module exists so that the commercial build has exactly one
//! place to answer one question: *is this copy licensed?*
//!
//! Design rules, learned from every licensing system that has ever annoyed a
//! user:
//!   * Offline-first. A licence is a signed token verified locally; the app
//!     must work on a plane.
//!   * Never destructive. An expired or missing licence degrades to the free
//!     shell — it never locks someone out of their own agents or data.

/// Whether this build was compiled with the commercial engine linked.
pub const HAS_ENGINE: bool = cfg!(feature = "licensed");

/// Resolve the licence state for this launch.
///
/// The open build always returns `false`, which selects the free engine —
/// there is nothing to bypass here, because there is nothing to unlock: the
/// org engine is not in this repository.
pub fn is_licensed() -> bool {
    if !HAS_ENGINE {
        return false;
    }
    // Commercial builds verify a signed licence token here (public-key
    // verified, cached locally, revalidated in the background).
    verify_stored_licence()
}

#[cfg(feature = "licensed")]
fn verify_stored_licence() -> bool {
    // Implemented in the commercial build.
    false
}

#[cfg(not(feature = "licensed"))]
fn verify_stored_licence() -> bool {
    false
}

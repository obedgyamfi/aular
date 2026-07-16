//! The agent runtime.
//!
//! AULAR runs two child processes: the Go backend (the app's API and database)
//! and a Hermes gateway (the thing that actually thinks and uses tools). Both
//! are ours to start, supervise, and kill — a user double-clicks an icon and
//! gets a working organization, not a checklist of services to run.
//!
//! They must agree on a shared secret and on ports, so the shell mints those
//! and hands the same values to both. Nothing is read from the ambient
//! environment, because a shipped app has none.

use std::fs;
use std::path::PathBuf;

use rand::RngCore;

/// The app's data directory.
///
/// Deliberately NOT ~/.config/aular — that belongs to the self-hosted stack
/// (its env file and credentials live there), and this app wipes its own data
/// directory during first-run tests. Sharing them took the running server down
/// once; it will not happen again.
pub fn data_dir() -> PathBuf {
    let base = dirs_config().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("aular-desktop");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn dirs_config() -> Option<PathBuf> {
    // Windows puts per-user app data in %APPDATA%, not a dotfile dir.
    #[cfg(windows)]
    if let Some(appdata) = std::env::var_os("APPDATA") {
        return Some(PathBuf::from(appdata));
    }
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs_home().map(|h| h.join(".config")))
}

/// The user's home, on any OS ($HOME on unix, %USERPROFILE% on Windows).
fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// A plain recursive copy — `cp -a` doesn't exist on Windows, and we don't
/// need permissions fidelity, just the files.
fn copy_recursively(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_recursively(&entry.path(), &to.join(entry.file_name()))?;
        }
    } else {
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(from, to)?;
    }
    Ok(())
}

/// The Hermes profile this app owns — never the user's own ~/.hermes, which
/// may belong to something else entirely.
pub fn hermes_home() -> PathBuf {
    data_dir().join("hermes")
}

/// Pre-1.0: every new build starts from clean app data.
///
/// Stale state from an older build has caused more broken first-runs than
/// any bug — a profile without the bundled plugin, a database from a schema
/// three builds back. Until the schema stabilizes and earns real migrations,
/// a build that doesn't recognize the data rotates it aside (one generation
/// kept as `aular-desktop.old`) and starts fresh. Called once, before the
/// backend or gateway see the directory.
pub fn enforce_fresh_data() {
    let dir = data_dir();
    let stamp = dir.join("build-stamp");
    let current = env!("AULAR_BUILD_ID");
    let previous = fs::read_to_string(&stamp).unwrap_or_default();
    if previous.trim() == current {
        return;
    }
    let has_content = fs::read_dir(&dir)
        .map(|mut d| d.next().is_some())
        .unwrap_or(false);
    if has_content {
        let old = dir.with_file_name("aular-desktop.old");
        let _ = fs::remove_dir_all(&old);
        match fs::rename(&dir, &old) {
            Ok(()) => log::info!(
                "runtime: build {current} doesn't know this app data (was {}) — moved to {}",
                if previous.trim().is_empty() { "unstamped" } else { previous.trim() },
                old.display()
            ),
            Err(e) => log::error!("runtime: could not rotate stale app data: {e}"),
        }
    }
    let _ = fs::create_dir_all(&dir);
    let _ = fs::write(&stamp, current);
}

/// The secret the backend and the gateway authenticate to each other with.
/// Created on first run, then stable.
pub fn internal_token() -> String {
    let path = data_dir().join("internal-token");
    if let Ok(existing) = fs::read_to_string(&path) {
        let t = existing.trim().to_string();
        if !t.is_empty() {
            return t;
        }
    }
    let mut raw = [0u8; 32];
    rand::rng().fill_bytes(&mut raw);
    let token = raw.iter().map(|b| format!("{b:02x}")).collect::<String>();
    let _ = fs::write(&path, &token);
    token
}

/// The loopback ports. Fixed, because the webview's CSP has to name them.
pub const API_PORT: &str = "8787";
pub const GATEWAY_PORT: &str = "8644";

/// Where the hermes executable actually is: the user's own install (PATH)
/// wins; otherwise the managed runtime the backend bootstraps into our data
/// directory. None means neither exists yet — onboarding's problem, not ours.
pub fn hermes_executable() -> Option<PathBuf> {
    if let Ok(path) = which("hermes") {
        return Some(path);
    }
    let venv = data_dir().join("hermes-runtime").join("venv");
    let managed = if cfg!(windows) {
        venv.join("Scripts").join("hermes.exe")
    } else {
        venv.join("bin").join("hermes")
    };
    managed.exists().then_some(managed)
}

/// A minimal `which` — enough to answer "is hermes on PATH", without a crate.
fn which(name: &str) -> Result<PathBuf, ()> {
    let exts: &[&str] = if cfg!(windows) { &[".exe", ".cmd", ".bat", ""] } else { &[""] };
    for dir in std::env::split_paths(&std::env::var_os("PATH").ok_or(())?) {
        for ext in exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    Err(())
}

/// Prepare the app's Hermes profile: it needs the AULAR platform plugin and
/// the tool-feed hook, plus an .env that points the gateway back at our own
/// backend. The .env is authoritative — Hermes reads a profile's .env over the
/// ambient environment, which is exactly the behaviour we want here.
///
/// `resources` is the app's bundled `resources/hermes` directory — the copy of
/// the integration that ships with this build. It wins over a developer's
/// ~/.hermes: a fresh machine has no ~/.hermes, and that machine is exactly
/// who the bundle exists for. Without the plugin the gateway has no adapter
/// port and the app cannot deliver a single turn.
pub fn prepare_hermes_profile(resources: Option<PathBuf>) -> std::io::Result<()> {
    let home = hermes_home();
    fs::create_dir_all(home.join("plugins"))?;
    fs::create_dir_all(home.join("hooks"))?;

    // Both sources mirror the same layout; first hit per item wins.
    let mut sources: Vec<PathBuf> = Vec::new();
    if let Some(r) = resources {
        sources.push(r);
    }
    if let Some(h) = dirs_home() {
        sources.push(h.join(".hermes"));
    }
    for rel in ["plugins/aular", "hooks/aular-toolfeed", "config.yaml"] {
        let to = home.join(rel);
        if to.exists() {
            continue;
        }
        for src in &sources {
            let from = src.join(rel);
            if from.exists() {
                let _ = copy_recursively(&from, &to);
                break;
            }
        }
        if !to.exists() {
            log::error!("runtime: could not seed {rel} — no bundled resources and no ~/.hermes");
        }
    }

    // The gateway talks to *our* backend, on *our* port, with *our* secret.
    let env = format!(
        "AULAR_ADAPTER_PORT={GATEWAY_PORT}\n\
         AULAR_INTERNAL_TOKEN={}\n\
         AULAR_CORE_API_URL=http://127.0.0.1:{API_PORT}\n\
         AULAR_ALLOW_ALL_USERS=true\n",
        internal_token()
    );
    fs::write(home.join(".env"), env)?;

    // A stale pid file makes Hermes think a gateway is already running.
    let _ = fs::remove_file(home.join("gateway.pid"));
    Ok(())
}

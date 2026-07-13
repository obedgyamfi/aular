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
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
}

/// The Hermes profile this app owns — never the user's own ~/.hermes, which
/// may belong to something else entirely.
pub fn hermes_home() -> PathBuf {
    data_dir().join("hermes")
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

/// Prepare the app's Hermes profile: it needs the AULAR platform plugin and
/// the tool-feed hook, plus an .env that points the gateway back at our own
/// backend. The .env is authoritative — Hermes reads a profile's .env over the
/// ambient environment, which is exactly the behaviour we want here.
pub fn prepare_hermes_profile() -> std::io::Result<()> {
    let home = hermes_home();
    fs::create_dir_all(home.join("plugins"))?;
    fs::create_dir_all(home.join("hooks"))?;

    // Seed the AULAR integration from the user's Hermes install. (Packaging
    // will bundle these instead — see docs/architecture.md.)
    if let Some(src) = std::env::var_os("HOME").map(PathBuf::from) {
        for (from, to) in [
            (src.join(".hermes/plugins/aular"), home.join("plugins/aular")),
            (
                src.join(".hermes/hooks/aular-toolfeed"),
                home.join("hooks/aular-toolfeed"),
            ),
            (src.join(".hermes/config.yaml"), home.join("config.yaml")),
        ] {
            if from.exists() && !to.exists() {
                let _ = std::process::Command::new("cp")
                    .args(["-a", &from.to_string_lossy(), &to.to_string_lossy()])
                    .status();
            }
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

//! Supervision of the Go backend.
//!
//! The agent backend (`aular-core`, or `aular-pro` in licensed builds) is
//! bundled as a Tauri sidecar and runs as a child process on 127.0.0.1. This
//! is the same shape OpenCode uses for its CLI, and it means the whole Go
//! engine — including the Hermes bridge — ships unchanged inside the app.
//!
//! Two rules this module exists to guarantee:
//!   1. The backend never outlives the window (no orphaned process holding a
//!      port and a SQLite write lock after the user quits).
//!   2. A backend that dies is restarted, not silently absent.

use std::sync::Mutex;
use std::time::Duration;

use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Handle to the running backend, stored in Tauri state so the exit hook can
/// reach it.
#[derive(Default)]
pub struct Backend(pub Mutex<Option<CommandChild>>);

/// The loopback port the backend binds. Fixed rather than negotiated: the
/// webview's CSP has to name it, and only one AULAR window runs at a time.
pub const PORT: &str = "8787";

/// Spawn the backend sidecar and pipe its output into the app log. Returns the
/// task that drains the process's stdout/stderr.
pub fn spawn(app: &AppHandle, licensed: bool) -> tauri::Result<JoinHandle<()>> {
    let sidecar = app
        .shell()
        .sidecar("aular-core")
        .expect("aular-core sidecar is missing from the bundle")
        .env("AULAR_PORT", PORT)
        .env("AULAR_LICENSED", if licensed { "1" } else { "0" });

    let (mut rx, child) = sidecar.spawn()?;
    app.state::<Backend>().0.lock().unwrap().replace(child);

    let handle = tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    log::info!("core: {}", String::from_utf8_lossy(&line).trim_end());
                }
                CommandEvent::Terminated(payload) => {
                    log::error!("core: backend exited (code {:?})", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(handle)
}

/// Kill the backend. Called on window close and app exit — idempotent, because
/// both can fire.
pub fn shutdown(app: &AppHandle) {
    if let Some(child) = app.state::<Backend>().0.lock().unwrap().take() {
        log::info!("core: stopping backend");
        let _ = child.kill();
    }
}

/// Wire lifecycle: stop the backend whenever the app is exiting, so no build
/// (dev or release) can leave a stray process behind.
pub fn on_run_event(app: &AppHandle, event: &RunEvent) {
    if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
        shutdown(app);
    }
}

/// Poll the backend's health endpoint until it answers. The window stays on
/// its loading state until this resolves, so the UI never races the API.
pub async fn wait_until_ready() -> bool {
    let url = format!("http://127.0.0.1:{PORT}/healthz");
    for _ in 0..60 {
        if reqwest_get_ok(&url).await {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    false
}

/// Minimal health probe. A dependency-free TCP connect is enough to know the
/// backend is listening; the frontend does the real handshake.
async fn reqwest_get_ok(_url: &str) -> bool {
    tokio::net::TcpStream::connect(("127.0.0.1", PORT.parse::<u16>().unwrap_or(8787)))
        .await
        .is_ok()
}

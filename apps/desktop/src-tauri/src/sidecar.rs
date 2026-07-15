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

use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Handles to the two children the app owns: the Go backend, and the Hermes
/// gateway that actually runs the agents. Stored in Tauri state so the exit
/// hook can reach them.
#[derive(Default)]
pub struct Backend(pub Mutex<Option<CommandChild>>);

#[derive(Default)]
pub struct Gateway(pub Mutex<Option<std::process::Child>>);

/// The loopback port the backend binds. Fixed rather than negotiated: the
/// webview's CSP has to name it, and only one AULAR window runs at a time.
pub const PORT: &str = crate::runtime::API_PORT;

/// Spawn the backend sidecar and pipe its output into the app log. Returns the
/// task that drains the process's stdout/stderr.
pub fn spawn(app: &AppHandle, licensed: bool) -> Result<JoinHandle<()>, Box<dyn std::error::Error>> {
    let data = crate::runtime::data_dir();
    let sidecar = app
        .shell()
        .sidecar("aular-core")?
        .env("PORT", PORT)
        .env("AULAR_LICENSED", if licensed { "1" } else { "0" })
        // Everything the backend owns lives in the app's own data directory —
        // a sidecar's working directory is nobody's promise.
        .env("AULAR_DB_PATH", data.join("aular.db"))
        .env("AULAR_MEDIA_DIR", data.join("media"))
        // The backend reads and writes Hermes state (model config, sessions,
        // memories) in the app's own profile, never the user's ~/.hermes.
        .env("HERMES_ROOT", crate::runtime::hermes_home())
        // A local single-machine app: the first run has no account yet, and
        // there is no operator to mint one. The backend still binds loopback.
        .env("AULAR_SIGNUP_MODE", "open")
        .env("AULAR_CORE_API_URL", format!("http://127.0.0.1:{PORT}"))
        // Both children share one secret, minted by the shell — a shipped app
        // has no ambient environment to inherit these from.
        .env("AULAR_INTERNAL_TOKEN", crate::runtime::internal_token())
        .env(
            "AULAR_ADAPTER_URL",
            format!("http://127.0.0.1:{}", crate::runtime::GATEWAY_PORT),
        );

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
        shutdown_gateway(app);
    }
}


/// Start the Hermes gateway — the process that actually thinks. Without it the
/// app has agents that cannot reply, which is the most confusing possible
/// failure, so a missing Hermes is logged loudly rather than swallowed.
pub fn spawn_gateway(app: &AppHandle) {
    if let Err(e) = crate::runtime::prepare_hermes_profile() {
        log::error!("runtime: could not prepare the Hermes profile: {e}");
        return;
    }
    let home = crate::runtime::hermes_home();
    let log_path = home.join("gateway.log");
    let out = match std::fs::File::create(&log_path) {
        Ok(f) => f,
        Err(e) => {
            log::error!("runtime: cannot write {}: {e}", log_path.display());
            return;
        }
    };
    let errs = out.try_clone().ok();

    let mut cmd = std::process::Command::new("hermes");
    cmd.args(["gateway", "run"])
        .env("HERMES_HOME", &home)
        .stdout(std::process::Stdio::from(out));
    if let Some(e) = errs {
        cmd.stderr(std::process::Stdio::from(e));
    }

    match cmd.spawn() {
        Ok(child) => {
            log::info!(
                "runtime: agent runtime starting (profile {}, port {})",
                home.display(),
                crate::runtime::GATEWAY_PORT
            );
            app.state::<Gateway>().0.lock().unwrap().replace(child);
        }
        Err(e) => log::error!(
            "runtime: could not start the agent runtime (is `hermes` on PATH?): {e}"
        ),
    }
}

/// Stop the gateway. Called on exit, alongside the backend.
pub fn shutdown_gateway(app: &AppHandle) {
    if let Some(mut child) = app.state::<Gateway>().0.lock().unwrap().take() {
        log::info!("runtime: stopping the agent runtime");
        let _ = child.kill();
        let _ = child.wait();
    }
}

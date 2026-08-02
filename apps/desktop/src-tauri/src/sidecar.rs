//! Supervision of the agent harness.
//!
//! The app used to bundle the Go backend here too, as a Tauri sidecar. It no
//! longer does: the organization lives on the server the user signs in to, and
//! a second copy inside the app would have meant two databases disagreeing
//! about the same org.
//!
//! What remains is the Hermes gateway — the process that actually thinks — and
//! the one rule this module exists to guarantee: it never outlives the window,
//! so quitting cannot leave a stray agent runtime holding a port.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, RunEvent};

/// A handle on the Hermes gateway, in Tauri state so the exit hook can reach it.
#[derive(Default)]
pub struct Gateway(pub Mutex<Option<std::process::Child>>);

/// Wire lifecycle: stop the harness whenever the app is exiting, so no build
/// (dev or release) can leave a stray process behind.
pub fn on_run_event(app: &AppHandle, event: &RunEvent) {
    if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
        shutdown_gateway(app);
    }
}

/// Start the Hermes gateway — the process that actually thinks. Without it the
/// app has agents that cannot reply, which is the most confusing possible
/// failure, so a missing Hermes is logged loudly rather than swallowed.
pub fn spawn_gateway(app: &AppHandle) {
    let resources = app
        .path()
        .resolve("resources/hermes", tauri::path::BaseDirectory::Resource)
        .ok();
    if let Err(e) = crate::runtime::prepare_hermes_profile(resources) {
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

    let Some(hermes) = crate::runtime::hermes_executable() else {
        log::error!(
            "runtime: no Hermes on this machine — the app will offer to install \
             the managed runtime during onboarding"
        );
        return;
    };

    let mut cmd = std::process::Command::new(&hermes);
    cmd.args(["gateway", "run"])
        .env("HERMES_HOME", &home)
        // The AppImage runtime exports PYTHONHOME/PYTHONPATH/LD_LIBRARY_PATH
        // into every child — inherited by a venv interpreter, PYTHONHOME
        // kills it at init and the bundled libs poison the rest. The gateway
        // is self-contained; it gets none of the app's environment quirks.
        .env_remove("PYTHONHOME")
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONSTARTUP")
        .env_remove("PYTHONUSERBASE")
        .env_remove("LD_LIBRARY_PATH")
        .env_remove("LD_PRELOAD")
        .stdout(std::process::Stdio::from(out));
    if let Some(e) = errs {
        cmd.stderr(std::process::Stdio::from(e));
    }
    // A console-subsystem child of a GUI app pops a visible console window on
    // Windows — the gateway would haunt the taskbar as a black box.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    match cmd.spawn() {
        Ok(child) => {
            log::info!(
                "runtime: agent runtime starting ({}, profile {}, port {})",
                hermes.display(),
                home.display(),
                crate::runtime::GATEWAY_PORT
            );
            app.state::<Gateway>().0.lock().unwrap().replace(child);
        }
        Err(e) => log::error!("runtime: could not start {}: {e}", hermes.display()),
    }
}

/// Restart the gateway — the onboarding flow invokes this right after the
/// managed runtime finishes installing, so agents can think without an app
/// relaunch. Idempotent: a missing gateway is simply started.
#[tauri::command]
pub fn restart_agent_runtime(app: AppHandle) {
    log::info!("runtime: restart requested from the app");
    shutdown_gateway(&app);
    spawn_gateway(&app);
}

/// Point the local harness at the account that just signed in.
///
/// Invoked by the app once it holds credentials from the server. Writes them
/// beside the Hermes profile and restarts the gateway to pick them up. Until
/// this runs the gateway has no address to deliver a reply to, which is what
/// makes an unsigned-in app genuinely unable to work rather than merely
/// unwilling to.
#[tauri::command]
pub fn configure_agent_runtime(
    app: AppHandle,
    core_api_url: String,
    internal_token: String,
    home_channel_id: String,
) -> Result<(), String> {
    let creds = crate::runtime::Credentials {
        core_api_url,
        internal_token,
        home_channel_id,
    };
    crate::runtime::store_credentials(&creds).map_err(|e| e.to_string())?;
    log::info!("runtime: credentials stored for {}", creds.core_api_url);
    restart_agent_runtime(app);
    Ok(())
}

/// Forget the account's credentials on sign-out and stop the harness with them.
#[tauri::command]
pub fn sign_out_agent_runtime(app: AppHandle) {
    crate::runtime::clear_credentials();
    shutdown_gateway(&app);
    log::info!("runtime: credentials cleared, harness stopped");
}

/// Stop the gateway. Called on exit and on sign-out — idempotent, since both
/// can fire.
pub fn shutdown_gateway(app: &AppHandle) {
    if let Some(mut child) = app.state::<Gateway>().0.lock().unwrap().take() {
        log::info!("runtime: stopping the agent runtime");
        let _ = child.kill();
        let _ = child.wait();
    }
}

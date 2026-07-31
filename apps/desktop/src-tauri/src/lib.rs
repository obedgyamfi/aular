//! The AULAR desktop shell.
//!
//! Rust's job here is deliberately small: own the window, own the native menu,
//! and own the lifetime of the Go backend. All product behaviour lives either
//! in the webview (SolidJS) or in the backend — which keeps this layer boring,
//! and boring is what you want in the part that can crash the whole app.

mod license;
mod runtime;
mod sidecar;

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

/// What the window remembers between runs, via tauri-plugin-window-state.
///
/// Deliberately not `StateFlags::all()`. That would also carry DECORATIONS and
/// FULLSCREEN: this window is undecorated by design and re-applying a stored
/// decoration state only invites it to fight the config, and a remembered
/// fullscreen is a trap — quit while fullscreen and every later launch opens
/// fullscreen with no titlebar of ours to escape from.
///
/// VISIBLE is not optional. The window starts hidden (see `visible` in
/// tauri.conf.json, which is what stops it flashing at the config size before
/// the saved geometry lands) and the plugin only calls `show()` when this flag
/// is present. Dropping it ships an app that starts and never appears.
const STATE_FLAGS: StateFlags = StateFlags::SIZE
    .union(StateFlags::POSITION)
    .union(StateFlags::MAXIMIZED)
    .union(StateFlags::VISIBLE);

/// True once the user has quit at least once and the plugin has geometry saved.
fn has_saved_window_state(app: &tauri::AppHandle) -> bool {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(tauri_plugin_window_state::DEFAULT_FILENAME).is_file())
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        // Remembers where the user left the window and puts it back — size,
        // position, maximized. Registered on the builder rather than inside
        // `setup` so it is in place before the config's window is created and
        // cannot miss the window-ready hook it restores from.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(STATE_FLAGS)
                .build(),
        )
        .manage(sidecar::Backend::default())
        .manage(sidecar::Gateway::default())
        // No native menu: the window is undecorated and the ☰ menu in the
        // title bar is the app's only menu. Setting one here renders a second
        // menubar inside the window on Linux — two menus, one app.
        .setup(|app| {
            // First launch only: open maximized. Un-maximizing lands on the
            // config's width/height, centred — the compact default — and from
            // then on the window-state plugin owns the geometry entirely.
            //
            // Done here rather than with `maximized: true` in tauri.conf.json
            // because the plugin never un-maximizes on restore: with it in the
            // config, a user who quit windowed would still be re-opened
            // maximized every launch, and their remembered size would only
            // ever be reachable by clicking restore-down again.
            if let Some(window) = app.get_webview_window("main") {
                let first_run = !has_saved_window_state(app.handle());
                if first_run {
                    let _ = window.maximize();
                }
                // The plugin already shows the window when it restores state;
                // this is the backstop that keeps a `visible: false` config
                // from ever meaning an app that starts and never appears.
                let _ = window.show();
                log::info!(
                    "aular: window {} (maximized: {:?})",
                    if first_run { "first run" } else { "restored" },
                    window.is_maximized().ok(),
                );
            }

            runtime::enforce_fresh_data();
            let licensed = license::is_licensed();
            log::info!(
                "aular: starting (engine linked: {}, licensed: {})",
                license::HAS_ENGINE,
                licensed
            );
            sidecar::spawn(app.handle(), licensed)?;
            sidecar::spawn_gateway(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![sidecar::restart_agent_runtime])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                sidecar::shutdown(window.app_handle());
                sidecar::shutdown_gateway(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build AULAR")
        .run(|app, event| sidecar::on_run_event(app, &event));
}

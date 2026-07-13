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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(sidecar::Backend::default())
        .manage(sidecar::Gateway::default())
        // No native menu: the window is undecorated and the ☰ menu in the
        // title bar is the app's only menu. Setting one here renders a second
        // menubar inside the window on Linux — two menus, one app.
        .setup(|app| {
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

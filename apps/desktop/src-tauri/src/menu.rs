//! Native application menu.
//!
//! The window has no OS decorations (the title bar is drawn in the webview),
//! but a real menu still matters: it is where macOS users look for About and
//! Settings, and it gives us the standard keyboard shortcuts for free.

use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;

    let app_menu = Submenu::with_items(
        app,
        "AULAR",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About AULAR"), Some(AboutMetadata::default()))?,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &edit_menu])
}

/// Menu clicks are forwarded to the webview as events; the frontend owns the
/// routing, so the Rust side never needs to know what a Settings page is.
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("menu", id);
    }
}

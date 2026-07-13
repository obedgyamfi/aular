import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import type { MenuAction } from "~/desktop-menu";

// Window controls. We draw them ourselves (the window has no OS decorations),
// so every button here has to actually do what its icon promises.
const win = () => {
  try {
    return getCurrentWindow();
  } catch {
    return undefined; // running in a plain browser during UI development
  }
};

export const windowControls = {
  minimize: () => void win()?.minimize(),
  toggleMaximize: () => void win()?.toggleMaximize(),
  close: () => void win()?.close(),
  startDragging: () => void win()?.startDragging(),
};

export const sidebarOpen = {
  // Toggled from the menu and the toolbar button; the shell reads it.
  value: true,
};

type Listener = () => void;
const listeners = new Set<Listener>();
export function onSidebarToggle(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
  listeners.forEach((fn) => fn());
}

/** Runs a menu action. Editing actions fall through to the webview's own
 *  document commands, which is what opencode does too. */
export function runMenuAction(action: MenuAction) {
  switch (action) {
    case "app.quit":
      windowControls.close();
      return;
    case "app.reload":
      window.location.reload();
      return;
    case "view.toggleSidebar":
      toggleSidebar();
      return;
    case "edit.undo":
    case "edit.redo":
    case "edit.cut":
    case "edit.copy":
    case "edit.paste":
    case "edit.selectAll": {
      const cmd = action.split(".")[1]!;
      document.execCommand(cmd === "selectAll" ? "selectAll" : cmd);
      return;
    }
    case "view.zoomIn":
    case "view.zoomOut":
    case "view.zoomReset": {
      const w = getCurrentWebviewWindow();
      const current = Number(localStorage.getItem("aular-zoom") ?? "1");
      const next =
        action === "view.zoomReset"
          ? 1
          : Math.min(2, Math.max(0.5, current + (action === "view.zoomIn" ? 0.1 : -0.1)));
      localStorage.setItem("aular-zoom", String(next));
      void w?.setZoom(next);
      return;
    }
    default:
      // settings, new agent, docs, about — wired as those surfaces land.
      console.info(`menu action not yet wired: ${action}`);
  }
}

import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// Window controls. We draw them ourselves (the window has no OS decorations),
// so every button here has to actually do what its icon promises.
const win = () => {
  try {
    return getCurrentWindow();
  } catch {
    return undefined; // running in a plain browser during UI development
  }
};

/**
 * The app renders at 80% — its natural 100% reads oversized on a desktop.
 *
 * This used to be CSS (`#root { zoom: .8; width: 125vw }`) and it shipped a
 * broken bundle: Chromium and WebKit disagree about what a zoomed element's
 * containing block is, so the same rule that filled the window in the dev
 * preview laid out 1.25x oversized under WebKitGTK — right and bottom cropped,
 * window controls off-screen, titlebar unclickable. No CSS value satisfies both
 * engines, because one divides the containing block by the zoom and the other
 * doesn't.
 *
 * The webview's OWN page zoom has no such ambiguity: the engine scales and
 * reflows to the real window. In a plain browser there is no webview, so the
 * call no-ops and the dev preview simply renders at 100%.
 */
// 0.8 was the first pass; 0.7 is that look scaled down again — the whole app,
// titlebar included, since the titlebar is part of the page. Ctrl+0 resets to
// this, so a profile that remembered the old scale is one keystroke away.
const UI_SCALE = 0.7;

export function applyUiScale() {
  const saved = Number(localStorage.getItem("aular-zoom"));
  const scale = Number.isFinite(saved) && saved > 0 ? saved : UI_SCALE;
  try {
    void getCurrentWebviewWindow()?.setZoom(scale);
  } catch {
    // A browser tab during UI development — nothing to scale.
  }
}

/**
 * The eight grab directions Tauri accepts. Declared here rather than imported:
 * `ResizeDirection` is declared inside @tauri-apps/api/window but not exported.
 */
export type ResizeEdge =
  | "North"
  | "NorthEast"
  | "East"
  | "SouthEast"
  | "South"
  | "SouthWest"
  | "West"
  | "NorthWest";

/**
 * Begin a window resize from an edge handle.
 *
 * Needs `core:window:allow-start-resize-dragging` in the capability file — the
 * call rejects silently without it, which looks exactly like a dead handle.
 */
export async function startResize(direction: ResizeEdge) {
  try {
    await getCurrentWindow()?.startResizeDragging(direction);
  } catch {
    // A browser tab during UI development — there is no window to resize.
  }
}

/** Nudge the UI scale, and remember it. Ctrl +/-/0, since there is no menu. */
export function nudgeUiScale(step: "in" | "out" | "reset") {
  const current = Number(localStorage.getItem("aular-zoom")) || UI_SCALE;
  const next =
    step === "reset" ? UI_SCALE : Math.min(1.6, Math.max(0.5, current + (step === "in" ? 0.1 : -0.1)));
  const rounded = Math.round(next * 100) / 100;
  localStorage.setItem("aular-zoom", String(rounded));
  try {
    void getCurrentWebviewWindow()?.setZoom(rounded);
  } catch {
    /* browser */
  }
  return rounded;
}

export const windowControls = {
  minimize: () => void win()?.minimize(),
  toggleMaximize: () => void win()?.toggleMaximize(),
  close: () => void win()?.close(),
  startDragging: () => void win()?.startDragging(),
};

type Listener = () => void;

/**
 * Put the cursor in the composer — what the conversation's opening CTA does.
 *
 * A bus rather than a field on the store: the draft belongs to the composer's
 * own editing state, and lifting it into global state would give one string two
 * owners and a race between them.
 */
const composerFocus = new Set<Listener>();
export function onComposerFocus(fn: Listener) {
  composerFocus.add(fn);
  return () => composerFocus.delete(fn);
}
export function focusComposer() {
  composerFocus.forEach((fn) => fn());
}

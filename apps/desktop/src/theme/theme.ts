import { applyTheme, setColorScheme as applySchemeToDom } from "@opencode-ai/ui/theme";
import type { DesktopTheme } from "@opencode-ai/ui/theme";
import { createSignal } from "solid-js";

// Their theme file, vendored verbatim (MIT). The package does not export
// theme JSONs by subpath, and vendoring keeps the colors pinned to a version
// we chose rather than whatever they publish next.
import opencodeTheme from "./themes/opencode.json";

// Colors come from opencode's own theme file, resolved by opencode's own
// resolver. Nothing is re-typed by hand, so every --v2-* token holds exactly
// the value their app uses — and swapping in one of the ~40 other themes they
// ship is a one-line change.
export type ColorScheme = "light" | "dark" | "system";

const SCHEME_KEY = "aular-color-scheme";

function resolve(scheme: ColorScheme): "light" | "dark" {
  if (scheme !== "system") return scheme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

const stored = (localStorage.getItem(SCHEME_KEY) as ColorScheme | null) ?? "system";
const [colorScheme, setSchemeSignal] = createSignal<ColorScheme>(stored);

export { colorScheme };

/** Called once, before the app renders. */
export function initTheme() {
  applyTheme(opencodeTheme as unknown as DesktopTheme);
  applySchemeToDom(resolve(colorScheme()));

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (colorScheme() === "system") applySchemeToDom(resolve("system"));
  });
}

export function setColorScheme(scheme: ColorScheme) {
  setSchemeSignal(scheme);
  localStorage.setItem(SCHEME_KEY, scheme);
  applySchemeToDom(resolve(scheme));
}

import { createSignal } from "solid-js";

// Theme state, persisted the same way OpenCode does it (localStorage keys read
// by public/aular-theme-preload.js before first paint) so there is exactly one
// source of truth and no flash on launch.
export type ColorScheme = "light" | "dark" | "system";

const SCHEME_KEY = "aular-color-scheme";

function resolve(scheme: ColorScheme): "light" | "dark" {
  if (scheme !== "system") return scheme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

const stored = (localStorage.getItem(SCHEME_KEY) as ColorScheme | null) ?? "system";
const [colorScheme, setColorSchemeSignal] = createSignal<ColorScheme>(stored);

export { colorScheme };

export function setColorScheme(scheme: ColorScheme) {
  setColorSchemeSignal(scheme);
  localStorage.setItem(SCHEME_KEY, scheme);
  document.documentElement.setAttribute("data-color-scheme", resolve(scheme));
}

// Follow the OS while the user is on "system".
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (colorScheme() === "system") {
    document.documentElement.setAttribute("data-color-scheme", resolve("system"));
  }
});

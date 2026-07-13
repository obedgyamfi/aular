import {
  resolveThemeVariant,
  resolveThemeVariantV2,
  themeToCss,
  themeV2ToCss,
} from "@opencode-ai/ui/theme";
import type { DesktopTheme } from "@opencode-ai/ui/theme";
import { createSignal } from "solid-js";

// Their theme file, vendored verbatim (MIT). The package does not export theme
// JSONs by subpath, and vendoring keeps the colors pinned to a version we chose
// rather than whatever they publish next.
import opencodeTheme from "./themes/opencode.json";

/**
 * Colors come from opencode's theme file, resolved by opencode's own resolvers,
 * so every --v2-* token holds exactly the value their app uses. Swapping in one
 * of the ~40 other themes they ship stays a one-line change.
 *
 * What we don't use is their `applyTheme` / `setColorScheme` pair. Those emit
 * the light tokens on :root and the dark ones *only* inside
 * `@media (prefers-color-scheme: dark)`, and `setColorScheme` merely sets the
 * CSS `color-scheme` property — which restyles scrollbars and native controls
 * and nothing else. Under that loader an in-app theme switch is inert: the OS
 * decides, and a Light button is a lie.
 *
 * So we emit the same CSS with one addition — a `data-scheme` attribute on the
 * root that forces a variant and outranks the media query in both directions.
 * With no attribute we follow the OS, which is what their loader gives you.
 */
export type ColorScheme = "light" | "dark" | "system";

const SCHEME_KEY = "aular-color-scheme";
const STYLE_ID = "aular-theme";

const stored = (localStorage.getItem(SCHEME_KEY) as ColorScheme | null) ?? "system";
const [colorScheme, setSchemeSignal] = createSignal<ColorScheme>(stored);

export { colorScheme };

function buildCss(theme: DesktopTheme): string {
  const light = [
    themeToCss(resolveThemeVariant(theme.light, false)),
    themeV2ToCss(resolveThemeVariantV2(theme.light, false)),
  ].join("\n  ");
  const dark = [
    themeToCss(resolveThemeVariant(theme.dark, true)),
    themeV2ToCss(resolveThemeVariantV2(theme.dark, true)),
  ].join("\n  ");

  // Light is the base, the OS may upgrade it to dark, and the attribute
  // overrules both — so "Light" wins on a dark desktop, and "Dark" on a light one.
  return `
:root {
  color-scheme: light;
  --text-mix-blend-mode: multiply;
  ${light}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-scheme="light"]) {
    color-scheme: dark;
    --text-mix-blend-mode: plus-lighter;
    ${dark}
  }
}

:root[data-scheme="light"] {
  color-scheme: light;
  --text-mix-blend-mode: multiply;
  ${light}
}

:root[data-scheme="dark"] {
  color-scheme: dark;
  --text-mix-blend-mode: plus-lighter;
  ${dark}
}
`;
}

function applyScheme(scheme: ColorScheme) {
  const root = document.documentElement;
  if (scheme === "system") root.removeAttribute("data-scheme");
  else root.setAttribute("data-scheme", scheme);
}

/** Called once, before the app renders. */
export function initTheme() {
  const theme = opencodeTheme as unknown as DesktopTheme;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildCss(theme);
  document.head.appendChild(style);

  // Their component styles key off the active theme id; keep it set.
  document.documentElement.setAttribute("data-theme", theme.id ?? "opencode");
  applyScheme(colorScheme());
}

export function setColorScheme(scheme: ColorScheme) {
  setSchemeSignal(scheme);
  localStorage.setItem(SCHEME_KEY, scheme);
  applyScheme(scheme);
}

/** What you are actually looking at — "system" resolved against the OS. */
export function resolvedScheme(): "light" | "dark" {
  const scheme = colorScheme();
  if (scheme !== "system") return scheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

import {
  resolveThemeVariant,
  resolveThemeVariantV2,
  themeToCss,
  themeV2ToCss,
} from "@opencode-ai/ui/theme";
import type { DesktopTheme } from "@opencode-ai/ui/theme";
import { createSignal } from "solid-js";

// The AULAR "warm paper" theme. Built on opencode's resolver (MIT) — the palette
// seeds a warm neutral ramp and a coral accent, so every derived --v2-* token
// lands warm and coherent. See src/theme/themes/aular-paper.json.
import aularTheme from "./themes/aular-paper.json";

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
/**
 * Discord's theme set. Onyx and Ash are variations on Dark rather than separate
 * designs — each one re-points the grey ramp and lets every semantic alias
 * chase it, which is why they're a dozen lines each instead of a palette.
 *
 * Honest caveat: Dark and Light carry Discord's published hexes. Onyx and Ash
 * are reconstructed to sit either side of Dark on the same ramp — the right
 * relationships, not necessarily Discord's exact values.
 */
export type ColorScheme = "light" | "dark" | "onyx" | "ash" | "constellation" | "system";

/**
 * The accent themes: Dark's greys with a different colour identity.
 *
 * They're four lines each because only the accent ramp moves — every semantic
 * alias references `--blurple`, and a var() reference resolves where it's USED,
 * so redefining the ramp after the dark block re-points the whole app. The
 * sign-in backdrop tints off the same token, which is what makes these read as
 * themes rather than recoloured buttons.
 *
 * `--on-accent` is per-theme on purpose: white on Citron's yellow is unreadable,
 * so that one flips to near-black.
 */
/**
 * Accent themes are NOT tinted panels. The surfaces stay neutral near-black and
 * go translucent; the colour arrives from the constellation field behind them.
 *
 * Mixing the accent into every token was tried and was wrong — it turned each
 * panel into a flat wash of the colour and buried the field entirely, which is
 * the opposite of what the constellation is for. The only thing that carries
 * the hue is the accent itself (buttons, the active tile) and the gradient in
 * the field.
 *
 * The alphas climb with depth (rail most opaque, conversation least) so the
 * three-tone stack still reads in order and prose keeps its contrast.
 */
const ACCENT_SURFACES = `
  --bg:rgba(14,14,18,.72);
  --sidebar:rgba(10,10,13,.80);
  --rail:rgba(6,6,9,.86);
  --user-panel:rgba(8,8,11,.84);
  --tile:rgba(28,28,34,.85);
  --surface:rgba(12,12,16,.82);
  --surface-2:rgba(18,18,23,.82);
  --element:rgba(32,32,39,.85);
  --element-hover:rgba(42,42,50,.88);
  --element-active:rgba(54,54,64,.9);
  --row-hover:rgba(30,30,38,.5);
  --line:rgba(255,255,255,.07);
  --line-strong:rgba(255,255,255,.13);
`;


/** Darker than Dark: the rail goes to true black and the chat follows it down. */
const DESIGN_ONYX = `
  --grey-1:#131316;--grey-2:#0e0e11;--grey-3:#0a0a0c;--grey-4:#000000;--grey-5:#26262b;--grey-6:#33333a;--grey-7:#44444d;--grey-8:#5c5c66;--grey-9:#8e8e99;--grey-10:#b3b3bd;--grey-11:#d9d9e0;--grey-12:#f2f3f5;
  --element:#1c1c21;--element-hover:#24242a;--row-hover:#17171b;
`;

/** Lighter than Dark: the same stack lifted, for people who find Dark heavy. */
const DESIGN_ASH = `
  --grey-1:#3b3d44;--grey-2:#34363c;--grey-3:#2d2f34;--grey-4:#26282d;--grey-5:#4a4c54;--grey-6:#585b64;--grey-7:#6a6d77;--grey-8:#7d808a;--grey-9:#a2a5ad;--grey-10:#c2c5cb;--grey-11:#dfe1e5;--grey-12:#f5f6f8;
  --element:#45474f;--element-hover:#4e5058;--row-hover:#3f4148;
`;

const SCHEME_KEY = "aular-color-scheme";
const STYLE_ID = "aular-theme";

const stored = (localStorage.getItem(SCHEME_KEY) as ColorScheme | null) ?? "system";
const [colorScheme, setSchemeSignal] = createSignal<ColorScheme>(stored);

export { colorScheme };

/**
 * The Discord palette.
 *
 * This REPLACED the warm-paper handoff tokens: rounding AULAR's own theme only
 * ever produced "the same app with softer corners", because on a chat surface
 * the palette carries most of the identity. These are Discord's actual values —
 * the cool near-neutral greys, the three-step surface stack (rail darkest,
 * channel list mid, conversation lightest) and blurple.
 *
 * The alias names below (--bg, --sidebar, --element, --text, --accent…) are
 * unchanged, and the v2 bridge points opencode's tokens at the same aliases, so
 * every component in the app re-themes from this one block. To go back to warm
 * paper, restore these two strings — nothing else knows the difference.
 *
 * Dark is the real Discord; light is their light theme, kept working because the
 * titlebar toggle would otherwise be a lie.
 */
const DESIGN_LIGHT = `
  --grey-1:#ffffff;--grey-2:#f2f3f5;--grey-3:#ebedef;--grey-4:#e3e5e8;--grey-5:#dbdee1;--grey-6:#d7d9dc;--grey-7:#c4c9ce;--grey-8:#80848e;--grey-9:#5c5e66;--grey-10:#4e5058;--grey-11:#313338;--grey-12:#060607;
  --blurple-soft:#e0e3ff;--blurple:#5865f2;--blurple-hover:#4752c4;--blurple-text:#3b45c4;
  --green-soft:#dcf5e6;--green:#1a8245;--amber-soft:#fdf2d8;--amber:#a8730f;--red-soft:#fde2e2;--red:#d83c3e;--blue-soft:#ddeffd;--blue:#0f7ec2;
  --bg:var(--grey-1);--sidebar:var(--grey-2);--surface:var(--grey-1);--surface-2:var(--grey-2);--element:var(--grey-4);--element-hover:var(--grey-5);--element-active:var(--grey-6);--line:var(--grey-4);--line-strong:var(--grey-7);--text:var(--grey-12);--text-2:var(--grey-11);--muted:var(--grey-9);--faint:var(--grey-8);--accent:var(--blurple);--accent-2:#8b5cf6;--accent-grad:linear-gradient(135deg,var(--blurple) 0%,var(--accent-2) 100%);--accent-hover:var(--blurple-hover);--accent-soft:var(--blurple-soft);--accent-text:var(--blurple-text);--on-accent:#fff;
  /* Discord's tone stack, as named surfaces. The ORDER is the signature: the
     rail is darkest, then the channel list, and the conversation is lightest.
     Get that inverted and a clone reads wrong even with every hex correct.
     Nothing floats — the columns are welded edge to edge and these tones ARE
     the seams, which is why there's no plane behind them to show through.
       --rail       the server rail
       --user-panel the strip under the channel list
       --tile       an inactive rail tile — must be LIGHTER than the rail or the
                    tiles disappear into it
       --row-hover  Discord's message hover: barely there, a half-step off --bg,
                    nothing like a button's hover */
  --rail:var(--grey-4);--user-panel:var(--grey-3);--tile:var(--grey-1);--row-hover:var(--grey-2);
  /* Discord's tooltip is near-black in BOTH schemes — it's a floating label, not
     a surface, so it doesn't chase the theme the way the panels do. */
  --tooltip:#111214;
  --shadow-1:0 1px 0 rgba(6,6,7,.06),0 2px 6px rgba(6,6,7,.06);--shadow-2:0 8px 24px rgba(6,6,7,.18);
  /* Discord's rounding, on the generous side: 8px is its workhorse (rows,
     inputs, buttons), 16–24px on the big panels of the current redesign, and
     circles for every avatar. */
  --r1:4px;--r2:8px;--r3:12px;--r4:16px;--r5:24px;--pill:999px;
  /* No serif anywhere: Discord sets the whole product in one sans, so the token
     that used to carry Georgia now points at the UI face. */
  --serif:"Inter",ui-sans-serif,system-ui,-apple-system,sans-serif;
`;

/**
 * Discord dark — the one people picture. The surface stack is the giveaway and
 * has to stay in this order: #1e1f22 server rail (darkest), #2b2d31 channel
 * list, #313338 conversation (lightest). Getting that inverted is what makes a
 * clone look "off" even when every other value is right.
 */
const DESIGN_DARK = `
  --grey-1:#313338;--grey-2:#2b2d31;--grey-3:#232428;--grey-4:#1e1f22;--grey-5:#3f4147;--grey-6:#4e5058;--grey-7:#5c5e66;--grey-8:#6d6f78;--grey-9:#949ba4;--grey-10:#b5bac1;--grey-11:#dbdee1;--grey-12:#f2f3f5;
  --blurple-soft:#3c4270;--blurple:#5865f2;--blurple-hover:#4752c4;--blurple-text:#949cf7;
  --green-soft:#1f3d2b;--green:#23a55a;--amber-soft:#3d3320;--amber:#f0b232;--red-soft:#3d2224;--red:#f23f43;--blue-soft:#1e3a4d;--blue:#00a8fc;
  --bg:var(--grey-1);--sidebar:var(--grey-2);--surface:var(--grey-2);--surface-2:var(--grey-3);--element:#383a40;--element-hover:#404249;--element-active:var(--grey-6);--line:var(--grey-5);--line-strong:var(--grey-6);--text:var(--grey-12);--text-2:var(--grey-11);--muted:var(--grey-9);--faint:var(--grey-8);--on-accent:#fff;
  /* On dark, hover has to go LIGHTER than the conversation, so it can't ride the
     grey ramp (grey-2 is darker than grey-1 here). Discord's exact value. */
  --row-hover:#32353b;
  --shadow-1:0 1px 0 rgba(0,0,0,.2),0 2px 8px rgba(0,0,0,.28);--shadow-2:0 8px 24px rgba(0,0,0,.48);
`;

/**
 * Bridge: every semantic v2 token the components use, re-pointed at the design
 * tokens. This is what makes the EXISTING component fleet render the design's
 * exact surfaces instead of the resolver's approximations. References resolve
 * per-element, so one bridge serves both schemes.
 */
const V2_BRIDGE = `
  --v2-background-bg-base:var(--bg);
  --v2-background-bg-deep:var(--sidebar);
  --v2-background-bg-layer-01:var(--surface-2);
  --v2-background-bg-layer-02:var(--element);
  --v2-background-bg-layer-03:var(--element-hover);
  --v2-background-bg-layer-04:var(--element-hover);
  --v2-background-bg-accent:var(--accent);
  --v2-background-bg-button-neutral:var(--surface);
  --v2-background-bg-contrast:var(--text);
  --v2-background-bg-inverse:var(--text);
  --v2-border-border-muted:var(--line);
  --v2-border-border-base:var(--line);
  --v2-border-border-strong:var(--line-strong);
  --v2-border-border-focus:var(--accent);
  --v2-text-text-base:var(--text);
  --v2-text-text-muted:var(--muted);
  --v2-text-text-faint:var(--faint);
  --v2-text-text-accent:var(--accent-text);
  --v2-text-text-accent-hover:var(--accent);
  --v2-text-text-inverse:var(--on-accent);
  --v2-text-text-contrast:var(--bg);
  --v2-icon-icon-base:var(--text-2);
  --v2-icon-icon-muted:var(--muted);
  --v2-icon-icon-accent:var(--accent);
  --v2-state-bg-success:var(--green-soft);--v2-state-fg-success:var(--green);--v2-state-border-success:var(--green-soft);
  --v2-state-bg-warning:var(--amber-soft);--v2-state-fg-warning:var(--amber);--v2-state-border-warning:var(--amber-soft);
  --v2-state-bg-danger:var(--red-soft);--v2-state-fg-danger:var(--red);--v2-state-border-danger:var(--red-soft);
  --v2-state-bg-info:var(--blue-soft);--v2-state-fg-info:var(--blue);--v2-state-border-info:var(--blue-soft);
  --v2-overlay-simple-overlay-hover:var(--element-hover);
  --v2-overlay-simple-overlay-pressed:var(--element);
`;

function buildCss(theme: DesktopTheme): string {
  // The resolver output still supplies opencode's primitives (their own
  // components read them); the design tokens + bridge come AFTER, so on every
  // semantic slot the design's exact value wins.
  const light = [
    themeToCss(resolveThemeVariant(theme.light, false)),
    themeV2ToCss(resolveThemeVariantV2(theme.light, false)),
    DESIGN_LIGHT,
    V2_BRIDGE,
  ].join("\n  ");
  const dark = [
    themeToCss(resolveThemeVariant(theme.dark, true)),
    themeV2ToCss(resolveThemeVariantV2(theme.dark, true)),
    DESIGN_LIGHT,
    DESIGN_DARK,
    V2_BRIDGE,
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

:root[data-scheme="onyx"] {
  color-scheme: dark;
  --text-mix-blend-mode: plus-lighter;
  ${dark}
  ${DESIGN_ONYX}
}

:root[data-scheme="ash"] {
  color-scheme: dark;
  --text-mix-blend-mode: plus-lighter;
  ${dark}
  ${DESIGN_ASH}
}

:root[data-scheme="constellation"] {
  color-scheme: dark;
  --text-mix-blend-mode: plus-lighter;
  ${dark}
  ${ACCENT_SURFACES}
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
  const theme = aularTheme as unknown as DesktopTheme;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildCss(theme);
  document.head.appendChild(style);

  // Their component styles key off the active theme id; keep it set.
  document.documentElement.setAttribute("data-theme", theme.id ?? "opencode");
  applyScheme(colorScheme());
  if (storedAccent) setAccent(storedAccent);
}

export function setColorScheme(scheme: ColorScheme) {
  setSchemeSignal(scheme);
  localStorage.setItem(SCHEME_KEY, scheme);
  applyScheme(scheme);
}

// ── accent ──────────────────────────────────────────────────────────────────
//
// The accent is a separate axis from the theme: a theme decides SURFACES, an
// accent decides COLOUR. It's applied as inline custom properties on the root,
// which outrank whatever the scheme's stylesheet block set, so any accent works
// on any theme without a combinatorial explosion of CSS blocks.

const ACCENT_KEY = "aular-accent";

/** Hex → the five tokens the app derives everything else from. */
function ramp(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const rgb = (rr: number, gg: number, bb: number) =>
    `#${[rr, gg, bb].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
  const shift = (k: number) => rgb(r * k, g * k, b * k);
  const toward = (t: number, tr: number, tg: number, tb: number) =>
    rgb(r + (tr - r) * t, g + (tg - g) * t, b + (tb - b) * t);

  // Relative luminance, to decide what can legibly sit ON this colour. A yellow
  // accent needs near-black text; most others take white.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  return {
    "--blurple": hex,
    "--blurple-hover": shift(0.82),
    "--blurple-text": toward(0.42, 255, 255, 255),
    "--blurple-soft": toward(0.82, 20, 20, 24),
    // The gradient's far stop: the same hue rotated warm, so every accent gets
    // a gradient rather than a flat fill.
    "--accent-2": toward(0.28, 255, 190, 120),
    "--on-accent": lum > 0.62 ? "#1a1a1e" : "#fff",
  } as Record<string, string>;
}

const storedAccent = localStorage.getItem(ACCENT_KEY);
const [accent, setAccentSignal] = createSignal<string | null>(storedAccent);
export { accent };

/**
 * Paint an accent. `null` clears the override and hands colour back to the
 * theme's own block.
 *
 * `remember: false` is what dynamic accenting uses — it follows the selected
 * agent turn by turn, and persisting every hop would overwrite the fixed accent
 * the user actually chose.
 */
export function setAccent(hex: string | null, remember = true) {
  const root = document.documentElement;
  const keys = [
    "--blurple",
    "--blurple-hover",
    "--blurple-text",
    "--blurple-soft",
    "--accent-2",
    "--on-accent",
  ];
  if (!hex) {
    keys.forEach((k) => root.style.removeProperty(k));
  } else {
    const vars = ramp(hex);
    keys.forEach((k) => root.style.setProperty(k, vars[k]!));
  }
  if (remember) {
    setAccentSignal(hex);
    if (hex) localStorage.setItem(ACCENT_KEY, hex);
    else localStorage.removeItem(ACCENT_KEY);
  }
}

/** True when the app should mount the star field behind its panels. */
export function hasBackdrop(): boolean {
  return colorScheme() === "constellation";
}

/**
 * Light or dark, for anything that only cares which side it's on. Onyx and Ash
 * are dark themes, so they answer "dark".
 */
export function resolvedScheme(): "light" | "dark" {
  const scheme = colorScheme();
  if (scheme === "light") return "light";
  if (scheme !== "system") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

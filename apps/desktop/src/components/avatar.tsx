import { createAvatar } from "@dicebear/core";
import {
  adventurer,
  avataaars,
  bigSmile,
  bottts,
  lorelei,
  micah,
  notionists,
  openPeeps,
  personas,
  pixelArt,
  toonHead,
} from "@dicebear/collection";

import { settings, type AvatarStyle } from "~/lib/settings";

/**
 * An agent's portrait: a generated character on a gradient, always circular.
 *
 * Initials on a flat tile said nothing — seventeen coloured squares reading
 * "MI", "SO", "TH" is a legend, not a roster. A character face is recognisable
 * at 28px and, being seeded off the name, is stable everywhere that agent
 * appears without storing an image anywhere.
 *
 * The shape is no longer a preference. A portrait is round in every product
 * that has them, and letting it be a rounded square somewhere made the same
 * agent look like two different things in two columns.
 *
 * The style is a preference (Settings ▸ Appearance). Every option below ships
 * in the bundle already and is licensed for commercial use — CC0, CC BY 4.0, or
 * the Avataaars/Bottts "free for personal and commercial" grant. Real anime
 * characters are deliberately absent: they're copyrighted, and shipping them in
 * a product is a licensing problem rather than a taste one.
 *
 * ATTRIBUTION: the CC BY 4.0 styles require crediting their designer wherever
 * they're used. Settings ▸ Appearance names the designer of whichever style is
 * active, which is what discharges that.
 */
export const AVATAR_STYLES: {
  id: AvatarStyle;
  label: string;
  by: string;
  license: string;
}[] = [
  { id: "lorelei", label: "Lorelei", by: "Lisa Wischofsky", license: "CC0 1.0" },
  { id: "adventurer", label: "Adventurer", by: "Lisa Wischofsky", license: "CC BY 4.0" },
  { id: "notionists", label: "Notionists", by: "Zoish", license: "CC0 1.0" },
  { id: "personas", label: "Personas", by: "Draftbit", license: "CC BY 4.0" },
  { id: "micah", label: "Micah", by: "Micah Lanier", license: "CC BY 4.0" },
  { id: "bigSmile", label: "Big Smile", by: "Ashley Seo", license: "CC BY 4.0" },
  { id: "avataaars", label: "Avataaars", by: "Pablo Stanley", license: "Free for commercial use" },
  { id: "openPeeps", label: "Open Peeps", by: "Pablo Stanley", license: "CC0 1.0" },
  { id: "toonHead", label: "Toon Head", by: "Johan Melin", license: "CC BY 4.0" },
  { id: "pixelArt", label: "Pixel Art", by: "DiceBear", license: "CC0 1.0" },
  { id: "bottts", label: "Bottts", by: "Pablo Stanley", license: "Free for commercial use" },
];

/**
 * Each DiceBear style declares its OWN options type, so a union of eleven of
 * them has no satisfiable common shape — the lookup is deliberately loose, and
 * the options passed below are the subset every style accepts.
 */
const STYLES: Record<AvatarStyle, Parameters<typeof createAvatar>[0]> = {
  lorelei,
  adventurer,
  notionists,
  personas,
  micah,
  bigSmile,
  avataaars,
  openPeeps,
  toonHead,
  pixelArt,
  bottts,
};

/**
 * The palette. It began as avatar backgrounds and is now the app's accent set
 * too — twelve muted hues that already read well behind a portrait, which is
 * exactly the constraint an accent has to satisfy.
 */
export const SWATCHES = [
  "#b5765a",
  "#8a9a7b",
  "#7b8fa3",
  "#a3799a",
  "#9a8a5f",
  "#6f9a93",
  "#a3705f",
  "#7b7ba3",
  "#8f9a5f",
  "#9a6f7b",
  "#5f8aa3",
  "#a38a5f",
];

function hash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

/** The agent's base colour — still used by banners and the org canvas. */
export function avatarColor(name: string): string {
  return SWATCHES[hash(name) % SWATCHES.length]!;
}

/**
 * The portrait's backdrop, as a gradient rather than a flat fill: two
 * neighbouring swatches on a diagonal, so a face sits on depth instead of a
 * paint chip.
 */
export function avatarGradient(name: string): string {
  const h = hash(name);
  const a = SWATCHES[h % SWATCHES.length]!;
  const b = SWATCHES[(h + 5) % SWATCHES.length]!;
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * Generating the SVG is not free and the roster re-renders constantly (unread
 * counts, presence, previews), so each name is rendered once and kept.
 */
const portraits = new Map<string, string>();

/** Keyed by style AND name: switching styles must not serve the old face. */
export function portrait(name: string, style: AvatarStyle): string {
  const key = `${style}:${name}`;
  let uri = portraits.get(key);
  if (uri === undefined) {
    uri = createAvatar(STYLES[style] ?? lorelei, {
      seed: name,
      // Transparent: the gradient underneath is the background.
      backgroundColor: ["transparent"],
      scale: 96,
    }).toDataUri();
    portraits.set(key, uri);
  }
  return uri;
}

export function Avatar(props: { name: string; size?: number; circle?: boolean }) {
  const size = () => props.size ?? 36;

  return (
    <span
      aria-label={props.name}
      class="grid shrink-0 select-none place-items-center overflow-hidden rounded-full"
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        background: avatarGradient(props.name),
      }}
    >
      <img
        src={portrait(props.name, settings.avatarStyle)}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </span>
  );
}

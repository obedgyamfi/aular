// Deterministic agent avatars — ported from the prototype (lib/avatar.ts).
//
// Generated locally as SVG data-URIs from the agent's name, so they are stable
// across reloads and need no network. Style is user-selectable in Settings.

import { createAvatar, type Style } from "@dicebear/core";
import {
  adventurer,
  bottts,
  funEmoji,
  glass,
  lorelei,
  micah,
  notionists,
  personas,
  pixelArt,
  shapes,
} from "@dicebear/collection";

export type AvatarStyleId =
  | "notionists"
  | "glass"
  | "shapes"
  | "personas"
  | "micah"
  | "adventurer"
  | "lorelei"
  | "funEmoji"
  | "bottts"
  | "pixelArt";

export const AVATAR_STYLES: { id: AvatarStyleId; label: string }[] = [
  { id: "notionists", label: "Notionists" },
  { id: "glass", label: "Glass" },
  { id: "shapes", label: "Shapes" },
  { id: "personas", label: "Personas" },
  { id: "micah", label: "Micah" },
  { id: "adventurer", label: "Adventurer" },
  { id: "lorelei", label: "Lorelei" },
  { id: "funEmoji", label: "Fun Emoji" },
  { id: "bottts", label: "Bottts" },
  { id: "pixelArt", label: "Pixel Art" },
];

// Each style has its own Options type, so a map of them widens to a union that
// createAvatar's generic can't unify. The styles are interchangeable at runtime
// (that is the point of the collection), so erase the option type here rather
// than fight it at every call site.
const styles: Record<AvatarStyleId, Style<Record<string, unknown>>> = {
  notionists,
  glass,
  shapes,
  personas,
  micah,
  adventurer,
  lorelei,
  funEmoji,
  bottts,
  pixelArt,
} as unknown as Record<AvatarStyleId, Style<Record<string, unknown>>>;

const cache = new Map<string, string>();

export function avatarSvgUri(seed: string, style: AvatarStyleId = "notionists"): string {
  const key = `${style}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const uri = createAvatar(styles[style] ?? styles.notionists, {
    seed,
    radius: 50,
  }).toDataUri();

  cache.set(key, uri);
  return uri;
}

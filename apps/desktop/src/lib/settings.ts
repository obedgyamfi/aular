import { createStore } from "solid-js/store";

import type { AvatarStyleId } from "./avatar";

/**
 * Local, per-device preferences — how the shell looks and behaves on *this*
 * machine. Distinct from the account, which owns the organization: your agents,
 * what they know, how they're arranged. That travels with you; this doesn't.
 *
 * The color scheme lives in `~/theme/theme.ts` instead, because it has to reach
 * the DOM before the app renders.
 */
export interface Profile {
  /** Overrides the account's display name in the shell. Blank = use the account. */
  name: string;
  email: string;
  bio: string;
  /** A photo you uploaded. Blank = the generated avatar. */
  avatarDataUrl: string;
}

interface Settings {
  profile: Profile;
  avatarStyle: AvatarStyleId;
  notifications: boolean;
  reduceMotion: boolean;
  mutedAgents: string[];
}

const KEY = "aular-settings";

const defaults: Settings = {
  profile: { name: "", email: "", bio: "", avatarDataUrl: "" },
  avatarStyle: "notionists",
  notifications: false,
  reduceMotion: false,
  mutedAgents: [],
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      return {
        ...defaults,
        ...saved,
        profile: { ...defaults.profile, ...(saved.profile ?? {}) },
      };
    }
  } catch {
    /* corrupt or unavailable storage — fall back to defaults */
  }
  return defaults;
}

const [settings, setSettings] = createStore<Settings>(load());

export { settings };

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore: a full disk shouldn't take the app down */
  }
}

/** Reduced motion is a CSS concern; the root class is what the styles read. */
function applyMotion(reduce: boolean) {
  document.documentElement.classList.toggle("reduce-motion", reduce);
}
applyMotion(settings.reduceMotion);

export const settingsActions = {
  setProfile(patch: Partial<Profile>) {
    setSettings("profile", patch);
    persist();
  },
  setAvatarStyle(avatarStyle: AvatarStyleId) {
    setSettings("avatarStyle", avatarStyle);
    persist();
  },
  setNotifications(on: boolean) {
    setSettings("notifications", on);
    persist();
  },
  setReduceMotion(on: boolean) {
    setSettings("reduceMotion", on);
    applyMotion(on);
    persist();
  },
  toggleMute(agentId: string) {
    setSettings("mutedAgents", (list) =>
      list.includes(agentId) ? list.filter((id) => id !== agentId) : [...list, agentId],
    );
    persist();
  },
  isMuted: (agentId: string) => settings.mutedAgents.includes(agentId),
};

/**
 * Downscale a picked image to a square data URI. Photos land in localStorage,
 * so a 4 MB camera JPEG would blow the quota — 256px is plenty for an avatar.
 */
export async function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2, // center-crop to a square
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

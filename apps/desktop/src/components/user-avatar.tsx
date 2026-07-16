import { Show } from "solid-js";

import { Avatar } from "~/components/avatar";
import { settings } from "~/lib/settings";
import { state } from "~/lib/store";

/** The name to show for the signed-in user: their override, then the account. */
export function userName(): string {
  return (
    settings.profile.name ||
    state.user?.display_name ||
    state.user?.email?.split("@")[0] ||
    "Account"
  );
}

export function userEmail(): string {
  return settings.profile.email || state.user?.email || "";
}

/**
 * You, in the shell. An uploaded photo wins; otherwise the generated avatar,
 * seeded from your name, exactly like every agent's.
 */
export function UserAvatar(props: { size?: number }) {
  const size = () => props.size ?? 26;
  return (
    <Show when={settings.profile.avatarDataUrl} fallback={<Avatar name={userName()} size={size()} />}>
      <img
        src={settings.profile.avatarDataUrl}
        alt={userName()}
        class="shrink-0 rounded-full object-cover"
        style={{ width: `${size()}px`, height: `${size()}px` }}
      />
    </Show>
  );
}

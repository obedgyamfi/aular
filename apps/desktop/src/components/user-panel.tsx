import SettingsIcon from "lucide-solid/icons/settings";

import { Avatar } from "~/components/avatar";
import { Notifications } from "~/components/notifications";
import { Tooltip } from "~/components/tooltip";
import { actions, state } from "~/lib/store";

/**
 * The user panel — Discord's, and positioned the way Discord's actually is.
 *
 * Not a strip inside the sidebar: a rounded card floating over the bottom of
 * BOTH left columns, rail and sidebar together. That's why it's rendered by the
 * shell rather than by either column — neither one owns it, and putting it
 * inside the sidebar would have clipped it to that column's width.
 *
 * The lists above it are padded to clear it, since it hovers rather than
 * displacing anything.
 *
 * Where Discord puts mic and headphones we put the one control an org needs:
 * notifications.
 */
export function UserPanel() {
  const name = () =>
    state.user?.display_name || state.user?.email?.split("@")[0] || "Founder";

  return (
    <div class="pointer-events-auto absolute inset-x-2 bottom-2 z-30 flex items-center gap-1 rounded-[var(--r3)] border border-[var(--line)] bg-[var(--user-panel)] px-2 py-1.5 shadow-[var(--shadow-2)]">
      <button
        type="button"
        onClick={() => actions.openSettings("general")}
        title={`${name()} — your account`}
        class="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--r2)] px-1 py-0.5 text-left transition-colors hover:bg-[var(--element-hover)]"
      >
        <Avatar name={name()} size={32} circle />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[14px] font-semibold leading-[18px] text-[var(--text)]">
            {name()}
          </span>
          <span class="block truncate text-[12px] leading-4 text-[var(--muted)]">Founder</span>
        </span>
      </button>
      <Notifications />
      <Tooltip label="Settings" side="top">
        <button
          type="button"
          onClick={() => actions.openSettings("general")}
          aria-label="Settings"
          class="grid size-8 flex-none place-items-center rounded-[var(--r2)] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
        >
          <SettingsIcon size={20} stroke-width={1.9} />
        </button>
      </Tooltip>
    </div>
  );
}

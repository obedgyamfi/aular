import { createSignal, onCleanup, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Avatar } from "~/components/avatar";
import { actions, state } from "~/lib/store";

/**
 * The account, up in the title bar beside the window controls.
 *
 * Who you're signed in as, and the way out. The account matters here: your
 * agents run on this machine, but the organization — who they are, what they
 * know — belongs to this account and travels with it.
 */
export function AccountMenu() {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  const onDown = (e: PointerEvent) => {
    if (!root?.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDown));

  const user = () => state.user;
  const name = () => user()?.display_name || user()?.email?.split("@")[0] || "Account";

  return (
    <div ref={root} class="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open()}
        aria-label={`Account — ${name()}`}
        title={name()}
        class="flex size-7 items-center justify-center rounded transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      >
        <Avatar name={name()} size={22} />
      </button>

      <Show when={open()}>
        <div class="aular-pop absolute right-0 top-full z-40 mt-1.5 w-[228px] overflow-hidden rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-02 py-1 shadow-xl">
          <div class="flex items-center gap-2.5 border-b border-v2-border-border-muted px-3 py-2">
            <Avatar name={name()} size={28} />
            <div class="min-w-0">
              <div class="truncate text-[12px] font-medium text-v2-text-text-base">
                {name()}
              </div>
              <div class="truncate text-[10.5px] text-v2-text-text-faint">
                {user()?.email}
              </div>
            </div>
          </div>

          <MenuItem
            icon="settings-gear"
            label="Settings"
            onClick={() => {
              setOpen(false);
              actions.setRegister("settings");
            }}
          />
          <MenuItem
            icon="status"
            label="Organization"
            onClick={() => {
              setOpen(false);
              actions.setRegister("org");
            }}
          />
          <div class="my-1 border-t border-v2-border-border-muted" />
          <MenuItem
            icon="close"
            label="Sign out"
            onClick={() => {
              setOpen(false);
              void actions.signOut();
            }}
          />
        </div>
      </Show>
    </div>
  );
}

function MenuItem(props: {
  icon: "settings-gear" | "status" | "close";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
    >
      <span class="text-v2-icon-icon-muted">
        <Icon name={props.icon} size="small" />
      </span>
      {props.label}
    </button>
  );
}

import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import { Avatar } from "~/components/avatar";
import { actions, state } from "~/lib/store";

/**
 * The bell — what needs you, without hunting the sidebar.
 *
 * A badge with the total unread count; the dropdown lists each agent that's
 * waiting, newest first, and a click lands you in that chat. The icon is
 * hand-drawn in the design system's own voice (16×16, 1px stroke) because the
 * set ships no bell.
 */
export function Notifications() {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  const onDown = (e: PointerEvent) => {
    if (!root?.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDown));

  const waiting = createMemo(() =>
    state.agents
      .filter((a) => (state.unread[a.id] ?? 0) > 0)
      .sort(
        (a, b) =>
          (state.preview[b.id]?.at ?? "").localeCompare(state.preview[a.id]?.at ?? ""),
      ),
  );
  const total = () => waiting().reduce((s, a) => s + (state.unread[a.id] ?? 0), 0);

  const jump = (agentId: string) => {
    setOpen(false);
    actions.setRegister("chat");
    void actions.openAgent(agentId);
  };

  return (
    <div ref={root} class="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open()}
        aria-label={total() ? `Notifications — ${total()} unread` : "Notifications"}
        class="relative flex size-7 items-center justify-center rounded text-v2-icon-icon-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      >
        <Bell />
        <Show when={total() > 0}>
          <span class="absolute right-0 top-0 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-v2-background-bg-accent px-[3px] text-[9px] font-semibold leading-none text-v2-text-text-inverse">
            {total() > 99 ? "99+" : total()}
          </span>
        </Show>
      </button>

      <Show when={open()}>
        <div class="absolute right-0 top-full z-40 mt-1.5 w-[264px] overflow-hidden rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-02 py-1 shadow-xl">
          <div class="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-v2-text-text-faint">
            Notifications
          </div>

          <Show
            when={waiting().length}
            fallback={
              <p class="px-3 pb-2.5 pt-1 text-[11.5px] text-v2-text-text-muted">
                All caught up — nothing is waiting on you.
              </p>
            }
          >
            <For each={waiting()}>
              {(a) => (
                <button
                  type="button"
                  onClick={() => jump(a.id)}
                  class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                >
                  <Avatar name={a.name} size={26} />
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-[12px] font-medium text-v2-text-text-base">
                      {a.name}
                    </span>
                    <span class="truncate text-[10.5px] text-v2-text-text-faint">
                      {state.preview[a.id]?.text || "New activity"}
                    </span>
                  </span>
                  <span class="flex h-[16px] min-w-[16px] shrink-0 items-center justify-center rounded-full bg-v2-background-bg-accent px-1 text-[9.5px] font-semibold text-v2-text-text-inverse">
                    {state.unread[a.id]}
                  </span>
                </button>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/** A bell in the icon set's voice: 16×16, 1px currentColor stroke. */
function Bell() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2C5.9 2 4.3 3.7 4.3 5.8V8.7L3 11.2H13L11.7 8.7V5.8C11.7 3.7 10.1 2 8 2Z"
        stroke="currentColor"
      />
      <path
        d="M6.3 13.2C6.6 14 7.2 14.5 8 14.5C8.8 14.5 9.4 14 9.7 13.2"
        stroke="currentColor"
        stroke-linecap="square"
      />
    </svg>
  );
}

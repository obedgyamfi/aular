import { For, Show } from "solid-js";

import { Avatar } from "~/components/avatar";

/**
 * The chat prompt's command pane — Buzz's composer autocomplete, one surface for
 * every trigger.
 *
 * `/` lists gateway commands, `@` lists agents you can pull into the turn. Both
 * render here so the keyboard contract is identical wherever you are in the
 * message: ↑↓ to move, Tab to complete, Enter to take it, Esc to dismiss.
 */
export type PaneItem = {
  id: string;
  /** The token itself — a command (`/status`) or a handle (`@Nova`). */
  label: string;
  /** Argument hint shown after the token, e.g. `<question>`. */
  args?: string;
  /** One-line explanation, right-hand side. */
  desc?: string;
  /** When set, an avatar is drawn instead of the mono token — mentions. */
  avatar?: string;
};

export function CommandPane(props: {
  title: string;
  items: PaneItem[];
  selected: number;
  hint: string;
  onHover: (index: number) => void;
  onPick: (item: PaneItem) => void;
}) {
  return (
    <div class="aular-pop absolute bottom-full left-0 z-30 mb-2 w-full max-w-[480px] overflow-hidden rounded-[var(--r4)] border border-[var(--line)] bg-[var(--surface)] shadow-xl">
      <div class="border-b border-[var(--line)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
        {props.title}
      </div>

      <div class="aular-no-scrollbar max-h-[280px] overflow-y-auto py-1">
        <For each={props.items}>
          {(item, i) => (
            <button
              type="button"
              // Pointer-down, not click: the textarea's blur would otherwise
              // race the pick and close the pane before it lands.
              onPointerDown={(e) => {
                e.preventDefault();
                props.onPick(item);
              }}
              onMouseEnter={() => props.onHover(i())}
              aria-selected={i() === props.selected}
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors"
              classList={{ "bg-[var(--element)]": i() === props.selected }}
            >
              <Show
                when={item.avatar}
                fallback={
                  <span class="shrink-0 font-mono text-[12px] font-semibold text-[var(--accent-text)]">
                    {item.label}
                  </span>
                }
              >
                <Avatar name={item.avatar!} size={20} circle />
                <span class="shrink-0 text-[12.5px] font-semibold text-[var(--text)]">
                  {item.label}
                </span>
              </Show>
              <Show when={item.args}>
                <span class="shrink-0 font-mono text-[10.5px] text-[var(--faint)]">
                  {item.args}
                </span>
              </Show>
              <Show when={item.desc}>
                <span class="min-w-0 flex-1 truncate text-[11px] text-[var(--muted)]">
                  {item.desc}
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>

      <div class="border-t border-[var(--line)] px-3 py-1.5 text-[10px] text-[var(--faint)]">
        {props.hint}
      </div>
    </div>
  );
}

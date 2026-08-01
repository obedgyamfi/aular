import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import Check from "lucide-solid/icons/check";
import MessagesSquare from "lucide-solid/icons/messages-square";
import Pencil from "lucide-solid/icons/pencil";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";

import { confirmDialog } from "~/components/confirm";
import { Tooltip } from "~/components/tooltip";
import { actions, state } from "~/lib/store";
import type { Agent, Conversation } from "~/lib/types";

/**
 * The chat header's session switcher.
 *
 * An agent is a persona; a conversation is a session with it. Each thread is
 * its own context window on the gateway, so starting a new one is how you
 * change subject without dragging the last one along — and the old ones stay
 * readable instead of being one endless scroll.
 *
 * Deliberately an icon button rather than a title bar: the header already names
 * the place, and a second name beside it would say the same thing twice. The
 * count rides the icon so a multi-session agent announces itself.
 */
export function SessionMenu(props: { agent: Agent }) {
  const [open, setOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<string | null>(null);

  let root: HTMLDivElement | undefined;
  const onDown = (e: PointerEvent) => {
    if (!root?.contains(e.target as Node)) {
      setOpen(false);
      setEditing(null);
    }
  };
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDown));

  const threads = createMemo(() => state.threads[props.agent.id] ?? []);
  const currentId = () => state.conversationOf[props.agent.id];

  const startNew = async () => {
    setOpen(false);
    await actions.newConversation(props.agent.id);
  };

  const remove = async (c: Conversation) => {
    const ok = await confirmDialog({
      title: "Delete this conversation?",
      message: "Every message in it goes for good. The agent itself stays.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) await actions.deleteConversation(c.id);
  };

  return (
    <div ref={root} class="relative">
      <Tooltip label="Conversations" side="top">
        <button
          type="button"
          aria-label="Conversations"
          aria-expanded={open()}
          onClick={() => setOpen((o) => !o)}
          class="relative grid size-8 place-items-center rounded-[var(--r2)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
          classList={{
            "bg-[var(--element)] text-[var(--text)]": open(),
            "text-[var(--muted)]": !open(),
          }}
        >
          <MessagesSquare size={17} stroke-width={1.9} />
          <Show when={threads().length > 1}>
            <span class="absolute -right-0.5 -top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-[var(--accent)] px-1 text-[9.5px] font-bold leading-none text-[var(--on-accent)]">
              {threads().length}
            </span>
          </Show>
        </button>
      </Tooltip>

      <Show when={open()}>
        <div class="aular-pop absolute right-0 top-full z-40 mt-2 w-[280px] rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-xl">
          <button
            type="button"
            onClick={() => void startNew()}
            class="flex w-full items-center gap-2 rounded-[var(--r2)] px-2 py-1.5 text-left text-[12.5px] font-[650] text-[var(--text)] transition-colors hover:bg-[var(--element-hover)]"
          >
            <Plus size={15} stroke-width={2} />
            New conversation
          </button>

          <Show when={threads().length}>
            <div class="mx-2 my-1 h-px bg-[var(--line)]" />
            <div class="aular-hover-scrollbar max-h-[280px] overflow-y-auto">
              <For each={threads()}>
                {(c) => (
                  <div
                    class="group/thread flex items-center gap-1 rounded-[var(--r2)] pr-1 transition-colors hover:bg-[var(--element-hover)]"
                    classList={{ "bg-[var(--element)]": c.id === currentId() }}
                  >
                    <Show
                      when={editing() === c.id}
                      fallback={
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            void actions.openConversation(props.agent.id, c.id);
                          }}
                          class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                        >
                          <span class="w-3 shrink-0 text-[var(--accent-text)]">
                            <Show when={c.id === currentId()}>
                              <Check size={12} stroke-width={2.6} />
                            </Show>
                          </span>
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-[12.5px] text-[var(--text-2)]">
                              {title(c)}
                            </span>
                            <Show when={c.last_message_at}>
                              <span class="block truncate text-[10.5px] text-[var(--faint)]">
                                {shortDate(c.last_message_at!)}
                              </span>
                            </Show>
                          </span>
                          <Show when={c.unread_count > 0}>
                            <span class="grid h-4 min-w-4 shrink-0 place-items-center rounded-[var(--pill)] bg-[var(--red)] px-1.5 text-[10px] font-bold text-white">
                              {c.unread_count > 99 ? "99+" : c.unread_count}
                            </span>
                          </Show>
                        </button>
                      }
                    >
                      <input
                        autofocus
                        value={title(c)}
                        onBlur={(e) => {
                          const v = e.currentTarget.value.trim();
                          if (v && v !== title(c)) void actions.renameConversation(c.id, v);
                          setEditing(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") {
                            e.currentTarget.value = title(c);
                            e.currentTarget.blur();
                          }
                        }}
                        class="min-w-0 flex-1 rounded-[var(--r2)] bg-[var(--bg)] px-2 py-1 text-[12.5px] text-[var(--text)] outline-none ring-1 ring-[var(--accent)]"
                      />
                    </Show>

                    <span class="flex shrink-0 items-center opacity-0 transition-opacity group-hover/thread:opacity-100 focus-within:opacity-100">
                      <RowButton label="Rename" onClick={() => setEditing(c.id)}>
                        <Pencil size={12} stroke-width={2} />
                      </RowButton>
                      <RowButton label="Delete" danger onClick={() => void remove(c)}>
                        <Trash2 size={12} stroke-width={2} />
                      </RowButton>
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function RowButton(props: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: any;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      class="grid size-6 place-items-center rounded-[var(--r2)] transition-colors hover:bg-[var(--bg)]"
      classList={{
        "text-[var(--muted)] hover:text-[var(--text)]": !props.danger,
        "text-[var(--muted)] hover:text-v2-state-fg-danger": props.danger,
      }}
    >
      {props.children}
    </button>
  );
}

/** A thread the backend never titled still needs something to be called. */
function title(c: Conversation): string {
  return c.title?.trim() || "Untitled conversation";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

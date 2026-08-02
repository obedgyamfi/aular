import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  untrack,
} from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";
import ArrowDown from "lucide-solid/icons/arrow-down";

import { Avatar } from "~/components/avatar";
import { confirmDialog } from "~/components/confirm";
import { BriefCard } from "~/components/brief-card";
import { CommandCard, isSlashCommand } from "~/components/command-card";
import { DelegationGroup } from "~/components/delegation-group";
import { SystemNote } from "~/components/system-note";
import { SystemTag } from "~/components/system-tag";
import { MessageRow } from "~/components/message-row";
import { Thinking } from "~/components/thinking";
import { ToolGroup } from "~/components/tool-group";
import {
  actions,
  activeAgent,
  activeConversationId,
  activeWorking,
  briefsOfConversation,
  delegationsOfConversation,
  joinChunks,
  state,
} from "~/lib/store";
import { focusComposer } from "~/lib/window";
import type { Agent, Message, Task, ToolCall } from "~/lib/types";

/**
 * The channel timeline — the Slack/Discord shape.
 *
 * Messages and tool calls interleave by time, so the agent's work is legible in
 * place rather than hidden behind a separate "terminal" mode. Consecutive turns
 * from one author collapse into a single run (see MessageRow), days break on a
 * sticky pill, and everything that isn't a message — tool cards, briefs — is
 * indented to the same content column as the prose above it.
 */
const GROUP_GAP_MS = 5 * 60 * 1000;

/** Gutter (40px portrait) + the row's 10px gap — the content column. */
const GUTTER = "w-10 shrink-0";

type Item =
  | { kind: "message"; at: number; message: Message }
  | { kind: "tool"; at: number; tools: ToolCall[] }
  | { kind: "delegation"; at: number; tasks: Task[] }
  | { kind: "command"; at: number; ask: Message; reply?: Message }
  /** Platform notes. Repeats of the same note collapse into one row. */
  | { kind: "note"; at: number; messages: Message[] };

export function MessageList() {
  const agent = () => activeAgent();

  let scroller: HTMLDivElement | undefined;
  const [atBottom, setAtBottom] = createSignal(true);
  const [newCount, setNewCount] = createSignal(0);

  // Messages, tool calls and hand-offs — one timeline, ordered by when they
  // happened, so an agent's work is legible in place rather than split across
  // a transcript here and a status chip somewhere else.
  const items = createMemo<Item[]>(() => {
    const convoId = activeConversationId();
    if (!convoId) return [];
    const msgs = (state.messages[convoId] ?? [])
      .filter((m) => !isEmptyExhaust(m, !!state.streaming[m.id]))
      .map((m) => ({ kind: "message" as const, at: Date.parse(m.created_at), message: m }));
    const tools = (state.toolCalls[convoId] ?? []).map((t) => ({
      kind: "tool" as const,
      at: Date.parse(t.created_at),
      tools: [t],
    }));
    const delegations = delegationsOfConversation(convoId).map((t) => ({
      kind: "delegation" as const,
      at: Date.parse(t.created_at),
      tasks: [t],
    }));
    const ordered = [...msgs, ...tools, ...delegations].sort((a, b) => a.at - b.at);

    // Fold consecutive runs of the same kind into one. A turn that reached for
    // a hundred tools is one action with a hundred steps, and a lead fanning
    // work out to six teammates is one round of hand-offs — drawing either as
    // N separate events buries the conversation they belong to.
    const folded: Item[] = [];
    for (const it of ordered) {
      const prev = folded[folded.length - 1];
      if (it.kind === "tool" && prev?.kind === "tool") {
        prev.tools.push(...it.tools);
        continue;
      }
      if (it.kind === "delegation" && prev?.kind === "delegation") {
        prev.tasks.push(...it.tasks);
        continue;
      }
      // A slash command and the gateway's answer are one exchange, not two
      // turns. Left as messages they drew a portrait and an author line for
      // asking the runtime its own token count.
      if (it.kind === "message" && isSlashCommand(it.message)) {
        folded.push({ kind: "command", at: it.at, ask: it.message });
        continue;
      }
      if (it.kind === "message" && prev?.kind === "command" && !prev.reply) {
        if (it.message.sender_type === "agent") {
          prev.reply = it.message;
          continue;
        }
      }
      // Platform notes become their own kind, and an identical note repeated
      // back-to-back collapses into one row with a count. The dispatch
      // self-healer posts the same line once per reply that talked about
      // delegating, so a single turn could leave three copies of "no dispatch
      // block detected" stacked in the timeline saying nothing new.
      if (it.kind === "message" && it.message.sender_type === "system") {
        if (
          prev?.kind === "note" &&
          prev.messages[0]!.content.trim() === it.message.content.trim()
        ) {
          prev.messages.push(it.message);
          continue;
        }
        folded.push({ kind: "note", at: it.at, messages: [it.message] });
        continue;
      }
      folded.push(it);
    }
    return folded;
  });

  const byId = createMemo(() => {
    const map = new Map<string, Message>();
    for (const it of items()) if (it.kind === "message") map.set(it.message.id, it.message);
    return map;
  });

  // Bulk selection. Off until you ask for it from a row's rail — a timeline you
  // read shouldn't have checkboxes in it, and every click shouldn't be a pick.
  const [picked, setPicked] = createSignal<string[]>([]);
  const [selecting, setSelecting] = createSignal(false);
  const isPicked = (id: string) => picked().includes(id);

  const endSelect = () => {
    setSelecting(false);
    setPicked([]);
  };

  /**
   * What a selection can hold: one key per drawn row, mapped to the messages
   * that row stands for.
   *
   * A row is usually one message, but a collapsed run of identical platform
   * notes is one row standing for several — so picking it has to pick all of
   * them, or Delete would leave the copies behind. Insertion order is draw
   * order, which is what makes a shift-range span exactly what you see.
   */
  const pickable = createMemo(() => {
    const map = new Map<string, Message[]>();
    for (const it of items()) {
      if (it.kind === "message") map.set(it.message.id, [it.message]);
      else if (it.kind === "note") map.set(it.messages[0]!.id, it.messages);
    }
    return map;
  });
  const rowIds = createMemo(() => [...pickable().keys()]);

  let anchor: string | undefined;
  const toggle = (id: string, range: boolean) => {
    if (range && anchor && anchor !== id) {
      // Shift extends from the last pick through this one, inclusive — the
      // behaviour of every list, and what makes "clear this whole exchange"
      // two clicks instead of thirty.
      const ids = rowIds();
      const from = ids.indexOf(anchor);
      const to = ids.indexOf(id);
      const a = Math.min(from, to);
      const b = Math.max(from, to);
      if (from >= 0 && to >= 0) {
        const span = ids.slice(a, b + 1);
        setPicked((cur) => [...new Set([...cur, ...span])]);
        anchor = id;
        return;
      }
    }
    anchor = id;
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const startSelect = (id: string) => {
    setSelecting(true);
    anchor = id;
    setPicked([id]);
  };

  const removePicked = async () => {
    const map = pickable();
    const msgs = picked().flatMap((id) => map.get(id) ?? []);
    if (!msgs.length) return endSelect();
    const ok = await confirmDialog({
      title: `Delete ${msgs.length} message${msgs.length === 1 ? "" : "s"}?`,
      message: "They disappear from the thread for good.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    endSelect();
    await actions.deleteMessages(msgs);
  };

  // Escape leaves selection mode — the same key that closes every other
  // temporary state in the app.
  createEffect(() => {
    if (!selecting()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endSelect();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  // Switching threads ends it: a selection is a set of ids in one conversation,
  // and carrying it across would leave a delete bar armed with nothing.
  createEffect(() => {
    activeConversationId();
    endSelect();
  });

  /** Grouping + day-break metadata, per item. */
  const meta = createMemo(() => {
    const list = items();
    return list.map((it, i) => {
      const prev = list[i - 1];

      const day = dayLabel(it.at);
      const dayBreak = !prev || day !== dayLabel(prev.at);

      /**
       * Who spoke last, ignoring the turn's own machinery.
       *
       * The gateway ends a stream segment at every tool boundary, so one answer
       * arrives as several messages — a report might be four, twelve seconds
       * apart. Measured against the immediately preceding item, each one began a
       * fresh run and redrew the portrait, the name and a new timestamp, so a
       * single reply looked like four people saying four things. Tool cards,
       * hand-offs and platform notes are transparent to the run: the author line
       * is drawn once, where the turn starts, and the rest of it continues.
       */
      const spoken = (() => {
        for (let j = i - 1; j >= 0; j--) {
          const c = list[j]!;
          if (c.kind === "tool" || c.kind === "delegation" || c.kind === "note") continue;
          return c;
        }
        return undefined;
      })();
      const against = it.kind === "message" ? spoken : prev;

      // A new run starts on an author change, a day break, or a long silence.
      const first =
        !against ||
        sideOf(against) !== sideOf(it) ||
        dayBreak ||
        it.at - against.at > GROUP_GAP_MS;

      return { first, dayBreak, day };
    });
  });

  // Follow the tail only when the reader is already there; otherwise count what
  // arrived and offer the jump. Yanking someone's scroll is hostile.
  let seenConvo: string | undefined;
  let seenCount = 0;
  createEffect(() => {
    const convo = activeConversationId();
    const n = items().length;
    activeWorking();

    if (convo !== seenConvo) {
      seenConvo = convo;
      seenCount = n;
      setNewCount(0);
      queueMicrotask(() => scrollToEnd());
      return;
    }

    const arrived = Math.max(0, n - seenCount);
    seenCount = n;
    const lastItem = items()[n - 1];
    const ownSend =
      arrived > 0 && lastItem?.kind === "message" && lastItem.message.sender_type === "user";
    if (untrack(atBottom) || ownSend) {
      queueMicrotask(() => scrollToEnd());
      setNewCount(0);
      setAtBottom(true);
    } else if (arrived > 0) {
      setNewCount((c) => c + arrived);
    }
  });

  const onScroll = () => {
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const near = distance < 120;
    setAtBottom(near);
    if (near) setNewCount(0);
  };

  const scrollToEnd = (behavior: ScrollBehavior = "auto") => {
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior });
  };
  const jump = () => {
    scrollToEnd("smooth");
    setAtBottom(true);
    setNewCount(0);
  };

  return (
    <div class="relative min-h-0 flex-1">
      {/* overflow-x-hidden is the backstop: rows carry min-w-0 so they shrink,
          and anything that genuinely needs to scroll sideways (code blocks,
          diffs) owns its own overflow-x. Without it one rogue child puts a
          horizontal scrollbar under the entire conversation. */}
      <div ref={scroller} onScroll={onScroll} class="h-full overflow-y-auto overflow-x-hidden">
        {/* Bottom-anchored, as Discord is: a short conversation sits on the
            composer and grows upward, instead of stranding three messages at
            the top of an empty screen. Once the content overflows, justify-end
            stops mattering and it scrolls normally. */}
        {/* Extra floor while selecting: the bar floats over the foot of the
            conversation, and in a short thread the last row sits exactly there
            — the bar would cover the message you were about to pick. */}
        <div
          class="flex min-h-full w-full min-w-0 flex-col justify-end px-3 pt-4"
          classList={{ "pb-6": !selecting(), "pb-16": selecting() }}
        >
          <Show when={agent()}>
            {(a) => <ConversationIntro agent={a()} empty={!items().length} />}
          </Show>

          <For each={items()}>
            {(it, i) => {
              const info = () => meta()[i()]!;
              return (
                <div class="flex min-w-0 flex-col">
                  <Show when={info().dayBreak}>
                    <DayDivider label={info().day} />
                  </Show>

                  {/* A run gets air above it; a continuation hugs the one before. */}
                  <div class="min-w-0" classList={{ "mt-4": info().first && !info().dayBreak }}>
                    <Show when={it.kind === "tool"}>
                      {/* A run of commands, indented to the prose column. */}
                      <div class="mx-1 flex gap-2.5 px-2 py-1">
                        <div class={GUTTER} />
                        <div class="min-w-0 flex-1">
                          <ToolGroup tools={(it as Extract<Item, { kind: "tool" }>).tools} />
                        </div>
                      </div>
                    </Show>

                    <Show when={it.kind === "command"}>
                      {/* A gateway exchange, in the prose column. */}
                      <div class="mx-1 flex gap-2.5 px-2 py-1">
                        <div class={GUTTER} />
                        <div class="min-w-0 flex-1">
                          {(() => {
                            const c = it as Extract<Item, { kind: "command" }>;
                            return <CommandCard ask={c.ask} reply={c.reply} />;
                          })()}
                        </div>
                      </div>
                    </Show>

                    <Show when={it.kind === "delegation"}>
                      {/* A hand-off to a teammate, in the same column. */}
                      <div class="mx-1 flex gap-2.5 px-2 py-1">
                        <div class={GUTTER} />
                        <div class="min-w-0 flex-1">
                          <DelegationGroup
                            tasks={(it as Extract<Item, { kind: "delegation" }>).tasks}
                          />
                        </div>
                      </div>
                    </Show>

                    <Show when={it.kind === "note"}>
                      {(() => {
                        const n = it as Extract<Item, { kind: "note" }>;
                        const key = n.messages[0]!.id;
                        return (
                          <NoteRow
                            messages={n.messages}
                            selecting={selecting()}
                            selected={isPicked(key)}
                            onToggleSelect={(additive) => toggle(key, additive)}
                            onStartSelect={() => startSelect(key)}
                          />
                        );
                      })()}
                    </Show>

                    <Show when={it.kind === "message"}>
                      {(() => {
                        const m = (it as Extract<Item, { kind: "message" }>).message;
                        const quoted = () =>
                          m.reply_to_message_id ? byId().get(m.reply_to_message_id) : undefined;

                        // One message, one row. Replies used to arrive split on
                        // a chunk delimiter and each piece drew its own row —
                        // a wall of portraits for a single thought, arriving in
                        // visible jumps. Agents no longer emit the delimiter;
                        // threads that already contain it read as one message.
                        return (
                          <MessageRow
                            message={m}
                            contentOverride={joinChunks(m.content)}
                            repliedTo={quoted()}
                            authorName={agent()?.name ?? "Agent"}
                            first={info().first}
                            streaming={!!state.streaming[m.id]}
                            showReplyQuote
                            showMedia
                            working={
                              m.sender_type !== "user" &&
                              activeWorking() &&
                              i() === items().length - 1
                            }
                            actionable={i() === items().length - 1}
                            selecting={selecting()}
                            selected={isPicked(m.id)}
                            onToggleSelect={(additive) => toggle(m.id, additive)}
                            onStartSelect={() => startSelect(m.id)}
                          />
                        );
                      })()}
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>

          {/* Briefs: the org's typed reports, at the foot where the newest work is. */}
          <For each={briefsOfConversation(activeConversationId() ?? "")}>
            {(b) => (
              <div class="mx-1 flex gap-2.5 px-2 pt-4">
                <div class={GUTTER} />
                <div class="min-w-0 flex-1">
                  <BriefCard brief={b} />
                </div>
              </div>
            )}
          </For>

          <Show when={activeWorking()}>
            <div class="aular-rise mx-1 flex gap-2.5 px-2 pt-2">
              <div class={GUTTER} />
              <div class="min-w-0 flex-1">
                <Thinking agentName={agent()?.name ?? "Agent"} />
              </div>
            </div>
          </Show>
        </div>
      </div>

      {/* The selection bar — the one place a bulk action lives, over the foot of
          the conversation where the composer's controls already are. */}
      <Show when={selecting()}>
        <div
          class="aular-pop absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-[var(--pill)] border border-[var(--line)] bg-[var(--surface)] py-1 pl-3 pr-1 text-[11.5px] text-[var(--text)]"
          style={{ "box-shadow": "var(--shadow-2)" }}
        >
          <span class="font-[650] tabular-nums">
            {picked().length} selected
          </span>
          <span aria-hidden="true" class="mx-1 h-4 w-px bg-[var(--line)]" />
          <button
            type="button"
            onClick={() => setPicked(rowIds())}
            disabled={picked().length === rowIds().length}
            class="rounded-[var(--pill)] px-2 py-1 font-[650] text-[var(--text-2)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)] disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => void removePicked()}
            disabled={!picked().length}
            class="rounded-[var(--pill)] px-2 py-1 font-[650] text-v2-state-fg-danger transition-colors hover:bg-[var(--element-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={endSelect}
            aria-label="Cancel selection"
            title="Cancel (Esc)"
            class="grid size-6 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
          >
            <Icon name="close-small" size="small" />
          </button>
        </div>
      </Show>

      {/* Scroll to the latest — always offered when you've scrolled up, with a
          count when messages arrived behind your back. Steps up out of the
          selection bar's place rather than sitting on top of it. */}
      <Show when={!atBottom()}>
        <button
          type="button"
          onClick={jump}
          aria-label="Scroll to latest"
          class="aular-pop absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-[var(--pill)] border border-[var(--line)] bg-[var(--surface)] py-1.5 pl-2 pr-3 text-[11.5px] font-[650] text-[var(--text)] transition-colors hover:border-[var(--accent)]"
          classList={{ "bottom-4": !selecting(), "bottom-[68px]": selecting() }}
          style={{ "box-shadow": "var(--shadow-2)" }}
        >
          <span class="grid size-5 place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]">
            <ArrowDown size={13} stroke-width={2.4} />
          </span>
          <Show when={newCount() > 0} fallback={<span>Latest</span>}>
            {newCount()} new message{newCount() === 1 ? "" : "s"}
          </Show>
        </button>
      </Show>
    </div>
  );
}

/**
 * A platform note, in a row you can act on.
 *
 * These are messages like any other — the spine reporting a dispatch, the
 * self-healer saying nothing was routed — and until now they were the one thing
 * in the timeline with no affordance at all: no hover rail, no checkbox. Delete
 * everything around one and it stayed, unselectable and unremovable. So it gets
 * the row treatment: a checkbox while selecting, a delete on hover otherwise,
 * and a count when the same note repeated.
 */
function NoteRow(props: {
  messages: Message[];
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (additive: boolean) => void;
  onStartSelect?: () => void;
}) {
  const many = () => props.messages.length;

  const remove = async () => {
    const n = many();
    const ok = await confirmDialog({
      title: n === 1 ? "Delete this note?" : `Delete ${n} copies of this note?`,
      message: "It disappears from the thread for good.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) await actions.deleteMessages(props.messages);
  };

  return (
    <div
      class="group/note relative mx-1 flex min-w-0 items-start gap-2.5 rounded-[var(--r4)] px-2 py-0.5 transition-colors"
      classList={{
        "cursor-pointer": !!props.selecting,
        "bg-[color-mix(in_srgb,var(--accent)_11%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]":
          !!props.selecting && !!props.selected,
        "hover:bg-[var(--row-hover)]": !props.selecting || !props.selected,
      }}
      onClick={(e) => props.selecting && props.onToggleSelect?.(e.shiftKey)}
      aria-selected={props.selecting ? !!props.selected : undefined}
      data-testid="note-row"
    >
      <Show when={props.selecting}>
        <div class="flex w-[18px] shrink-0 items-start justify-center pt-2">
          <span
            aria-hidden="true"
            class="grid size-[16px] place-items-center rounded-[4px] border transition-colors"
            classList={{
              "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]":
                !!props.selected,
              "border-[var(--line-strong)]": !props.selected,
            }}
          >
            <Show when={props.selected}>
              <Icon name="check-small" size="small" />
            </Show>
          </span>
        </div>
      </Show>

      <div class={GUTTER} />
      <div class="flex min-w-0 flex-1 items-start gap-1.5">
        <div class="min-w-0 flex-1">
          <SystemNote content={props.messages[0]!.content} />
        </div>
        <Show when={many() > 1}>
          <span
            title={`This note arrived ${many()} times`}
            class="mt-1 shrink-0 rounded-[var(--pill)] bg-[var(--element)] px-1.5 py-px text-[10.5px] font-bold tabular-nums text-[var(--muted)]"
          >
            ×{many()}
          </span>
        </Show>
      </div>

      <Show when={!props.selecting}>
        <div class="absolute right-3 top-0 z-20 flex items-center gap-0.5 rounded-[var(--pill)] border border-[var(--line)] bg-[var(--surface)] px-1 py-0.5 opacity-0 shadow-[var(--shadow-1)] transition-opacity group-hover/note:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            aria-label="Select"
            title="Select"
            onClick={(e) => {
              e.stopPropagation();
              props.onStartSelect?.();
            }}
            class="grid size-6 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
          >
            <Icon name="circle-check" size="small" />
          </button>
          <button
            type="button"
            aria-label="Delete note"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              void remove();
            }}
            class="grid size-6 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-v2-state-fg-danger"
          >
            <Icon name="trash" size="small" />
          </button>
        </div>
      </Show>
    </div>
  );
}

/**
 * The head of the conversation — Discord's "beginning of your direct message
 * history", and the one place a channel introduces whoever is in it.
 *
 * A channel and a person read differently: the system agent is a place, so it
 * gets `#name` and the language of a channel; a teammate gets a portrait, a
 * handle and their role.
 */
function ConversationIntro(props: { agent: Agent; empty: boolean }) {
  const isSystem = () => props.agent.role === "system";
  const name = () => props.agent.name;
  const handle = () => `@${name().toLowerCase().replace(/\s+/g, "")}`;
  const firstName = () => name().split(/\s+/)[0]!;

  return (
    <div class="flex flex-col items-start gap-1.5 px-2 pb-4 pt-2">
      {/* A portrait, whoever it is. The system agent used to open with a giant
          `#` in a grey circle — the only teammate in the app without a face. */}
      <span class="mb-1">
        <Avatar name={name()} size={68} circle />
      </span>

      <h2 class="flex items-center gap-2 text-[30px] font-bold leading-tight tracking-tight text-[var(--text)]">
        {name()}
        <Show when={isSystem()}>
          <SystemTag size="md" />
        </Show>
      </h2>

      <p class="text-[14px] text-[var(--text-2)]">
        <Show when={!isSystem()} fallback={<>{handle()} · The agent you build the organization with.</>}>
          {handle()} · {prettyRole(props.agent.role)}
        </Show>
      </p>

      <p class="max-w-[620px] text-[13.5px] leading-5 text-[var(--muted)]">
        <Show
          when={!isSystem()}
          fallback={
            <>
              This is the beginning of your conversation with{" "}
              <strong class="text-[var(--text-2)]">{name()}</strong>. Describe the company you
              want and it gets built here.
            </>
          }
        >
          This is the beginning of your conversation with{" "}
          <strong class="text-[var(--text-2)]">{name()}</strong>. They run on this machine, on your
          own model key.
        </Show>
      </p>

      {/* Discord waves for you here. We don't send anything on your behalf —
          a turn costs tokens, and the first thing an agent hears shouldn't be
          something you didn't write. So it just puts you in the composer. */}
      <Show when={props.empty}>
        <button
          type="button"
          onClick={focusComposer}
          class="mt-2 rounded-[var(--r2)] bg-[var(--accent)] bg-[image:var(--accent-grad)] px-4 py-2 text-[13.5px] font-medium text-[var(--on-accent)] transition-all hover:brightness-110"
        >
          {isSystem() ? "Start building" : `Send ${firstName()} their first message`}
        </button>
      </Show>
    </div>
  );
}

/**
 * The day break — Discord's hairline with the date sitting on it.
 *
 * Sticky, which Discord's is not: it rides the top of the viewport while you
 * read that day, so a long scroll never loses track of when you are. The label
 * carries the conversation's own background so the rule appears to pass behind
 * it.
 */
function DayDivider(props: { label: string }) {
  return (
    <div
      aria-label={props.label}
      class="pointer-events-none sticky top-0 z-20 flex items-center py-2"
    >
      <span class="h-px min-w-0 flex-1 bg-[var(--line)]" />
      <span class="shrink-0 bg-[var(--bg)] px-2 text-[11px] font-semibold tracking-[0.02em] text-[var(--faint)]">
        {props.label}
      </span>
      <span class="h-px min-w-0 flex-1 bg-[var(--line)]" />
    </div>
  );
}

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}


/**
 * Block-only replies (a dispatch, a status report) have their visible text
 * stripped server-side — an empty bubble is protocol exhaust, not a message.
 * Streaming stays visible: its emptiness is a moment, not a nature.
 */
export function isEmptyExhaust(m: Message, streaming: boolean): boolean {
  if (streaming || m.sender_type === "system") return false;
  if (m.content.trim() !== "") return false;
  const media = m.structured_payload?.media;
  return !Array.isArray(media) || media.length === 0;
}

/**
 * Which run an item belongs to.
 *
 * Tool cards and system notes are each their OWN side, deliberately: they draw
 * no author line, so if they shared the agent's side they would silently absorb
 * its run-start and the agent's prose would render headerless forever — no
 * portrait, no name. Giving them their own side means the reply after a command
 * or a "dispatch landed" note starts a fresh run with its portrait back.
 */
const sideOf = (it: Item): "user" | "agent" | "system" | "tool" => {
  if (it.kind === "tool" || it.kind === "delegation" || it.kind === "command") return "tool";
  if (it.kind === "note") return "system";
  if (it.message.sender_type === "user") return "user";
  return "agent";
};

function dayLabel(at: number): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

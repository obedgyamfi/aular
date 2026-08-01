import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";
import ArrowDown from "lucide-solid/icons/arrow-down";

import { Avatar } from "~/components/avatar";
import { BriefCard } from "~/components/brief-card";
import { DelegationGroup } from "~/components/delegation-group";
import { SystemNote } from "~/components/system-note";
import { MessageRow } from "~/components/message-row";
import { Thinking } from "~/components/thinking";
import { ToolGroup } from "~/components/tool-group";
import {
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
  | { kind: "delegation"; at: number; tasks: Task[] };

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
      folded.push(it);
    }
    return folded;
  });

  const byId = createMemo(() => {
    const map = new Map<string, Message>();
    for (const it of items()) if (it.kind === "message") map.set(it.message.id, it.message);
    return map;
  });

  /** Grouping + day-break metadata, per item. */
  const meta = createMemo(() =>
    items().map((it, i) => {
      const prev = items()[i - 1];

      const day = dayLabel(it.at);
      const dayBreak = !prev || day !== dayLabel(prev.at);

      // A new run starts on an author change, a day break, or a long silence.
      const first =
        !prev || sideOf(prev) !== sideOf(it) || dayBreak || it.at - prev.at > GROUP_GAP_MS;

      return { first, dayBreak, day };
    }),
  );

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
        <div class="flex min-h-full w-full min-w-0 flex-col justify-end px-3 pb-6 pt-4">
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

                    <Show when={it.kind === "message"}>
                      {(() => {
                        const m = (it as Extract<Item, { kind: "message" }>).message;
                        const quoted = () =>
                          m.reply_to_message_id ? byId().get(m.reply_to_message_id) : undefined;

                        // Platform notes stay centered and neutral.
                        if (m.sender_type === "system") {
                          return <SystemNote content={m.content} />;
                        }

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

      {/* Scroll to the latest — always offered when you've scrolled up, with a
          count when messages arrived behind your back. */}
      <Show when={!atBottom()}>
        <button
          type="button"
          onClick={jump}
          aria-label="Scroll to latest"
          class="aular-pop absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-[var(--pill)] border border-[var(--line)] bg-[var(--surface)] py-1.5 pl-2 pr-3 text-[11.5px] font-[650] text-[var(--text)] transition-colors hover:border-[var(--accent)]"
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
 * The head of the conversation — Discord's "beginning of your direct message
 * history", and the one place a channel introduces whoever is in it.
 *
 * A channel and a person read differently: the system agent is a place, so it
 * gets `#name` and the language of a channel; a teammate gets a portrait, a
 * handle and their role.
 */
function ConversationIntro(props: { agent: Agent; empty: boolean }) {
  const isChannel = () => props.agent.role === "system";
  const name = () => props.agent.name;
  const handle = () => `@${name().toLowerCase().replace(/\s+/g, "")}`;
  const firstName = () => name().split(/\s+/)[0]!;

  return (
    <div class="flex flex-col items-start gap-1.5 px-2 pb-4 pt-2">
      <Show
        when={!isChannel()}
        fallback={
          <span class="mb-1 grid size-[68px] place-items-center rounded-full bg-[var(--element)] text-[34px] font-bold text-[var(--text-2)]">
            #
          </span>
        }
      >
        <span class="mb-1">
          <Avatar name={name()} size={68} circle />
        </span>
      </Show>

      <h2 class="text-[30px] font-bold leading-tight tracking-tight text-[var(--text)]">
        {isChannel() ? name().toLowerCase() : name()}
      </h2>

      <p class="text-[14px] text-[var(--text-2)]">
        <Show when={!isChannel()} fallback={<>The channel you build the organization in.</>}>
          {handle()} · {prettyRole(props.agent.role)}
        </Show>
      </p>

      <p class="max-w-[620px] text-[13.5px] leading-5 text-[var(--muted)]">
        <Show
          when={!isChannel()}
          fallback={
            <>
              This is the start of the <strong class="text-[var(--text-2)]">#{name().toLowerCase()}</strong>{" "}
              channel. Describe the company you want and it gets built here.
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
          {isChannel() ? "Start building" : `Send ${firstName()} their first message`}
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
  if (it.kind === "tool" || it.kind === "delegation") return "tool";
  if (it.message.sender_type === "user") return "user";
  if (it.message.sender_type === "system") return "system";
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

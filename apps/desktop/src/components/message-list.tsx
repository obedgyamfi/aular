import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";

import { Avatar } from "~/components/avatar";
import { MessageBubble } from "~/components/message-bubble";
import { Thinking } from "~/components/thinking";
import {
  activeAgent,
  activeConversationId,
  activeMessages,
  activeWorking,
  state,
} from "~/lib/store";
import type { Message } from "~/lib/types";

/**
 * The conversation — ported from the prototype's MessageList.
 *
 * Messages are grouped: consecutive turns from the same side within a few
 * minutes read as one utterance, with the sender's name and avatar shown once
 * at the top of the group. Time dividers mark day breaks and long lulls, so the
 * thread has a shape. A long agent reply arrives split into chat-sized bubbles
 * (the <<<AULAR_CHUNK>>> markers the backend emits).
 */
const GROUP_GAP_MS = 5 * 60 * 1000;
const LULL_MS = 30 * 60 * 1000;

export function MessageList() {
  const messages = () => activeMessages();
  const agent = () => activeAgent();

  let scroller: HTMLDivElement | undefined;
  const [atBottom, setAtBottom] = createSignal(true);
  const [newCount, setNewCount] = createSignal(0);

  // No per-row entrance animation: rows render against a moving gate on
  // conversation switch (effects run after render), so recent history did an
  // entrance dance that read as flicker. Streaming lists are hot paths —
  // arrival is already announced by the thinking indicator and autoscroll.

  const byId = createMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages()) map.set(m.id, m);
    return map;
  });

  /** Per-message grouping and divider info. */
  const meta = createMemo(() =>
    messages().map((m, i) => {
      const list = messages();
      const prev = list[i - 1];
      const next = list[i + 1];

      const day = dayLabel(m.created_at);
      const dayBreak = !prev || day !== dayLabel(prev.created_at);

      const first = !prev || side(prev) !== side(m) || dayBreak || gap(prev, m) > GROUP_GAP_MS;
      const last =
        !next ||
        side(next) !== side(m) ||
        day !== dayLabel(next.created_at) ||
        gap(m, next) > GROUP_GAP_MS;

      // A full "day, time" on a day break; a bare clock when the conversation
      // resumes after a lull. Otherwise nothing — silence is the default.
      const time = new Date(m.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const divider = dayBreak
        ? `${day} ${time}`
        : gap(prev, m) > LULL_MS
          ? time
          : "";

      return { first, last, divider };
    }),
  );

  // Follow the tail only when the reader is already there; otherwise count what
  // they're missing and offer a jump. Yanking someone's scroll is hostile.
  //
  // The counter counts *messages that arrived*, nothing else. atBottom is read
  // untracked — an earlier version subscribed to it, so every scroll past the
  // threshold re-ran the effect and incremented the count with no new message.
  let seenConvo: string | undefined;
  let seenCount = 0;
  createEffect(() => {
    const convo = activeConversationId();
    const n = messages().length;
    activeWorking(); // the typing indicator adds height worth following too

    if (convo !== seenConvo) {
      // A different thread: start at its tail, with nothing "new".
      seenConvo = convo;
      seenCount = n;
      setNewCount(0);
      queueMicrotask(() => scrollToEnd());
      return;
    }

    const arrived = Math.max(0, n - seenCount);
    seenCount = n;
    // Your own send always lands you at the tail — nobody scrolls up, types,
    // and wants to stay where they were while their message goes below.
    const ownSend =
      arrived > 0 && messages()[n - 1]?.sender_type === "user";
    if (untrack(atBottom) || ownSend) {
      // Scroll the *container*, not a sentinel: scrollIntoView aligns the
      // sentinel's edge with the viewport and leaves the feed's bottom padding
      // below the fold, so the last bubble ends up flush against the composer.
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
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior });
  };

  const jump = () => {
    scrollToEnd("smooth");
    setAtBottom(true);
    setNewCount(0);
  };

  return (
    <div class="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} class="h-full overflow-y-auto">
        <div class="mx-auto flex w-full max-w-[820px] flex-col px-4 pb-8 pt-5">
          <For each={messages()}>
            {(m, i) => {
              const info = () => meta()[i()]!;
              const quoted = () =>
                m.reply_to_message_id ? byId().get(m.reply_to_message_id) : undefined;

              return (
                <Show when={!isEmptyExhaust(m, !!state.streaming[m.id])}>
                <div class="flex flex-col">
                  <Show when={info().divider}>
                    <div class="flex justify-center py-3">
                      <span class="text-[11px] text-v2-text-text-faint">
                        {info().divider}
                      </span>
                    </div>
                  </Show>

                  {/* A breath between grouped bubbles; a bigger one between
                      groups. Zero margin welded consecutive replies together. */}
                  <div
                    classList={{
                      "mt-3": info().first && !info().divider,
                      "mt-1.5": !info().first,
                    }}
                  >
                    <Show
                      when={m.sender_type !== "user"}
                      fallback={
                        <MessageBubble
                          message={m}
                          repliedTo={quoted()}
                          agentName={agent()?.name ?? "Agent"}
                          streaming={!!state.streaming[m.id]}
                          showReplyQuote
                          showMedia
                          showMeta={info().last}
                          first={info().first}
                          last={info().last}
                        />
                      }
                    >
                      <Show
                        when={m.sender_type !== "system"}
                        fallback={
                          <MessageBubble
                            message={m}
                            agentName={agent()?.name ?? "Agent"}
                            showMeta={false}
                          />
                        }
                      >
                        {/* Incoming group: the sender's name above the group's
                            first bubble, the avatar in a gutter beside it. */}
                        <div class="flex gap-2">
                          <div
                            class="w-8 shrink-0 self-start"
                            classList={{ "pt-[18px]": info().first }}
                          >
                            <Show when={info().first}>
                              <Avatar name={agent()?.name ?? "Agent"} size={28} />
                            </Show>
                          </div>

                          <div class="min-w-0 flex-1">
                            <Show when={info().first}>
                              <div class="mb-0.5 px-1 text-[11px] text-v2-text-text-faint">
                                {agent()?.name ?? "Agent"}
                              </div>
                            </Show>

                            <div class="flex flex-col gap-1.5">
                              <For each={splitChunks(m.content)}>
                                {(part, pi) => {
                                  const parts = splitChunks(m.content);
                                  const isLastPart = () => pi() === parts.length - 1;
                                  return (
                                    <MessageBubble
                                      message={m}
                                      contentOverride={part}
                                      repliedTo={quoted()}
                                      agentName={agent()?.name ?? "Agent"}
                                      streaming={
                                        !!state.streaming[m.id] && isLastPart()
                                      }
                                      showReplyQuote={pi() === 0}
                                      showMedia={pi() === 0}
                                      showMeta={info().last && isLastPart()}
                                      first={info().first && pi() === 0}
                                      last={info().last && isLastPart()}
                                      actionable={
                                        i() === messages().length - 1 && isLastPart()
                                      }
                                    />
                                  );
                                }}
                              </For>
                            </div>
                          </div>
                        </div>
                      </Show>
                    </Show>
                  </div>
                </div>
                </Show>
              );
            }}
          </For>

          <Show when={activeWorking()}>
            <div class="aular-rise">
              <Thinking agentName={agent()?.name ?? "Agent"} />
            </div>
          </Show>

        </div>
      </div>

      <Show when={!atBottom() && newCount() > 0}>
        <button
          type="button"
          onClick={jump}
          class="aular-fade absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 py-1.5 text-[11px] text-v2-text-text-base shadow-lg transition-colors hover:bg-v2-overlay-simple-overlay-hover"
        >
          {newCount()} new message{newCount() === 1 ? "" : "s"} ↓
        </button>
      </Show>
    </div>
  );
}


/** A long reply arrives split into chat-sized bubbles. */
function splitChunks(content: string): string[] {
  const parts = content
    .split("<<<AULAR_CHUNK>>>")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [content];
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

const side = (m: Message) => (m.sender_type === "user" ? "user" : "agent");

const gap = (a?: Message, b?: Message) =>
  a && b
    ? Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : Infinity;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

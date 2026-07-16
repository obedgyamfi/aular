import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Markdown } from "~/components/markdown";
import { actions, activeConversationId, activeWorking, state } from "~/lib/store";
import type { Message, ToolCall } from "~/lib/types";

/**
 * The terminal view of a conversation — ported from the prototype's WorkPanel.
 *
 * The same thread you were just reading, shown as work instead of talk: the
 * agent's output as a full-width document (no bubbles), your turns as compact
 * chips, and every tool it reaches for in place as a collapsible
 * `› tool — preview` line, breathing while it runs. Messages and tool calls
 * interleaved by time, which is what makes the agent's *work* legible and not
 * just its conclusions.
 *
 * It lives inside the chat pane (same header, same composer), because it is a
 * way of looking at one conversation, not a separate place to be.
 */
type FeedItem =
  | { kind: "message"; at: string; message: Message }
  | { kind: "tool"; at: string; tool: ToolCall };

export function WorkFeed() {
  const feed = createMemo<FeedItem[]>(() => {
    const convoId = activeConversationId();
    if (!convoId) return [];
    const items: FeedItem[] = [
      ...(state.messages[convoId] ?? []).map((m) => ({
        kind: "message" as const,
        at: m.created_at,
        message: m,
      })),
      ...(state.toolCalls[convoId] ?? []).map((t) => ({
        kind: "tool" as const,
        at: t.created_at,
        tool: t,
      })),
    ];
    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  });

  let scroller: HTMLDivElement | undefined;
  const [atBottom, setAtBottom] = createSignal(true);

  // Follow the work as it happens — unless you've scrolled up to read something,
  // in which case yanking the view away mid-sentence is the last thing you want.
  createEffect(() => {
    feed().length;
    activeWorking();
    if (!atBottom()) return;
    queueMicrotask(() => {
      scroller?.scrollTo({ top: scroller.scrollHeight });
    });
  });

  const onScroll = () => {
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    setAtBottom(distance < 120);
  };

  return (
    <div ref={scroller} onScroll={onScroll} class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex w-full max-w-[860px] flex-col px-6 pb-8 pt-5">
        <Show when={!feed().length}>
          <p class="py-10 text-center text-[12px] text-v2-text-text-faint">
            Nothing yet. This is where the agent's turns and every tool it uses
            will appear.
          </p>
        </Show>

        <For each={feed()}>
          {(item) =>
            item.kind === "tool" ? (
              <ToolLine tool={item.tool} />
            ) : item.message.sender_type === "user" ? (
              <UserChip message={item.message} />
            ) : item.message.sender_type === "system" ? (
              <SystemNote message={item.message} />
            ) : (
              <AgentBlock message={item.message} />
            )
          }
        </For>

        <Show when={activeWorking()}>
          <div class="flex items-center gap-2 py-3">
            <span class="aular-breathe size-1.5 rounded-full bg-v2-icon-icon-accent" />
            <span class="aular-shimmer text-[12px] font-medium">working</span>
          </div>
        </Show>
      </div>
    </div>
  );
}

/**
 * Agent output as a document block — full width, markdown, no bubble.
 *
 * Chat splits a reply into bubbles on <<<AULAR_CHUNK>>>; the work register reads
 * the turn as one document, so the marker is stripped. Leave it in and the HTML
 * sanitizer treats <AULAR_CHUNK> as a tag, drops it, and prints "<<>>".
 */
function AgentBlock(props: { message: Message }) {
  const content = () => props.message.content.replace(/<<<AULAR_CHUNK>>>/g, "\n\n");
  return (
    <div class="py-2 text-[13.5px] leading-relaxed text-v2-text-text-base">
      <Markdown content={content()} />
      <Show when={props.message.streaming}>
        <span class="aular-caret ml-0.5 inline-block h-3.5 w-[2px] bg-v2-icon-icon-accent align-middle" />
      </Show>
    </div>
  );
}

/** Your turns — compact chips on the right, in the same accent as the chat
 *  view's user bubbles: one voice, one color, whichever lens is on. */
function UserChip(props: { message: Message }) {
  return (
    <div class="flex justify-end py-2.5">
      <div class="max-w-[78%] whitespace-pre-wrap break-words rounded-md bg-v2-background-bg-accent px-3 py-2 text-[12.5px] leading-5 text-v2-text-text-inverse">
        {props.message.content || "(media)"}
      </div>
    </div>
  );
}

/** Platform notes — a dispatch landing, a report relayed, a doc saved. */
function SystemNote(props: { message: Message }) {
  return (
    <div class="py-2">
      <div class="rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-2 text-[12px] leading-relaxed text-v2-text-text-muted">
        <Markdown content={props.message.content} />
      </div>
    </div>
  );
}

/**
 * A tool invocation as a collapsible summary line.
 *
 * Status semantics are the prototype's, and they are deliberately honest: a
 * call is `running` while its turn is in flight and `settled` when the turn's
 * reply finalizes. Hermes does not report per-call success, so we never claim
 * it did.
 */
function ToolLine(props: { tool: ToolCall }) {
  const [open, setOpen] = createSignal(false);
  const running = () => props.tool.status === "running";

  const argsPreview = createMemo(() => {
    const args = props.tool.request_payload?.args;
    if (!args) return "";
    try {
      const s = JSON.stringify(args);
      return s.length > 88 ? s.slice(0, 85) + "…" : s;
    } catch {
      return "";
    }
  });

  const snippet = () => props.tool.response_payload?.snippet;

  return (
    <div class="group/tool py-0.5">
      <div class="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        class="flex w-full min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-[12px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
      >
        <span
          class="shrink-0 transition-transform"
          style={{ transform: open() ? "rotate(90deg)" : "none" }}
        >
          <Icon name="chevron-right" size="small" />
        </span>
        <span
          class="shrink-0 font-mono"
          classList={{
            "text-v2-icon-icon-accent": running(),
            "aular-breathe": running(),
          }}
        >
          {props.tool.tool_name}
        </span>
        <Show when={argsPreview()}>
          <span class="truncate font-mono text-[11px] text-v2-text-text-faint">
            {argsPreview()}
          </span>
        </Show>
      </button>
      <button
        type="button"
        title={state.pinnedToolId === props.tool.id ? "Unpin output" : "Pin output beside the chat"}
        onClick={() => actions.pinTool(state.pinnedToolId === props.tool.id ? null : props.tool.id)}
        class="shrink-0 rounded px-1.5 py-1 text-[10.5px] font-medium opacity-0 transition-opacity focus-visible:opacity-100 group-hover/tool:opacity-100"
        classList={{
          "text-v2-icon-icon-accent opacity-100": state.pinnedToolId === props.tool.id,
          "text-v2-text-text-faint hover:text-v2-text-text-base": state.pinnedToolId !== props.tool.id,
        }}
      >
        {state.pinnedToolId === props.tool.id ? "Pinned" : "Pin"}
      </button>
      </div>

      <Show when={open()}>
        <div class="ml-5 flex flex-col gap-2 border-l border-v2-border-border-muted py-2 pl-3">
          <Show when={props.tool.request_payload?.preview}>
            <pre class="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-v2-text-text-muted">
              {props.tool.request_payload!.preview}
            </pre>
          </Show>
          <Show
            when={snippet()}
            fallback={
              <span class="text-[11px] text-v2-text-text-faint">
                {running() ? "running…" : "no result captured"}
              </span>
            }
          >
            <pre
              data-selectable
              class="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-v2-text-text-muted"
            >
              {snippet()}
            </pre>
          </Show>
        </div>
      </Show>
    </div>
  );
}

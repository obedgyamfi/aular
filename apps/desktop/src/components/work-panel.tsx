import { createMemo, createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Markdown } from "~/components/markdown";
import { Composer } from "~/components/composer";
import {
  activeAgent,
  activeConversationId,
  activeWorking,
  state,
} from "~/lib/store";
import type { Message, ToolCall } from "~/lib/types";

/**
 * The Work register — ported from the prototype's WorkPanel.
 *
 * A Claude-Code-style workspace for whichever agent is selected: the agent's
 * output renders as a full-width document (no bubbles), your turns are compact
 * chips on the right, and every tool the agent uses appears in place as a
 * collapsible `› tool — preview` line, pulsing while it runs. The feed is the
 * conversation and the tool calls interleaved by time, which is what makes the
 * agent's actual work legible rather than just its conclusions.
 */
type FeedItem =
  | { kind: "message"; at: string; message: Message }
  | { kind: "tool"; at: string; tool: ToolCall };

export function WorkPanel() {
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

  let bottom: HTMLDivElement | undefined;
  createMemo(() => {
    feed().length;
    activeWorking();
    queueMicrotask(() => bottom?.scrollIntoView({ block: "end" }));
  });

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-v2-background-bg-base">
      <Show
        when={activeAgent()}
        fallback={
          <div class="flex flex-1 items-center justify-center">
            <p class="text-[13px] text-v2-text-text-muted">
              Pick an agent to open its workspace
            </p>
          </div>
        }
      >
        {(agent) => (
          <>
            <div class="flex h-9 shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-4">
              <span class="text-[13px] font-medium text-v2-text-text-base">
                {agent().name}
              </span>
              <span class="text-[11px] text-v2-text-text-weak">work session</span>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto">
              <div class="mx-auto flex w-full max-w-[860px] flex-col px-6 py-5">
                <Show when={!feed().length}>
                  <p class="py-10 text-center text-[12px] text-v2-text-text-weak">
                    Nothing yet. This is where the agent's turns and every tool it
                    uses will appear.
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
                  <div class="flex items-center gap-2 py-3 text-[12px] text-v2-text-text-weak">
                    <span class="size-1.5 animate-pulse rounded-full bg-v2-icon-icon-accent" />
                    working…
                  </div>
                </Show>

                <div ref={bottom} />
              </div>
            </div>
          </>
        )}
      </Show>

      <Composer />
    </div>
  );
}

/** Agent output as a document block — full width, markdown, no bubble. */
function AgentBlock(props: { message: Message }) {
  return (
    <div class="py-2 text-[13.5px] leading-relaxed text-v2-text-text-base">
      <Markdown content={props.message.content} />
      <Show when={props.message.streaming}>
        <span class="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-v2-icon-icon-accent align-middle" />
      </Show>
    </div>
  );
}

/** Your turns — compact chips on the right, as in the prototype. */
function UserChip(props: { message: Message }) {
  return (
    <div class="flex justify-end py-2.5">
      <div class="max-w-[78%] whitespace-pre-wrap break-words rounded-md bg-v2-background-bg-layer-02 px-3 py-2 text-[12.5px] leading-5 text-v2-text-text-base">
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
    <div class="py-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        class="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[12px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
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
            "animate-pulse": running(),
          }}
        >
          {props.tool.tool_name}
        </span>
        <Show when={argsPreview()}>
          <span class="truncate font-mono text-[11px] text-v2-text-text-weak">
            {argsPreview()}
          </span>
        </Show>
      </button>

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
              <span class="text-[11px] text-v2-text-text-weak">
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

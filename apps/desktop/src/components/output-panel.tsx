import { createMemo, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { actions, state } from "~/lib/store";
import type { ToolCall } from "~/lib/types";

/**
 * The pinned output — a tool call's work, held open beside the conversation
 * (the Claude-artifacts pattern): pin a running command and watch its output
 * grow while you keep talking. Unified-diff content gets its +/− lines
 * colored, because "what changed" is the single most pinned thing in a
 * software org.
 */
export function OutputPanel() {
  const call = createMemo<ToolCall | undefined>(() => {
    const id = state.pinnedToolId;
    if (!id) return undefined;
    for (const list of Object.values(state.toolCalls)) {
      const hit = list.find((t) => t.id === id);
      if (hit) return hit;
    }
    return undefined;
  });

  const snippet = () => call()?.response_payload?.snippet ?? "";
  const isDiff = createMemo(() => looksLikeDiff(snippet()));

  return (
    <Show when={call()}>
      {(tc) => (
        <aside class="aular-pop flex w-[380px] min-w-0 shrink-0 flex-col border-l border-v2-border-border-muted bg-v2-background-bg-layer-01 xl:w-[440px]">
          <header class="flex h-11 shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-3">
            <span
              class="shrink-0 font-mono text-[12px] font-medium text-v2-text-text-base"
              classList={{ "aular-breathe text-v2-icon-icon-accent": tc().status === "running" }}
            >
              {tc().tool_name}
            </span>
            <span class="min-w-0 flex-1 truncate text-[10.5px] text-v2-text-text-faint">
              {tc().status === "running" ? "running — output follows live" : "settled"}
            </span>
            <button
              type="button"
              aria-label="Unpin output"
              onClick={() => actions.pinTool(null)}
              class="flex size-7 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
            >
              <Icon name="close-small" size="small" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-auto p-3">
            <Show when={tc().request_payload?.preview}>
              <pre class="mb-3 whitespace-pre-wrap rounded-md bg-v2-background-bg-layer-02 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-v2-text-text-muted">
                {tc().request_payload!.preview}
              </pre>
            </Show>

            <Show
              when={snippet()}
              fallback={
                <p class="py-8 text-center text-[11.5px] text-v2-text-text-faint">
                  {tc().status === "running"
                    ? "No output yet — it lands here as the tool reports."
                    : "This call captured no output."}
                </p>
              }
            >
              <Show
                when={isDiff()}
                fallback={
                  <pre
                    data-selectable
                    class="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-v2-text-text-base"
                  >
                    {snippet()}
                  </pre>
                }
              >
                <DiffView text={snippet()} />
              </Show>
            </Show>
          </div>
        </aside>
      )}
    </Show>
  );
}

/** Heuristic: enough diff-shaped lines to be worth coloring. */
function looksLikeDiff(text: string): boolean {
  if (!text) return false;
  const lines = text.split("\n");
  let marks = 0;
  for (const l of lines) {
    if (/^(\+\+\+|---|@@|diff --git|[+-][^+-])/.test(l)) marks++;
  }
  return marks >= 4 && marks >= lines.length * 0.2;
}

function DiffView(props: { text: string }) {
  const lines = () => props.text.split("\n");
  return (
    <pre data-selectable class="font-mono text-[11.5px] leading-relaxed">
      <For each={lines()}>
        {(l) => (
          <div
            class="whitespace-pre-wrap px-1"
            classList={{
              "bg-v2-state-bg-success text-v2-state-fg-success":
                l.startsWith("+") && !l.startsWith("+++"),
              "bg-v2-state-bg-danger text-v2-state-fg-danger":
                l.startsWith("-") && !l.startsWith("---"),
              "text-v2-text-text-accent": l.startsWith("@@"),
              "font-semibold text-v2-text-text-base":
                l.startsWith("diff --git") || l.startsWith("+++") || l.startsWith("---"),
              "text-v2-text-text-muted": !/^[+@-]|^diff /.test(l),
            }}
          >
            {l || " "}
          </div>
        )}
      </For>
    </pre>
  );
}

import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import ChevronDown from "lucide-solid/icons/chevron-down";

import { ToolCard, toolIcon } from "~/components/tool-card";
import type { ToolCall } from "~/lib/types";

/**
 * A run of tool calls, as one line.
 *
 * Threads here reach a hundred calls, and drawing a hundred lines buries the
 * conversation they belong to. Consecutive calls collapse into a single
 * summary — "Ran 9 tools" — that opens into the individual lines, which is the
 * pattern assistant-ui's ToolGroup and the AI SDK's Tool both landed on: status
 * as a signal, detail one click away.
 *
 * While the turn is live the group opens itself and names the tool currently
 * running, so you can watch the work happen; when the turn settles it closes
 * again. That auto-close is deliberate — a finished run is history, and history
 * belongs folded up.
 *
 * No durations: a ToolCall carries `created_at` and nothing that says when it
 * finished, so any elapsed time shown here would be invented.
 */
export function ToolGroup(props: { tools: ToolCall[] }) {
  const running = createMemo(() => props.tools.some((t) => t.status === "running"));
  const current = createMemo(() => props.tools.find((t) => t.status === "running"));

  // Manual intent wins over the automatic open/close, until the run's state
  // changes again — otherwise closing a live group would immediately reopen it.
  const [manual, setManual] = createSignal<boolean | null>(null);
  createEffect(() => {
    running();
    setManual(null);
  });
  const open = () => manual() ?? running();

  // A single call is not a "group": it reads as itself, with no summary line
  // to open first.
  return (
    <Show
      when={props.tools.length > 1}
      fallback={<ToolCard tool={props.tools[0]!} />}
    >
      <div class="not-prose w-full">
        <button
          type="button"
          onClick={() => setManual(!open())}
          aria-expanded={open()}
          class="group/sum -mx-1.5 flex min-h-7 w-[calc(100%+0.75rem)] max-w-[calc(100%+0.75rem)] items-center gap-1.5 rounded-[var(--r2)] px-1.5 text-left transition-colors hover:bg-[var(--element-hover)]"
        >
          <span class="grid size-4 shrink-0 place-items-center">
            <Show
              when={running()}
              fallback={
                <span class="text-[var(--faint)] transition-colors group-hover/sum:text-[var(--muted)]">
                  {toolIcon(props.tools[props.tools.length - 1]!.tool_name)}
                </span>
              }
            >
              <span class="aular-breathe size-1.5 rounded-full bg-[var(--accent)]" />
            </Show>
          </span>

          <span
            class="shrink-0 text-[13px] font-semibold transition-colors group-hover/sum:text-[var(--text)]"
            classList={{ "text-[var(--text)]": open(), "text-[var(--muted)]": !open() }}
          >
            {running() ? "Working" : `Ran ${props.tools.length} tools`}
          </span>

          {/* Live, the useful thing is WHICH tool is going right now; settled,
              it's how many distinct tools the turn reached for. */}
          <span class="min-w-0 truncate font-mono text-[12px] text-[var(--faint)]">
            <Show when={running()} fallback={distinctLabel(props.tools)}>
              · {props.tools.length} tools
              <Show when={current()}> · {current()!.tool_name}</Show>
            </Show>
          </span>

          <ChevronDown
            size={14}
            stroke-width={2}
            class="ml-auto shrink-0 text-[var(--faint)] transition-transform group-hover/sum:text-[var(--text)]"
            style={{ transform: open() ? "rotate(180deg)" : "none" }}
          />
        </button>

        <Show when={open()}>
          {/* Indented under the summary and hung off a rule, so an opened run
              reads as belonging to its line rather than floating beside it. */}
          <div class="mt-0.5 flex flex-col gap-0.5 border-l border-[var(--line)] pl-3 ml-[7px]">
            <For each={props.tools}>{(t) => <ToolCard tool={t} />}</For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

/** "terminal, patch and 3 more" — what the run actually touched. */
function distinctLabel(tools: ToolCall[]): string {
  const names = [...new Set(tools.map((t) => t.tool_name))];
  if (names.length === 1) return `· ${names[0]}`;
  if (names.length === 2) return `· ${names[0]} and ${names[1]}`;
  return `· ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

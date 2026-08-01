import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import ChevronDown from "lucide-solid/icons/chevron-down";
import CornerDownRight from "lucide-solid/icons/corner-down-right";

import { Avatar } from "~/components/avatar";
import { DelegationCard } from "~/components/delegation-card";
import { STATE_META } from "~/components/task-state";
import type { Task, TaskState } from "~/lib/types";
import { TERMINAL_TASK_STATES } from "~/lib/types";

/**
 * A round of hand-offs, as one line.
 *
 * A lead dispatching a phase of work fans out to half a dozen teammates at
 * once, and drawing a card each turned the thread into a column of cards with
 * the conversation nowhere in sight. Consecutive delegations now fold into one
 * summary the same way a tool run does — same vocabulary, so the timeline has
 * one idea of what "a group of things happened here" looks like.
 *
 * The summary carries the split between what's still moving and what's landed,
 * because that's the question you actually have when a lead has just fanned
 * work out: is this round finished?
 */
export function DelegationGroup(props: { tasks: Task[] }) {
  const active = createMemo(() => props.tasks.filter((t) => !TERMINAL_TASK_STATES.has(t.state)));
  const running = () => active().length > 0;

  // Manual intent wins until the round's live/settled state changes — matching
  // ToolGroup, so collapsing a live group doesn't fight you.
  const [manual, setManual] = createSignal<boolean | null>(null);
  createEffect(() => {
    running();
    setManual(null);
  });
  const open = () => manual() ?? running();

  /** Who it went to, deduped — four faces, then a count. */
  const assignees = createMemo(() => {
    const seen = new Map<string, string>();
    for (const t of props.tasks) seen.set(t.to_agent_name, t.to_agent_name);
    return [...seen.values()];
  });

  /** "7 done, 2 working" — the states actually present, commonest first. */
  const breakdown = createMemo(() => {
    const counts = new Map<TaskState, number>();
    for (const t of props.tasks) counts.set(t.state, (counts.get(t.state) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${n} ${STATE_META[s].label.toLowerCase()}`)
      .join(", ");
  });

  return (
    <Show
      when={props.tasks.length > 1}
      fallback={<DelegationCard task={props.tasks[0]!} />}
    >
      <div class="not-prose w-full max-w-[560px]">
        <button
          type="button"
          onClick={() => setManual(!open())}
          aria-expanded={open()}
          class="group/sum -mx-1.5 flex min-h-7 w-[calc(100%+0.75rem)] items-center gap-1.5 rounded-[var(--r2)] px-1.5 text-left transition-colors hover:bg-[var(--element-hover)]"
        >
          <span class="grid size-4 shrink-0 place-items-center text-[var(--faint)]">
            <CornerDownRight size={13} stroke-width={2} />
          </span>

          <span
            class="shrink-0 text-[13px] font-semibold transition-colors group-hover/sum:text-[var(--text)]"
            classList={{ "text-[var(--text)]": open(), "text-[var(--muted)]": !open() }}
          >
            {running()
              ? `Delegating ${props.tasks.length} tasks`
              : `Delegated ${props.tasks.length} tasks`}
          </span>

          {/* Faces rather than names: at six hand-offs the names stop fitting,
              and who did it is the thing you're scanning for. */}
          <span class="flex shrink-0 items-center -space-x-1.5">
            <For each={assignees().slice(0, 4)}>
              {(name) => (
                <span class="rounded-full ring-2 ring-[var(--bg)]">
                  <Avatar name={name} size={16} circle />
                </span>
              )}
            </For>
            <Show when={assignees().length > 4}>
              <span class="pl-2.5 text-[11px] text-[var(--faint)]">
                +{assignees().length - 4}
              </span>
            </Show>
          </span>

          <span class="min-w-0 truncate text-[12px] text-[var(--faint)]">
            · {breakdown()}
          </span>

          <ChevronDown
            size={14}
            stroke-width={2}
            class="ml-auto shrink-0 text-[var(--faint)] transition-transform group-hover/sum:text-[var(--text)]"
            style={{ transform: open() ? "rotate(180deg)" : "none" }}
          />
        </button>

        <Show when={open()}>
          <div class="mt-1 ml-[7px] flex flex-col gap-1.5 border-l border-[var(--line)] pl-3">
            <For each={props.tasks}>{(t) => <DelegationCard task={t} />}</For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

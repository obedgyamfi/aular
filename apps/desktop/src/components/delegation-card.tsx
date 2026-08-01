import { createSignal, Show } from "solid-js";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import CornerDownRight from "lucide-solid/icons/corner-down-right";

import { Avatar } from "~/components/avatar";
import { Markdown } from "~/components/markdown";
import { STATE_META, StateDot } from "~/components/task-state";
import { actions, state } from "~/lib/store";
import type { Task } from "~/lib/types";

/**
 * A hand-off, in the conversation that made it.
 *
 * The dispatch protocol was invisible here: an agent emitted a block, the
 * platform routed real work to a teammate, and the thread showed nothing —
 * the delegation lived only as a chip above the composer that disappeared the
 * moment it finished. So the story of who did what was unreadable an hour
 * later.
 *
 * This is that story, in place and in time: who it went to, what they were
 * asked, where it got to, and their report when it lands. Indented to the
 * prose column like a tool call, because it is the same kind of thing — the
 * agent reaching past the conversation to get something done.
 */
export function DelegationCard(props: { task: Task }) {
  const t = () => props.task;
  const [briefOpen, setBriefOpen] = createSignal(false);
  const [open, setOpen] = createSignal(false);

  const meta = () => STATE_META[t().state];
  const report = () => t().state_message?.trim() ?? "";
  const assignee = () =>
    t().to_agent_profile_id
      ? state.agents.find((a) => a.id === t().to_agent_profile_id)
      : undefined;

  /** The teammate's thread is where the work actually happened. */
  const openAssignee = () => {
    const id = t().to_agent_profile_id;
    if (id) void actions.openChat(id);
  };

  return (
    <section class="not-prose w-full max-w-[560px] overflow-hidden rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)]">
      <div class="flex items-center gap-2 px-3 py-2">
        <span class="shrink-0 text-[var(--faint)]">
          <CornerDownRight size={13} stroke-width={2} />
        </span>
        <span class="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
          Delegated to
        </span>
        <button
          type="button"
          onClick={openAssignee}
          disabled={!t().to_agent_profile_id}
          class="flex min-w-0 items-center gap-1.5 rounded-[var(--pill)] py-0.5 pl-0.5 pr-2 transition-colors enabled:hover:bg-[var(--element-hover)]"
        >
          <Avatar name={assignee()?.name ?? t().to_agent_name} size={16} circle />
          <span class="truncate text-[12px] font-semibold text-[var(--text-2)]">
            {assignee()?.name ?? t().to_agent_name}
          </span>
        </button>
        <span class="ml-auto flex shrink-0 items-center gap-1.5">
          <StateDot state={t().state} />
          <span class="text-[11px] font-semibold" style={{ color: meta().color }}>
            {meta().label}
          </span>
        </span>
      </div>

      {/* The brief, folded. These run to a paragraph or more of exact
          requirements — every hand-off in a busy thread printing its full
          instruction turns the conversation into a wall of specs. One line
          says what it was about; click for the rest. */}
      <button
        type="button"
        onClick={() => setBriefOpen((o) => !o)}
        aria-expanded={briefOpen()}
        class="flex w-full items-start gap-1.5 border-t border-[var(--line)] px-3 py-2 text-left transition-colors hover:bg-[var(--element-hover)]"
      >
        <span
          class="mt-0.5 shrink-0 text-[var(--faint)] transition-transform"
          classList={{ "rotate-90": briefOpen() }}
        >
          <ChevronRight size={13} stroke-width={2} />
        </span>
        <span
          class="min-w-0 flex-1 break-words text-[12.5px] leading-[18px] text-[var(--text-2)]"
          classList={{
            "whitespace-pre-wrap": briefOpen(),
            "truncate": !briefOpen(),
          }}
        >
          {t().task}
        </span>
      </button>

      {/* Their report, once there is one. Collapsed by default: a delegation
          that returns two pages of findings must not bury the conversation
          that asked for it. */}
      <Show when={report()}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open()}
          class="flex w-full items-center gap-1.5 border-t border-[var(--line)] px-3 py-1.5 text-left text-[11.5px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
        >
          <span
            class="transition-transform"
            classList={{ "rotate-180": open() }}
          >
            <ChevronDown size={13} stroke-width={2} />
          </span>
          {open() ? "Hide report" : "Read report"}
        </button>
        <Show when={open()}>
          <div class="min-w-0 break-words border-t border-[var(--line)] px-3 py-2 text-[12.5px] [overflow-wrap:anywhere]">
            <Markdown content={report()} sans />
          </div>
        </Show>
      </Show>
    </section>
  );
}

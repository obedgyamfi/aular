import { createMemo, createSignal, For, Show } from "solid-js";
import autoAnimate from "@formkit/auto-animate";

import { Avatar } from "~/components/avatar";
import { RepoGraph } from "~/components/repo-graph";
import { age, StateDot, STATE_META } from "~/components/task-state";
import { actions, state } from "~/lib/store";
import type { Task, TaskState } from "~/lib/types";
import { TERMINAL_TASK_STATES } from "~/lib/types";

/**
 * Mission control — the org's work as a board, the same pattern GitHub's
 * Agent HQ converged on: assign, steer, and track from one surface.
 *
 * Lanes are the A2A lifecycle, in the order work flows: queued → working →
 * needs input → finished. The two middle lanes are the live org; "needs
 * input" is YOUR inbox (answer without leaving the board); finished keeps
 * the recent past honest — failures and cancellations wear their own marks
 * instead of vanishing. A card click lands in the worker's conversation,
 * because the board is a lens on the org, not a separate place.
 */
const LANES: { states: TaskState[]; label: string; icon: TaskState }[] = [
  { states: ["submitted"], label: "Queued", icon: "submitted" },
  { states: ["working"], label: "Working", icon: "working" },
  { states: ["input-required"], label: "Needs input", icon: "input-required" },
  {
    states: ["completed", "failed", "rejected", "canceled"],
    label: "Finished",
    icon: "completed",
  },
];

const FINISHED_SHOWN = 25;

export function WorkBoard() {
  const [view, setView] = createSignal<"board" | "commits">("board");
  const byLane = createMemo(() => {
    const all = Object.values(state.tasks).sort((a, b) =>
      (b.state_updated_at ?? b.created_at).localeCompare(a.state_updated_at ?? a.created_at),
    );
    return LANES.map((lane) => {
      const tasks = all.filter((t) => lane.states.includes(t.state));
      return {
        ...lane,
        tasks: lane.states.length > 1 ? tasks.slice(0, FINISHED_SHOWN) : tasks,
        count: tasks.length,
      };
    });
  });

  const anyWork = () => Object.keys(state.tasks).length > 0;

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-v2-background-bg-base">
      <header class="flex h-11 shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-4">
        <h1 class="text-[13px] font-medium text-v2-text-text-base">Work</h1>
        <div class="ml-1 flex items-center gap-px overflow-hidden rounded-md border border-v2-border-border-muted">
          <ViewTab active={view() === "board"} onClick={() => setView("board")}>Board</ViewTab>
          <ViewTab active={view() === "commits"} onClick={() => setView("commits")}>Commits</ViewTab>
        </div>
        <p class="text-[11.5px] text-v2-text-text-muted">
          {view() === "board"
            ? "every task in the org, live — click a card to open the conversation behind it"
            : "the repository's history, drawn — who committed what, on which branch"}
        </p>
      </header>

      <Show when={view() === "commits"}>
        <RepoGraph />
      </Show>

      <Show when={view() === "board"}>
      <Show
        when={anyWork()}
        fallback={
          <div class="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
            <div class="max-w-[440px]">
              <p class="text-[13px] font-medium text-v2-text-text-base">
                No work has been dispatched yet
              </p>
              <p class="pt-1.5 text-[11.5px] leading-relaxed text-v2-text-text-muted">
                When an agent hands work to a teammate, the task appears here
                and moves through its lifecycle: queued, working, paused for
                your input, finished. Ask a lead to delegate something and
                watch it land.
              </p>
            </div>
          </div>
        }
      >
        <div class="min-h-0 flex-1 overflow-x-auto p-4">
          {/* Centered while it fits; scrolls once the org outgrows the window. */}
          <div class="mx-auto flex h-full w-fit min-w-min gap-3">
          <For each={byLane()}>
            {(lane) => (
              <section class="flex h-full w-[290px] shrink-0 flex-col rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-01">
                <header class="flex shrink-0 items-center gap-1.5 px-3 pb-2 pt-2.5">
                  <StateDot state={lane.icon} size={11} />
                  <span class="text-[11.5px] font-semibold text-v2-text-text-base">
                    {lane.label}
                  </span>
                  <span class="rounded-full bg-v2-background-bg-layer-02 px-1.5 text-[10px] tabular-nums text-v2-text-text-faint">
                    {lane.count}
                  </span>
                </header>
                <div
                  ref={(el) => autoAnimate(el, { duration: 180, easing: "cubic-bezier(0,0,.2,1)" })}
                  class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2"
                >
                  <For
                    each={lane.tasks}
                    fallback={
                      <p class="px-2 py-6 text-center text-[11px] text-v2-text-text-faint">
                        Empty
                      </p>
                    }
                  >
                    {(t) => <TaskCard task={t} />}
                  </For>
                </div>
              </section>
            )}
          </For>
          </div>
        </div>
      </Show>
      </Show>
    </div>
  );
}

function ViewTab(props: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="px-2.5 py-1 text-[11px] transition-colors"
      classList={{
        "bg-v2-overlay-simple-overlay-pressed font-medium text-v2-text-text-base": props.active,
        "text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base": !props.active,
      }}
    >
      {props.children}
    </button>
  );
}

function TaskCard(props: { task: Task }) {
  const [answer, setAnswer] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const t = () => props.task;
  const terminal = () => TERMINAL_TASK_STATES.has(t().state);
  const worker = () =>
    state.agents.find((a) => a.id === t().to_agent_profile_id);

  const openWorker = () => {
    const w = worker();
    actions.setRegister("chat");
    if (w) void actions.openAgent(w.id);
  };

  const send = async (e: Event) => {
    e.stopPropagation();
    if (!answer().trim() || busy()) return;
    setBusy(true);
    try {
      await actions.answerTask(t().id, answer().trim());
      setAnswer("");
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (e: Event) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await actions.cancelTask(t().id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      role="button"
      tabindex="0"
      onClick={openWorker}
      onKeyDown={(e) => e.key === "Enter" && openWorker()}
      class="cursor-pointer rounded-lg border border-v2-border-border-muted bg-v2-background-bg-base p-2.5 outline-none transition-colors hover:border-v2-border-border-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:border-v2-border-border-focus"
      classList={{ "opacity-75": terminal() && t().state !== "completed" }}
    >
      <div class="flex items-center gap-1.5">
        <Avatar name={t().to_agent_name} size={18} />
        <span class="min-w-0 flex-1 truncate text-[11.5px] font-medium text-v2-text-text-base">
          {t().to_agent_name}
        </span>
        <Show when={terminal()}>
          <span
            class="text-[10px] font-medium"
            style={{ color: STATE_META[t().state].color }}
          >
            {STATE_META[t().state].label}
          </span>
        </Show>
        <StateDot state={t().state} size={11} />
      </div>

      <p class="line-clamp-3 pt-1.5 text-[11.5px] leading-relaxed text-v2-text-text-muted">
        {t().task}
      </p>

      <Show when={t().state === "input-required" && t().state_message}>
        <p class="pt-1.5 text-[11px] font-medium leading-relaxed text-v2-state-fg-warning">
          {t().state_message}
        </p>
        <div class="flex items-center gap-1.5 pt-1.5" onClick={(e) => e.stopPropagation()}>
          <input
            value={answer()}
            onInput={(e) => setAnswer(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") void send(e);
            }}
            placeholder="Answer and resume…"
            class="min-w-0 flex-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-2 py-1 text-[11px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus"
          />
          <button
            type="button"
            disabled={!answer().trim() || busy()}
            onClick={(e) => void send(e)}
            class="shrink-0 rounded-md bg-v2-background-bg-accent px-2 py-1 text-[10.5px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </Show>

      <Show when={t().state === "failed" || t().state === "rejected"}>
        <Show when={t().state_message}>
          <p class="pt-1.5 text-[11px] leading-relaxed text-v2-state-fg-danger">
            {t().state_message}
          </p>
        </Show>
      </Show>

      <div class="flex items-center justify-between pt-2 text-[10px] text-v2-text-text-faint">
        <span class="min-w-0 truncate">from {t().from_agent_name}</span>
        <span class="flex shrink-0 items-center gap-2 tabular-nums">
          {age(t().state_updated_at ?? t().created_at)}
          <Show when={!terminal()}>
            <button
              type="button"
              disabled={busy()}
              onClick={(e) => void cancel(e)}
              title="Cancel this task"
              class="rounded px-1 py-0.5 text-[10px] font-medium text-v2-text-text-faint transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-state-fg-danger"
            >
              Cancel
            </button>
          </Show>
        </span>
      </div>
    </article>
  );
}

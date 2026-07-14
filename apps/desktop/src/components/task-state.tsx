import { createSignal, For, onCleanup, Show } from "solid-js";

import { actions } from "~/lib/store";
import type { Task, TaskState } from "~/lib/types";

/**
 * The task lifecycle, drawn — one visual language for every surface (chat
 * strip, bell inbox, board, profile).
 *
 * Each A2A state gets a shape AND a color (identity is never color-alone):
 * submitted ○ quiet, working ◐ in the org's work-orange (it breathes — work
 * is alive), input-required ◆ warning (the state that needs a person),
 * completed ● success, failed/rejected ✕ danger, canceled ⊘ struck quiet.
 * Shapes are drawn, not font glyphs, so they render identically everywhere.
 */
export const STATE_META: Record<
  TaskState,
  { label: string; color: string; order: number }
> = {
  submitted: { label: "Queued", color: "var(--v2-text-text-faint)", order: 0 },
  working: { label: "Working", color: "var(--viz-2)", order: 1 },
  "input-required": {
    label: "Needs input",
    color: "var(--v2-state-fg-warning)",
    order: 2,
  },
  completed: { label: "Done", color: "var(--v2-state-fg-success)", order: 3 },
  failed: { label: "Failed", color: "var(--v2-state-fg-danger)", order: 4 },
  rejected: { label: "Rejected", color: "var(--v2-state-fg-danger)", order: 5 },
  canceled: { label: "Canceled", color: "var(--v2-text-text-faint)", order: 6 },
};

/** The state glyph: a 12px drawn shape in the state's color. */
export function StateDot(props: { state: TaskState; size?: number }) {
  const s = () => props.size ?? 12;
  const c = () => STATE_META[props.state].color;
  return (
    <svg
      width={s()}
      height={s()}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      class="shrink-0"
      classList={{ "aular-breathe": props.state === "working" }}
    >
      {props.state === "submitted" && (
        <circle cx="6" cy="6" r="4.5" stroke={c()} stroke-width="1.5" />
      )}
      {props.state === "working" && (
        <>
          <circle cx="6" cy="6" r="4.5" stroke={c()} stroke-width="1.5" />
          <path d="M6 1.5 A4.5 4.5 0 0 1 6 10.5 Z" fill={c()} />
        </>
      )}
      {props.state === "input-required" && (
        <path d="M6 1 L11 6 L6 11 L1 6 Z" fill={c()} />
      )}
      {props.state === "completed" && (
        <>
          <circle cx="6" cy="6" r="5" fill={c()} />
          <path
            d="M3.8 6.2 L5.4 7.8 L8.4 4.6"
            stroke="var(--v2-background-bg-base)"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </>
      )}
      {(props.state === "failed" || props.state === "rejected") && (
        <>
          <circle cx="6" cy="6" r="5" fill={c()} />
          <path
            d="M4.2 4.2 L7.8 7.8 M7.8 4.2 L4.2 7.8"
            stroke="var(--v2-background-bg-base)"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </>
      )}
      {props.state === "canceled" && (
        <>
          <circle cx="6" cy="6" r="4.5" stroke={c()} stroke-width="1.5" />
          <path d="M3 9 L9 3" stroke={c()} stroke-width="1.5" stroke-linecap="round" />
        </>
      )}
    </svg>
  );
}

/** A compact chip: glyph + label (+ optional detail popover with actions). */
export function TaskChip(props: {
  task: Task;
  /** "assigned" = this agent owes it; "delegated" = it farmed it out. */
  direction: "assigned" | "delegated";
}) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;
  const onDown = (e: PointerEvent) => {
    if (!root?.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDown));

  const t = () => props.task;
  const meta = () => STATE_META[t().state];
  const other = () =>
    props.direction === "assigned"
      ? `from ${t().from_agent_name}`
      : `→ ${t().to_agent_name}`;

  return (
    <div ref={root} class="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open()}
        title={t().task}
        class="flex max-w-[260px] items-center gap-1.5 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 py-1 pl-2 pr-2.5 transition-colors hover:border-v2-border-border-base hover:bg-v2-overlay-simple-overlay-hover"
      >
        <StateDot state={t().state} />
        <span
          class="whitespace-nowrap text-[11px] font-medium"
          style={{ color: meta().color }}
        >
          {meta().label}
        </span>
        <span class="min-w-0 truncate text-[11px] text-v2-text-text-muted">
          {t().task}
        </span>
        <span class="shrink-0 text-[10px] text-v2-text-text-faint">{other()}</span>
      </button>

      <Show when={open()}>
        <TaskDetail task={t()} onClose={() => setOpen(false)} />
      </Show>
    </div>
  );
}

/** The chip's popover: full task, lifecycle line, and the human's controls. */
function TaskDetail(props: { task: Task; onClose: () => void }) {
  const [answer, setAnswer] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const t = () => props.task;
  const meta = () => STATE_META[t().state];

  const send = async () => {
    if (!answer().trim() || busy()) return;
    setBusy(true);
    try {
      await actions.answerTask(t().id, answer().trim());
      props.onClose();
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      await actions.cancelTask(t().id);
      props.onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="absolute left-0 top-full z-40 mt-1.5 w-[340px] rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-02 p-3 shadow-xl">
      <div class="flex items-center gap-1.5">
        <StateDot state={t().state} />
        <span class="text-[11.5px] font-semibold" style={{ color: meta().color }}>
          {meta().label}
        </span>
        <span class="text-[10.5px] text-v2-text-text-faint">
          {t().from_agent_name} → {t().to_agent_name} · {age(t().created_at)}
        </span>
      </div>

      <p class="max-h-[120px] overflow-y-auto pt-2 text-[12px] leading-relaxed text-v2-text-text-base">
        {t().task}
      </p>

      <Show when={t().state_message}>
        <p class="pt-1.5 text-[11.5px] leading-relaxed text-v2-text-text-muted">
          {t().state === "input-required" ? "Needs: " : ""}
          {t().state_message}
        </p>
      </Show>

      <Show when={t().state === "input-required"}>
        <div class="flex items-center gap-1.5 pt-2.5">
          <input
            value={answer()}
            onInput={(e) => setAnswer(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            placeholder="Answer and resume…"
            class="min-w-0 flex-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-2.5 py-1.5 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus"
          />
          <button
            type="button"
            disabled={!answer().trim() || busy()}
            onClick={() => void send()}
            class="shrink-0 rounded-md bg-v2-background-bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </Show>

      <div class="flex items-center justify-between pt-2.5">
        <span class="font-mono text-[10px] text-v2-text-text-faint">
          {t().id.slice(0, 8)}
        </span>
        <button
          type="button"
          disabled={busy()}
          onClick={() => void cancel()}
          class="rounded-md px-2 py-1 text-[11px] font-medium text-v2-state-fg-danger transition-colors hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-50"
        >
          Cancel task
        </button>
      </div>
    </div>
  );
}

/** The strip under a chat header: this conversation's live work. */
export function TaskStrip(props: { assigned: Task[]; delegated: Task[] }) {
  const any = () => props.assigned.length + props.delegated.length > 0;
  return (
    <Show when={any()}>
      <div class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-v2-border-border-muted px-3 py-1.5">
        <For each={props.assigned}>
          {(t) => <TaskChip task={t} direction="assigned" />}
        </For>
        <For each={props.delegated}>
          {(t) => <TaskChip task={t} direction="delegated" />}
        </For>
      </div>
    </Show>
  );
}

export function age(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

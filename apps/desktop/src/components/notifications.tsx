import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Bell as BellIcon } from "lucide-solid";

import { Avatar } from "~/components/avatar";
import { BriefCard } from "~/components/brief-card";
import { age, StateDot } from "~/components/task-state";
import { actions, inputRequiredTasks, pendingBriefs, state } from "~/lib/store";
import type { Task } from "~/lib/types";

/**
 * The bell — what needs you, without hunting the sidebar.
 *
 * Two kinds of "needs you", in order of urgency: tasks paused on your input
 * (A2A input-required — the org is literally waiting), then agents with
 * unread messages. The badge counts both. The icon is hand-drawn in the
 * design system's own voice (16×16, 1px stroke) because the set ships no
 * bell.
 */
export function Notifications() {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  const onDown = (e: PointerEvent) => {
    if (!root?.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDown));

  const waiting = createMemo(() =>
    state.agents
      .filter((a) => (state.unread[a.id] ?? 0) > 0)
      .sort(
        (a, b) =>
          (state.preview[b.id]?.at ?? "").localeCompare(state.preview[a.id]?.at ?? ""),
      ),
  );
  const blocked = createMemo(() => inputRequiredTasks());
  const decisions = createMemo(() => pendingBriefs());
  const total = () =>
    waiting().reduce((s, a) => s + (state.unread[a.id] ?? 0), 0) +
    blocked().length +
    decisions().length;

  const jump = (agentId: string) => {
    setOpen(false);
    actions.setRegister("chat");
    void actions.openAgent(agentId);
  };

  return (
    <div ref={root} class="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open()}
        aria-label={total() ? `Notifications — ${total()} unread` : "Notifications"}
        class="relative flex size-7 items-center justify-center rounded text-v2-icon-icon-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      >
        <BellIcon size={17} stroke-width={1.6} />
        <Show when={total() > 0}>
          <span class="absolute right-0 top-0 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-v2-background-bg-accent px-[3px] text-[9px] font-semibold leading-none text-v2-text-text-inverse">
            {total() > 99 ? "99+" : total()}
          </span>
        </Show>
      </button>

      <Show when={open()}>
        <div class="aular-pop absolute right-0 top-full z-40 mt-1.5 w-[320px] overflow-hidden rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-02 py-1 shadow-xl">
          {/* Decisions the org is waiting on — answerable with one click. */}
          <Show when={decisions().length}>
            <div class="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-v2-state-fg-warning">
              Decisions
            </div>
            <div class="flex flex-col gap-1.5 px-2 pb-1.5">
              <For each={decisions()}>
                {(b) => <BriefCard brief={b} compact />}
              </For>
            </div>
            <div class="my-1 border-t border-v2-border-border-muted" />
          </Show>

          {/* Work paused on the human comes next — the org is waiting. */}
          <Show when={blocked().length}>
            <div class="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-v2-state-fg-warning">
              Needs your input
            </div>
            <For each={blocked()}>
              {(t) => <BlockedTaskRow task={t} onDone={() => setOpen(false)} />}
            </For>
            <div class="my-1 border-t border-v2-border-border-muted" />
          </Show>

          <div class="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-v2-text-text-faint">
            Notifications
          </div>

          <Show
            when={waiting().length}
            fallback={
              <p class="px-3 pb-2.5 pt-1 text-[11.5px] text-v2-text-text-muted">
                {blocked().length || decisions().length
                  ? "No unread messages."
                  : "All caught up — nothing is waiting on you."}
              </p>
            }
          >
            <For each={waiting()}>
              {(a) => (
                <button
                  type="button"
                  onClick={() => jump(a.id)}
                  class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                >
                  <Avatar name={a.name} size={26} />
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-[12px] font-medium text-v2-text-text-base">
                      {a.name}
                    </span>
                    <span class="truncate text-[10.5px] text-v2-text-text-faint">
                      {state.preview[a.id]?.text || "New activity"}
                    </span>
                  </span>
                  <span class="flex h-[16px] min-w-[16px] shrink-0 items-center justify-center rounded-full bg-v2-background-bg-accent px-1 text-[9.5px] font-semibold text-v2-text-text-inverse">
                    {state.unread[a.id]}
                  </span>
                </button>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/** A paused task, answerable without leaving the bell. */
function BlockedTaskRow(props: { task: Task; onDone: () => void }) {
  const [answer, setAnswer] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const t = () => props.task;

  const send = async () => {
    if (!answer().trim() || busy()) return;
    setBusy(true);
    try {
      await actions.answerTask(t().id, answer().trim());
      props.onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="mx-2 mb-1.5 rounded-md border border-v2-state-border-warning bg-v2-state-bg-warning px-2.5 py-2">
      <div class="flex items-center gap-1.5">
        <StateDot state="input-required" size={11} />
        <span class="min-w-0 flex-1 truncate text-[11.5px] font-medium text-v2-text-text-base">
          {t().to_agent_name}
        </span>
        <span class="shrink-0 text-[10px] text-v2-text-text-faint">
          {age(t().state_updated_at ?? t().created_at)}
        </span>
      </div>
      <p class="pt-1 text-[11.5px] leading-relaxed text-v2-text-text-base">
        {t().state_message}
      </p>
      <p class="truncate pt-0.5 text-[10.5px] text-v2-text-text-faint" title={t().task}>
        Task: {t().task}
      </p>
      <div class="flex items-center gap-1.5 pt-1.5">
        <input
          value={answer()}
          onInput={(e) => setAnswer(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          placeholder="Answer and resume…"
          class="min-w-0 flex-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-2 py-1 text-[11.5px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus"
        />
        <button
          type="button"
          disabled={!answer().trim() || busy()}
          onClick={() => void send()}
          class="shrink-0 rounded-md bg-v2-background-bg-accent px-2 py-1 text-[11px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

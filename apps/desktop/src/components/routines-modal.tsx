import { createResource, createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Avatar } from "~/components/avatar";
import { confirmDialog } from "~/components/confirm";
import { Modal } from "~/components/modal";
import { api } from "~/lib/api";
import type { Agent, Routine } from "~/lib/types";

/**
 * Routines — ported from the prototype's RoutinesModal.
 *
 * Scheduled work for one agent. Activating a routine bridges it to a real
 * Hermes cron job: the agent runs the behavior on schedule and reports back into
 * this chat, whether or not the app is open. That's the difference between an
 * assistant you talk to and an org that runs.
 */
export function RoutinesModal(props: { agent: Agent; onClose: () => void }) {
  const agent = () => props.agent;

  const [routines, { refetch }] = createResource(
    () => agent().id,
    (id) => api.listRoutines(id).then((r) => r ?? []),
  );

  const [name, setName] = createSignal("");
  const [schedule, setSchedule] = createSignal("");
  const [behavior, setBehavior] = createSignal("");
  const [adding, setAdding] = createSignal(false);
  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [error, setError] = createSignal("");

  const canAdd = () =>
    !!name().trim() && !!schedule().trim() && !!behavior().trim() && !adding();

  const add = async () => {
    if (!canAdd()) return;
    setAdding(true);
    setError("");
    try {
      await api.createRoutine({
        agent_profile_id: agent().id,
        name: name().trim(),
        schedule_rule: schedule().trim(),
        target_behavior: behavior().trim(),
        active: true,
      });
      setName("");
      setSchedule("");
      setBehavior("");
      await refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (rt: Routine) => {
    setBusyId(rt.id);
    setError("");
    try {
      await api.updateRoutine(rt.id, { active: !rt.active });
      await refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (rt: Routine) => {
    const ok = await confirmDialog({
      title: `Delete “${rt.name}”?`,
      message:
        "This unschedules the routine and removes it. The agent stops doing this work.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusyId(rt.id);
    try {
      await api.deleteRoutine(rt.id);
      await refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal title="" width={520} onClose={props.onClose}>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <Avatar name={agent().name} size={38} />
          <div class="flex min-w-0 flex-col">
            <span class="text-[14px] font-medium text-v2-text-text-base">Routines</span>
            <span class="truncate text-[11.5px] text-v2-text-text-muted">
              Scheduled work for {agent().name}
            </span>
          </div>
        </div>

        <Show when={error()}>
          <p class="text-[11.5px] text-v2-state-fg-danger">{error()}</p>
        </Show>

        <Show
          when={(routines() ?? []).length}
          fallback={
            <p class="py-4 text-[11.5px] leading-relaxed text-v2-text-text-weak">
              No routines yet. Add one and {agent().name} will do the work on
              schedule and report back in this chat — even while the app is closed.
            </p>
          }
        >
          <ul class="flex flex-col gap-1.5">
            <For each={routines() ?? []}>
              {(rt) => (
                <li class="flex items-start gap-2 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 py-2.5">
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div class="flex items-center gap-2">
                      <span class="truncate text-[12.5px] font-medium text-v2-text-text-base">
                        {rt.name}
                      </span>
                      <span class="shrink-0 rounded-full bg-v2-background-bg-layer-03 px-2 py-0.5 font-mono text-[10px] text-v2-text-text-muted">
                        {rt.schedule_rule}
                      </span>
                    </div>
                    <p class="line-clamp-2 text-[11.5px] leading-relaxed text-v2-text-text-muted">
                      {rt.target_behavior}
                    </p>
                    <Show when={rt.last_run_at}>
                      <span class="text-[10px] text-v2-text-text-weak">
                        Last ran {new Date(rt.last_run_at!).toLocaleString()}
                      </span>
                    </Show>
                  </div>

                  <div class="flex shrink-0 items-center gap-1">
                    <Toggle
                      on={rt.active}
                      disabled={busyId() === rt.id}
                      onClick={() => void toggle(rt)}
                    />
                    <button
                      type="button"
                      aria-label="Delete routine"
                      disabled={busyId() === rt.id}
                      onClick={() => void remove(rt)}
                      class="flex size-7 items-center justify-center rounded text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-state-fg-danger disabled:opacity-50"
                    >
                      <Icon name="trash" size="small" />
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <div class="flex flex-col gap-2 border-t border-v2-border-border-muted pt-3.5">
          <span class="text-[10.5px] font-medium uppercase tracking-[0.08em] text-v2-text-text-weak">
            New routine
          </span>
          <input
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="Name — e.g. Morning briefing"
            class={field}
          />
          <input
            value={schedule()}
            onInput={(e) => setSchedule(e.currentTarget.value)}
            placeholder="Schedule — 0 8 * * *, every 2h, 30m"
            class={`${field} font-mono`}
          />
          <textarea
            rows={2}
            value={behavior()}
            onInput={(e) => setBehavior(e.currentTarget.value)}
            placeholder="What should they do? e.g. Review open PRs and post a summary."
            class={`${field} resize-none`}
          />
          <button
            type="button"
            onClick={add}
            disabled={!canAdd()}
            class="self-end rounded-md bg-v2-background-bg-accent px-3 py-1.5 text-[12px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
          >
            {adding() ? "Scheduling…" : "Add routine"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const field =
  "w-full rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2.5 py-1.5 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-weak focus:border-v2-border-border-focus";

function Toggle(props: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      aria-label={props.on ? "Pause routine" : "Activate routine"}
      disabled={props.disabled}
      onClick={props.onClick}
      class="relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-50"
      classList={{
        "border-v2-border-border-focus bg-v2-background-bg-accent": props.on,
        "border-v2-border-border-muted bg-v2-background-bg-layer-03": !props.on,
      }}
    >
      <span
        class="absolute top-[2px] size-3.5 rounded-full bg-[#ffffff] shadow-sm transition-all"
        classList={{ "left-[18px]": props.on, "left-[2px]": !props.on }}
      />
    </button>
  );
}

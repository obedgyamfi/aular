import { createMemo, createResource, For, Show } from "solid-js";
import { MessageSquare, Pencil, X } from "lucide-solid";

import { Avatar } from "~/components/avatar";
import { StateDot, STATE_META, age } from "~/components/task-state";
import { api } from "~/lib/api";
import type { ScheduleEntry } from "~/lib/schedules";
import { actions, agentWorking, state } from "~/lib/store";
import { TERMINAL_TASK_STATES } from "~/lib/types";
import type { Task, ToolCall } from "~/lib/types";

/**
 * The canvas's node inspector — click an agent, see its work.
 *
 * n8n's executions panel, in AULAR terms: the run history is the agent's
 * tasks off the A2A spine (live first, then finished, with durations), the
 * activity feed is its recent tool calls, and its schedules ride along from
 * the same join the trigger nodes draw. All real, all already streaming.
 */
export function NodeInspector(props: {
  agentId: string;
  triggers: ScheduleEntry[];
  onClose: () => void;
}) {
  const agent = () => state.agents.find((a) => a.id === props.agentId);
  const working = () => agentWorking(props.agentId);

  // ── run history: every task ever assigned to this agent ──────────────────
  const runs = createMemo(() => {
    const mine = Object.values(state.tasks).filter(
      (t) => t.to_agent_profile_id === props.agentId,
    );
    const touched = (t: Task) => t.state_updated_at ?? t.created_at;
    return {
      live: mine
        .filter((t) => !TERMINAL_TASK_STATES.has(t.state))
        .sort((a, b) => touched(b).localeCompare(touched(a))),
      done: mine
        .filter((t) => TERMINAL_TASK_STATES.has(t.state))
        .sort((a, b) => touched(b).localeCompare(touched(a)))
        .slice(0, 10),
    };
  });

  // ── recent tool activity, from the agent's thread ────────────────────────
  const [tools] = createResource(
    () => props.agentId,
    async (id) => {
      let convoId = state.conversationOf[id];
      if (!convoId) {
        const convos = (await api.listConversations(id).catch(() => null)) ?? [];
        convoId = convos[0]?.id;
      }
      if (!convoId) return [] as ToolCall[];
      const calls = (await api.listToolCalls(convoId).catch(() => null)) ?? [];
      return calls.slice(0, 8);
    },
  );

  return (
    <Show when={agent()}>
      {(a) => (
        <>
          {/* header */}
          <div class="flex items-center gap-2.5 pb-2.5">
            <Avatar name={a().name} size={34} />
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] font-bold text-[var(--text)]">{a().name}</div>
              <div class="flex items-center gap-1.5 text-[10.5px] text-[var(--muted)]">
                <span
                  class="size-1.5 rounded-full"
                  style={{ background: working() ? "var(--green)" : "var(--faint)" }}
                />
                {working() ? "Working" : "Idle"}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close inspector"
              onClick={props.onClose}
              class="grid size-7 flex-none place-items-center rounded-md text-[var(--faint)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
            >
              <X size={15} stroke-width={2} />
            </button>
          </div>

          <div class="flex gap-1.5 pb-3">
            <button
              type="button"
              onClick={() => actions.openChat(a().id)}
              class="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r2)] bg-[var(--accent)] px-2 py-1.5 text-[11.5px] font-[650] text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              <MessageSquare size={13} stroke-width={2} />
              Chat
            </button>
            <button
              type="button"
              onClick={() => actions.openProfile(a().id)}
              class="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1.5 text-[11.5px] font-[650] text-[var(--text-2)] transition-colors hover:bg-[var(--element-hover)]"
            >
              <Pencil size={12} stroke-width={2} />
              Configure
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto pb-2">
            <Show when={runs().live.length}>
              <RailLabel>Running now</RailLabel>
              <For each={runs().live}>{(t) => <RunRow task={t} />}</For>
            </Show>

            <RailLabel>Run history</RailLabel>
            <For
              each={runs().done}
              fallback={
                <p class="py-3 text-[11px] leading-snug text-[var(--faint)]">
                  No finished runs yet. Dispatches land here with their outcome
                  and how long they took.
                </p>
              }
            >
              {(t) => <RunRow task={t} />}
            </For>

            <Show when={props.triggers.length}>
              <RailLabel>Schedules</RailLabel>
              <For each={props.triggers}>
                {(e) => (
                  <div class="flex items-center gap-2 border-b border-[var(--line)] py-2">
                    <span
                      class="size-1.5 flex-none rounded-full"
                      style={{ background: e.active ? "var(--green)" : "var(--faint)" }}
                    />
                    <span class="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[var(--text)]">
                      {e.name}
                    </span>
                    <span class="flex-none text-[10px] text-[var(--muted)]">{e.cadence}</span>
                  </div>
                )}
              </For>
            </Show>

            <Show when={(tools() ?? []).length}>
              <RailLabel>Recent tool activity</RailLabel>
              <For each={tools() ?? []}>
                {(tc) => (
                  <div class="flex items-center gap-2 border-b border-[var(--line)] py-[7px]">
                    <span
                      class="size-1.5 flex-none rounded-full"
                      classList={{ "aular-breathe": tc.status === "running" }}
                      style={{
                        background: tc.status === "settled" ? "var(--green)" : "var(--amber)",
                      }}
                    />
                    <span class="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[var(--text-2)]">
                      {tc.tool_name}
                    </span>
                    <span class="flex-none text-[9.5px] tabular-nums text-[var(--faint)]">
                      {age(tc.created_at)}
                    </span>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </>
      )}
    </Show>
  );
}

function RailLabel(props: { children: any }) {
  return (
    <div class="pb-1.5 pt-3.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--faint)] first:pt-0">
      {props.children}
    </div>
  );
}

/** One run: state, what it was, who sent it, and how long it took. */
function RunRow(props: { task: Task }) {
  const t = () => props.task;
  const meta = () => STATE_META[t().state];

  const duration = () => {
    if (!TERMINAL_TASK_STATES.has(t().state) || !t().state_updated_at) return null;
    const ms = Date.parse(t().state_updated_at!) - Date.parse(t().created_at);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
  };

  return (
    <div class="border-b border-[var(--line)] py-2">
      <div class="flex items-center gap-1.5">
        <StateDot state={t().state} />
        <span class="text-[10px] font-semibold" style={{ color: meta().color }}>
          {meta().label}
        </span>
        <span class="min-w-0 flex-1" />
        <span class="flex-none text-[9.5px] tabular-nums text-[var(--faint)]">
          {duration() ? `${duration()} · ` : ""}
          {age(t().state_updated_at ?? t().created_at)}
        </span>
      </div>
      <p class="mt-1 line-clamp-2 text-[11.5px] leading-snug text-[var(--text)]" title={t().task}>
        {t().task}
      </p>
      <p class="mt-0.5 text-[10px] text-[var(--muted)]">from {t().from_agent_name}</p>
    </div>
  );
}

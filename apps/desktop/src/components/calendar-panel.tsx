import { createMemo, createResource, For, Show } from "solid-js";

import { Avatar } from "~/components/avatar";
import { api } from "~/lib/api";
import { state } from "~/lib/store";
import type { Agent, Routine, ScheduledJob } from "~/lib/types";

/**
 * The Calendar register — ported from the prototype's CalendarPanel.
 *
 * A week of everything scheduled: agents' routines (real Hermes cron jobs) laid
 * out on the days they'll fire, plus interval schedules ("every 2h") in their
 * own lane. Read-only — schedules are set per agent (chat header → Routines), or
 * by simply asking an agent to remember something, which is why jobs an agent
 * created for itself show up here too.
 */
interface Occurrence {
  at: Date;
  name: string;
  agent?: Agent;
}

interface Recurring {
  key: string;
  name: string;
  label: string;
  agent?: Agent;
}

export function CalendarPanel() {
  // Routines are per-agent, so the week needs one call per agent plus the
  // gateway's own job list (which includes reminders agents set themselves).
  const [schedule] = createResource(
    () => state.agents.map((a) => a.id).join(","),
    async () => {
      const [lists, jobs] = await Promise.all([
        Promise.all(state.agents.map((a) => api.listRoutines(a.id).catch(() => null))),
        api.listScheduledJobs().catch(() => []),
      ]);
      return {
        routines: lists.flatMap((l) => l ?? []) as Routine[],
        jobs: (jobs ?? []) as ScheduledJob[],
      };
    },
  );

  const agentById = createMemo(() => new Map(state.agents.map((a) => [a.id, a])));

  const week = createMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const days: { date: Date; items: Occurrence[] }[] = Array.from(
      { length: 7 },
      (_, i) => ({ date: new Date(start.getTime() + i * 86400e3), items: [] }),
    );
    const recurring: Recurring[] = [];

    const push = (at: Date, name: string, agent?: Agent) => {
      const i = Math.floor((at.getTime() - start.getTime()) / 86400e3);
      if (i >= 0 && i < 7) days[i]!.items.push({ at, name, agent });
    };

    const data = schedule();
    if (!data) return { days, recurring };

    // AULAR routines. Each also exists as a Hermes job (cron_job_id), so track
    // those ids and skip them below rather than listing the same work twice.
    const routineJobIds = new Set<string>();
    for (const r of data.routines) {
      if (r.cron_job_id) routineJobIds.add(r.cron_job_id);
      if (!r.active) continue;

      const agent = agentById().get(r.agent_profile_id);
      const label = intervalLabel(r.schedule_rule);
      if (label) {
        recurring.push({ key: `r-${r.id}`, name: r.name, agent, label });
        continue;
      }
      for (const at of cronOccurrences(r.schedule_rule, start, 7)) {
        push(at, r.name, agent);
      }
    }

    // Everything else Hermes will deliver into a chat — including the reminders
    // an agent scheduled for itself with its cron tool.
    for (const j of data.jobs) {
      if (!j.enabled || routineJobIds.has(j.id)) continue;
      const agent = agentById().get(state.agentOf[j.conversation_id] ?? "");

      if (j.kind === "cron" && j.expr) {
        for (const at of cronOccurrences(j.expr, start, 7)) push(at, j.name, agent);
      } else if (j.kind === "once" && (j.run_at || j.next_run_at)) {
        const at = new Date(j.run_at || j.next_run_at!);
        if (!Number.isNaN(at.getTime()) && at >= now) push(at, j.name, agent);
      } else if (j.display || j.next_run_at) {
        recurring.push({
          key: `j-${j.id}`,
          name: j.name,
          agent,
          label: j.display || "recurring",
        });
      }
    }

    for (const d of days) d.items.sort((a, b) => a.at.getTime() - b.at.getTime());
    return { days, recurring };
  });

  const today = new Date().toDateString();
  const empty = () =>
    !schedule.loading &&
    !week().recurring.length &&
    week().days.every((d) => !d.items.length);

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-v2-background-bg-base">
      <div class="flex h-11 shrink-0 items-center gap-3 border-b border-v2-border-border-muted px-4">
        <span class="text-[13px] font-medium text-v2-text-text-base">Calendar</span>
        <span class="text-[11px] text-v2-text-text-faint">
          next 7 days · routines and reminders
        </span>
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <Show
          when={!schedule.loading}
          fallback={
            <p class="flex h-full items-center justify-center text-[12px] text-v2-text-text-faint">
              Reading schedules…
            </p>
          }
        >
          <Show
            when={!empty()}
            fallback={
              <div class="flex h-full flex-col items-center justify-center gap-1.5 px-8 text-center">
                <p class="text-[13px] font-medium text-v2-text-text-base">
                  Nothing scheduled yet
                </p>
                <p class="max-w-[420px] text-[11.5px] leading-relaxed text-v2-text-text-muted">
                  Ask any agent to set up a routine (“brief me every morning at
                  8”), or open its Routines panel. Real cron jobs appear here on
                  the days they fire.
                </p>
              </div>
            }
          >
            <div class="flex min-w-max gap-px bg-v2-border-border-muted p-px">
              <For each={week().days}>
                {(d) => {
                  const isToday = () => d.date.toDateString() === today;
                  return (
                    <div class="flex min-h-[calc(100vh-160px)] w-[200px] shrink-0 flex-col bg-v2-background-bg-base">
                      <div
                        class="border-b border-v2-border-border-muted px-3 py-2 text-[11.5px] font-medium"
                        classList={{
                          "text-v2-text-text-accent": isToday(),
                          "text-v2-text-text-muted": !isToday(),
                        }}
                      >
                        {isToday()
                          ? "Today"
                          : d.date.toLocaleDateString([], { weekday: "long" })}
                        <span class="pl-1.5 font-normal text-v2-text-text-faint">
                          {d.date.toLocaleDateString([], {
                            month: "numeric",
                            day: "numeric",
                          })}
                        </span>
                      </div>

                      <div class="flex flex-col gap-1.5 p-2">
                        <For each={d.items}>
                          {(o) => (
                            <Card
                              lead={o.at.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              name={o.name}
                              agent={o.agent}
                            />
                          )}
                        </For>
                        <Show when={!d.items.length}>
                          <span class="px-1 pt-1 text-[11px] text-v2-text-text-faint">
                            —
                          </span>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>

              <Show when={week().recurring.length}>
                <div class="flex min-h-[calc(100vh-160px)] w-[220px] shrink-0 flex-col bg-v2-background-bg-base">
                  <div class="border-b border-v2-border-border-muted px-3 py-2 text-[11.5px] font-medium text-v2-text-text-muted">
                    Recurring
                    <span class="pl-1.5 font-normal text-v2-text-text-faint">
                      intervals
                    </span>
                  </div>
                  <div class="flex flex-col gap-1.5 p-2">
                    <For each={week().recurring}>
                      {(r) => <Card lead={r.label} name={r.name} agent={r.agent} muted />}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}

function Card(props: {
  lead: string;
  name: string;
  agent?: Agent;
  muted?: boolean;
}) {
  return (
    <div
      class="rounded-md border-l-2 bg-v2-background-bg-layer-01 px-2.5 py-2"
      classList={{
        "border-v2-border-border-focus": !props.muted,
        "border-v2-border-border-base": !!props.muted,
      }}
    >
      <div
        class="text-[10.5px] font-medium tabular-nums"
        classList={{
          "text-v2-text-text-accent": !props.muted,
          "text-v2-text-text-muted": !!props.muted,
        }}
      >
        {props.lead}
      </div>
      <div class="pt-0.5 text-[12px] font-medium leading-4 text-v2-text-text-base">
        {props.name}
      </div>
      <Show when={props.agent}>
        {(a) => (
          <div class="flex items-center gap-1.5 pt-1.5">
            <Avatar name={a().name} size={16} />
            <span class="truncate text-[11px] text-v2-text-text-muted">
              {a().name}
            </span>
          </div>
        )}
      </Show>
    </div>
  );
}

// ── cron ────────────────────────────────────────────────────────────────────
//
// A 5-field matcher (min hour dom mon dow), enough to place a job on a day. The
// gateway owns the real schedule; this is a reading of it.

function fieldMatches(expr: string, value: number, dowSunday = false): boolean {
  for (const part of expr.split(",")) {
    if (part === "*") return true;

    const step = part.match(/^\*\/(\d+)$/);
    if (step) {
      if (value % parseInt(step[1]!, 10) === 0) return true;
      continue;
    }

    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const lo = parseInt(range[1]!, 10);
      const hi = parseInt(range[2]!, 10);
      if (value >= lo && value <= hi) return true;
      continue;
    }

    const n = parseInt(part, 10);
    // Cron lets Sunday be 0 or 7.
    if (!Number.isNaN(n) && (n === value || (dowSunday && n === 7 && value === 0))) {
      return true;
    }
  }
  return false;
}

/**
 * Every firing of a cron rule inside [from, from + days).
 *
 * Walks minute by minute but skips whole days and hours that can't match, so a
 * "0 8 * * *" rule costs seven checks, not ten thousand.
 */
function cronOccurrences(rule: string, from: Date, days: number): Date[] {
  const f = rule.trim().split(/\s+/);
  if (f.length !== 5) return [];

  const out: Date[] = [];
  const end = new Date(from.getTime() + days * 86400e3);
  const cur = new Date(from);
  cur.setSeconds(0, 0);

  while (cur < end && out.length < 200) {
    if (
      !fieldMatches(f[2]!, cur.getDate()) ||
      !fieldMatches(f[3]!, cur.getMonth() + 1) ||
      !fieldMatches(f[4]!, cur.getDay(), true)
    ) {
      cur.setDate(cur.getDate() + 1);
      cur.setHours(0, 0, 0, 0);
      continue;
    }
    if (!fieldMatches(f[1]!, cur.getHours())) {
      cur.setHours(cur.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (fieldMatches(f[0]!, cur.getMinutes())) out.push(new Date(cur));
    cur.setMinutes(cur.getMinutes() + 1);
  }
  return out;
}

/** "every 2h" / "30m" / "1d" → a lane label. Null if it isn't an interval. */
function intervalLabel(rule: string): string | null {
  const m = rule
    .trim()
    .match(/^(?:every\s+)?(\d+)\s*(m|min|minutes?|h|hours?|d|days?)$/i);
  if (!m) return null;
  return `every ${m[1]}${m[2]![0]!.toLowerCase()}`;
}

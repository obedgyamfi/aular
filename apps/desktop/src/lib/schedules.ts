import { api } from "./api";
import { state } from "./store";
import type { Routine, ScheduledJob } from "./types";

/**
 * The org's schedule, joined: each agent's routines matched to their Hermes
 * cron jobs (which carry the next-run time), plus any jobs agents scheduled
 * for themselves. One load, two readers — the Schedules list and the flow
 * canvas's trigger nodes must never disagree.
 */
export interface ScheduleEntry {
  key: string;
  name: string;
  /** The agent who runs it — resolved; null when the owner is unknown. */
  agentId: string | null;
  ownerName: string;
  cadence: string;
  next: Date | null;
  active: boolean;
  routine?: Routine;
}

export async function loadScheduleEntries(): Promise<ScheduleEntry[]> {
  const [perAgent, jobs] = await Promise.all([
    Promise.all(
      state.agents.map((a) =>
        api
          .listRoutines(a.id)
          .then((r) => (r ?? []).map((x) => ({ agent: a, routine: x })))
          .catch(() => []),
      ),
    ),
    api.listScheduledJobs().catch(() => [] as ScheduledJob[]),
  ]);

  const routines = perAgent.flat();
  const jobById = new Map((jobs ?? []).map((j) => [j.id, j]));
  const claimed = new Set<string>();

  const out: ScheduleEntry[] = routines.map(({ agent, routine }) => {
    const job = routine.cron_job_id ? jobById.get(routine.cron_job_id) : undefined;
    if (job) claimed.add(job.id);
    return {
      key: `r:${routine.id}`,
      name: routine.name,
      agentId: agent.id,
      ownerName: agent.name,
      cadence: routine.schedule_rule,
      next: job?.next_run_at ? new Date(job.next_run_at) : null,
      active: routine.active,
      routine,
    };
  });

  for (const j of jobs ?? []) {
    if (claimed.has(j.id)) continue;
    const agentId = state.agentOf[j.conversation_id] ?? null;
    const owner = state.agents.find((a) => a.id === agentId);
    out.push({
      key: `j:${j.id}`,
      name: j.name,
      agentId,
      ownerName: owner?.name ?? "Agent",
      cadence: j.display || j.expr || (j.kind === "once" ? "one-time" : j.kind),
      next: j.next_run_at ? new Date(j.next_run_at) : j.run_at ? new Date(j.run_at) : null,
      active: j.enabled,
    });
  }
  return out;
}

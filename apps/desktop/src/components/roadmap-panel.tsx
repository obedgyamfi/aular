import { createMemo, For, Show } from "solid-js";

import { Avatar, avatarColor } from "~/components/avatar";
import { activeProject, agentById, atHome, state } from "~/lib/store";
import type { PhaseState, Project, ProjectPhase } from "~/lib/types";

/**
 * The Roadmap: phases as gantt bars on a month axis, with a today line.
 *
 * The plan, and only the plan. There used to be a Kanban tab here drawing the
 * live task spine, which is exactly what `work-board.tsx` draws — the same
 * board in two places, free to disagree. The split now is intent: a roadmap is
 * what the org means to do, the work board is what it's actually doing.
 */

export function RoadmapPanel() {
  const quarter = () => `Q${Math.floor(new Date().getMonth() / 3) + 1}`;

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex shrink-0 items-center gap-4 border-b border-[var(--line)] px-[22px] pt-[13px]">
        <div class="min-w-0 flex-none">
          <div class="text-[18px] font-semibold text-[var(--text)]" style={{ "font-family": "var(--serif)" }}>
            Roadmap
          </div>
          <div class="mb-[11px] text-[11.5px] text-[var(--muted)]">
            {quarter()} · {atHome() ? "across the organization" : activeProject().name}
          </div>
        </div>

        <span class="flex-1" />

        <div class="flex items-center gap-3.5 self-end pb-[9px] text-[11px] text-[var(--muted)]">
          <LegendSwatch color="var(--green)" label="Done" />
          <LegendSwatch color="var(--accent)" label="In progress" />
          <LegendSwatch color="var(--element-active)" label="Queued" />
          <LegendSwatch color="var(--red)" label="Blocked" />
        </div>
      </header>

      <Timeline />
    </div>
  );
}


function LegendSwatch(props: { color: string; label: string }) {
  return (
    <span class="flex items-center gap-1.5">
      <span class="size-[11px] rounded-[3px]" style={{ background: props.color }} />
      {props.label}
    </span>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────

const BAR_COLOR: Record<PhaseState, { bg: string; fg: string }> = {
  done: { bg: "var(--green)", fg: "var(--on-accent)" },
  active: { bg: "var(--accent)", fg: "var(--on-accent)" },
  queued: { bg: "var(--element-active)", fg: "var(--text-2)" },
  blocked: { bg: "var(--red)", fg: "var(--on-accent)" },
};

interface Lane {
  project: Project;
  color: string;
  bars: ProjectPhase[];
}

const day = (iso: string) => new Date(iso + "T00:00:00");

function Timeline() {
  /**
   * Roadmap lanes: projects with phases, or a due date to draw as one bar.
   *
   * At home that's every project — the company's plan. Inside a project it's
   * that project alone, since the rail already said which one you meant.
   */
  const lanes = createMemo<Lane[]>(() =>
    state.projects
      .filter((p) => !p.allAgents && (atHome() || p.id === state.activeProjectId))
      .filter((p) => p.phases?.length || p.due)
      .map((p) => ({
        project: p,
        color: avatarColor(p.name),
        bars: p.phases?.length
          ? p.phases
          : [
              {
                id: p.id,
                name: p.name,
                ownerId: p.leadId,
                start: new Date(Date.now() - 12096e5).toISOString().slice(0, 10),
                end: p.due!,
                state:
                  p.status === "done"
                    ? ("done" as const)
                    : p.status === "active"
                      ? ("active" as const)
                      : ("queued" as const),
              },
            ],
      })),
  );

  /** The axis: whole months spanning every bar. */
  const window_ = createMemo(() => {
    const all = lanes().flatMap((l) => l.bars);
    if (!all.length) return null;
    const min = new Date(Math.min(...all.map((b) => day(b.start).getTime())));
    const max = new Date(Math.max(...all.map((b) => day(b.end).getTime())));
    const start = new Date(min.getFullYear(), min.getMonth(), 1);
    const end = new Date(max.getFullYear(), max.getMonth() + 1, 0, 23, 59, 59);

    const months: { label: string; days: number }[] = [];
    const d = new Date(start);
    while (d <= end) {
      months.push({
        label: d.toLocaleDateString([], { month: "short" }),
        days: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
      });
      d.setMonth(d.getMonth() + 1);
    }
    return { start, end, months };
  });

  const pct = (t: Date) => {
    const w = window_()!;
    return Math.max(
      0,
      Math.min(100, ((t.getTime() - w.start.getTime()) / (w.end.getTime() - w.start.getTime())) * 100),
    );
  };
  const todayPct = () => (window_() ? pct(new Date()) : 0);

  return (
    <div class="min-h-0 flex-1 overflow-auto p-[22px]">
      <Show
        when={window_()}
        fallback={
          <p class="py-16 text-center text-[12px] text-[var(--muted)]">
            No dated projects yet — give a project a target date (or phases) and
            it appears on the timeline.
          </p>
        }
      >
        <div
          class="mx-auto min-w-[940px] max-w-[1240px] overflow-hidden rounded-[var(--r4)] border border-[var(--line)] bg-[var(--surface)]"
          style={{ "box-shadow": "var(--shadow-1)" }}
        >
          {/* axis */}
          <div class="grid grid-cols-[236px_1fr] border-b-2 border-[var(--line)] bg-[var(--sidebar)]">
            <div class="border-r border-[var(--line)] px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--faint)]">
              Project / phase
            </div>
            <div class="relative flex h-[38px]">
              <For each={window_()!.months}>
                {(m) => (
                  <div
                    class="flex items-center border-l border-[var(--line)] pl-2.5 text-[11px] font-[650] text-[var(--text-2)]"
                    style={{ flex: String(m.days) }}
                  >
                    {m.label}
                  </div>
                )}
              </For>
              <TodayLine left={todayPct()} opacity={1} />
            </div>
          </div>

          <For each={lanes()}>
            {(lane) => (
              <>
                {/* lane header */}
                <div class="grid grid-cols-[236px_1fr] border-b border-[var(--line)] bg-[var(--element)]">
                  <div class="flex items-center gap-[9px] border-r border-[var(--line)] px-3.5 py-[9px]">
                    <span class="size-[9px] flex-none rounded-[2px]" style={{ background: lane.color }} />
                    <span class="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[var(--text)]">
                      {lane.project.name}
                    </span>
                    <span class="text-[10.5px] text-[var(--muted)]">{lane.project.progress}%</span>
                  </div>
                  <div class="relative">
                    <TodayLine left={todayPct()} opacity={0.5} />
                  </div>
                </div>

                {/* bars */}
                <For each={lane.bars}>
                  {(bar) => {
                    const owner = () => agentById(bar.ownerId);
                    const left = () => pct(day(bar.start));
                    const width = () => Math.max(1.5, pct(day(bar.end)) - left());
                    return (
                      <div class="grid grid-cols-[236px_1fr] border-b border-[var(--line)] last:border-b-0">
                        <div class="flex items-center gap-[9px] border-r border-[var(--line)] py-2 pl-[26px] pr-3.5">
                          <Show
                            when={owner()}
                            fallback={<span class="size-[22px] flex-none rounded-md bg-[var(--element)]" />}
                          >
                            <Avatar name={owner()!.name} size={22} />
                          </Show>
                          <span class="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text)]">
                            {bar.name}
                          </span>
                        </div>
                        <div
                          class="relative h-10"
                          style={{
                            background:
                              "repeating-linear-gradient(90deg, transparent 0, transparent calc(100% / 12 - 1px), var(--line) calc(100% / 12 - 1px), var(--line) calc(100% / 12))",
                          }}
                        >
                          <TodayLine left={todayPct()} opacity={0.35} />
                          <div
                            title={`${bar.name} — ${bar.state}`}
                            class="absolute top-2 flex h-6 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-[9px] text-[10.5px] font-[650]"
                            style={{
                              left: `${left()}%`,
                              width: `${width()}%`,
                              background: BAR_COLOR[bar.state].bg,
                              color: BAR_COLOR[bar.state].fg,
                              "box-shadow": "var(--shadow-1)",
                            }}
                          >
                            {bar.name}
                          </div>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </>
            )}
          </For>
        </div>

        <div class="mx-auto mt-3.5 flex max-w-[1240px] items-center gap-[7px] text-[11px] text-[var(--faint)]">
          <span class="inline-block h-0.5 w-3.5 bg-[var(--accent)]" />
          Vertical line marks today.
        </div>
      </Show>
    </div>
  );
}

function TodayLine(props: { left: number; opacity: number }) {
  return (
    <div
      class="absolute bottom-0 top-0 w-0.5 bg-[var(--accent)]"
      style={{ left: `${props.left}%`, opacity: String(props.opacity) }}
    />
  );
}


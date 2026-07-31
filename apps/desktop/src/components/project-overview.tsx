import { createMemo, createSignal, For, Show } from "solid-js";
import { Check, Pencil, Sparkles, X } from "lucide-solid";

import { Avatar } from "~/components/avatar";
import type { Proposal } from "~/lib/intent";
import { applyProposal } from "~/lib/proposals";
import { actions, agentById, projectTeam, state } from "~/lib/store";
import { TERMINAL_TASK_STATES } from "~/lib/types";
import type { PhaseState, Project, ProjectPhase, ProjectStatus, Task } from "~/lib/types";

/**
 * A project in full: objective, roster, roadmap, open tasks, staffing.
 *
 * One project — the one the rail is on. The side list that used to sit here was
 * a second project switcher facing the first, and the rail won: a column
 * enumerating what the tiles already show is furniture, not navigation.
 *
 * The exception is a project AULAR has drafted but you haven't applied. That
 * has no tile to be "on" yet, so it takes the whole surface as a ghost until
 * you Apply or Discard it.
 */
export function ProjectOverview() {
  const draft = (): Extract<Proposal, { kind: "project" }> | null =>
    state.draft?.kind === "project" ? state.draft : null;

  const selected = createMemo(
    () => state.projects.find((p) => p.id === state.activeProjectId) ?? state.projects[0],
  );

  const applyDraft = async () => {
    const d = draft();
    if (!d) return;
    await applyProposal(d); // createProject → selects it
    actions.clearDraft();
  };

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <Show
        when={draft()}
        fallback={
          <Show
            when={selected() && !selected()!.allAgents}
            fallback={
              <Empty>
                This is the whole organization, not a project. Pick a project on
                the rail to see its team and roadmap.
              </Empty>
            }
          >
            <ProjectDetail project={selected()!} />
          </Show>
        }
      >
        {(d) => (
          <DraftDetail draft={d()} onApply={applyDraft} onDiscard={() => actions.clearDraft()} />
        )}
      </Show>
    </div>
  );
}

// ── status → the design's tag colors ───────────────────────────────────────
const STATUS: Record<ProjectStatus, { label: string; bg: string; fg: string }> = {
  active: { label: "Active", bg: "var(--green-soft)", fg: "var(--green)" },
  planning: { label: "Planning", bg: "var(--blue-soft)", fg: "var(--blue)" },
  paused: { label: "Paused", bg: "var(--amber-soft)", fg: "var(--amber)" },
  done: { label: "Done", bg: "var(--element)", fg: "var(--muted)" },
};

function StatusTag(props: { status: ProjectStatus }) {
  return (
    <span
      class="rounded-[var(--pill)] px-2 py-[2px] text-[10px] font-semibold"
      style={{ background: STATUS[props.status].bg, color: STATUS[props.status].fg }}
    >
      {STATUS[props.status].label}
    </span>
  );
}

function prettyDue(due: string | null): string {
  if (!due) return "no due date";
  const d = new Date(due + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "no due date";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}


/** One project in the side list: name, status, a thread of progress + team. */

/** A drafted project in the list — the ghost from the rail. */

// ── the detail pane ─────────────────────────────────────────────────────────

function ProjectDetail(props: { project: Project }) {
  const p = () => props.project;
  const lead = () => agentById(p().leadId);
  const team = createMemo(() => projectTeam(p()));
  const staff = () => state.agents.filter((a) => a.role !== "system");

  // The default "everyone" project is a fixed view, not an editable project.
  const canEdit = () => !p().allAgents;
  const [renaming, setRenaming] = createSignal(false);
  const [nameDraft, setNameDraft] = createSignal("");
  const startRename = () => {
    setNameDraft(p().name);
    setRenaming(true);
  };
  const commitRename = () => {
    if (!renaming()) return;
    setRenaming(false);
    const next = nameDraft().trim();
    if (next && next !== p().name) actions.editProject(p().id, { name: next });
  };

  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="px-8 py-6">
        <div class="flex items-center gap-2.5">
          <Show
            when={renaming()}
            fallback={
              <h1
                class="text-[22px] font-semibold leading-tight text-[var(--text)]"
                style={{ "font-family": "var(--serif)" }}
              >
                {p().name}
              </h1>
            }
          >
            <input
              ref={(el) => queueMicrotask(() => (el.focus(), el.select()))}
              value={nameDraft()}
              onInput={(e) => setNameDraft(e.currentTarget.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              class="max-w-[440px] rounded-[var(--r2)] border border-[var(--accent)] bg-[var(--surface)] px-2 py-0.5 text-[22px] font-semibold leading-tight text-[var(--text)] outline-none"
              style={{ "font-family": "var(--serif)" }}
            />
          </Show>
          <StatusTag status={p().status} />
          <Show when={canEdit()}>
            <button
              type="button"
              // Don't steal focus from the input — otherwise its blur commits
              // first and this click would re-open the editor.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (renaming() ? commitRename() : startRename())}
              title={renaming() ? "Save name" : "Rename project"}
              aria-label={renaming() ? "Save name" : "Rename project"}
              class="rounded-[var(--r2)] p-1 text-[var(--faint)] transition-colors hover:bg-[var(--element)] hover:text-[var(--text)]"
            >
              {renaming() ? <Check size={15} stroke-width={2.2} /> : <Pencil size={14} stroke-width={2} />}
            </button>
          </Show>
        </div>
        <div class="mt-1.5 text-[12px] text-[var(--muted)]">
          Lead {lead()?.name ?? "unassigned"} · due {prettyDue(p().due)} · {p().progress}% complete
        </div>

        <div class="mt-7 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_296px]">
          {/* main column */}
          <div class="flex min-w-0 flex-col gap-8">
            <section>
              <SectionHead>Objective</SectionHead>
              <p class="max-w-[640px] text-[13.5px] leading-relaxed text-[var(--text)]">
                {p().objective || "No objective yet."}
              </p>
            </section>

            <section>
              <SectionHead>Roadmap</SectionHead>
              <RoadmapStrip phases={p().phases ?? []} />
            </section>

            <section>
              <SectionHead>Staffed team · {team().length}</SectionHead>
              <Show
                when={team().length}
                fallback={<p class="text-[12.5px] text-[var(--muted)]">No agents staffed yet.</p>}
              >
                <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  <For each={team()}>
                    {(a) => (
                      <div
                        class="flex items-center gap-3 rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)] p-3"
                        style={{ "box-shadow": "var(--shadow-1)" }}
                      >
                        <Avatar name={a.name} size={34} />
                        <div class="min-w-0">
                          <div class="flex items-center gap-1.5">
                            <span class="truncate text-[13px] font-[650] text-[var(--text)]">{a.name}</span>
                            <Show when={a.id === p().leadId}>
                              <span class="rounded-[4px] bg-[var(--accent)] px-1 py-px text-[8.5px] font-bold uppercase tracking-wide text-[var(--on-accent)]">
                                Lead
                              </span>
                            </Show>
                          </div>
                          <span class="block truncate text-[11px] text-[var(--muted)]">{prettyRole(a.role)}</span>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section>
              <SectionHead>Open tasks</SectionHead>
              <OpenTasks project={p()} />
            </section>

            <Show when={!p().allAgents}>
              <section>
                <SectionHead>Assign agents</SectionHead>
                <div class="flex flex-wrap gap-2">
                  <For
                    each={staff()}
                    fallback={
                      <p class="text-[12px] text-[var(--faint)]">Hire agents to staff this project.</p>
                    }
                  >
                    {(a) => {
                      const on = () => p().team.includes(a.id);
                      const isLead = () => a.id === p().leadId;
                      return (
                        <button
                          type="button"
                          disabled={isLead()}
                          onClick={() => actions.toggleProjectMember(p().id, a.id)}
                          aria-pressed={on()}
                          class="flex items-center gap-1.5 rounded-[var(--pill)] border px-2.5 py-[5px] text-[12px] font-semibold transition-colors disabled:opacity-60"
                          style={{
                            "border-color": on() ? "var(--accent)" : "var(--line)",
                            background: on() ? "var(--accent-soft)" : "var(--surface)",
                            color: on() ? "var(--accent-text)" : "var(--muted)",
                          }}
                        >
                          <Avatar name={a.name} size={18} />
                          {a.name}
                          <Show when={isLead()}>
                            <span class="text-[9px] font-bold uppercase">lead</span>
                          </Show>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </section>
            </Show>
          </div>

          {/* overview aside */}
          <aside
            class="h-fit rounded-[var(--r4)] border border-[var(--line)] bg-[var(--surface)] p-4"
            style={{ "box-shadow": "var(--shadow-1)" }}
          >
            <SectionHead>Overview</SectionHead>
            <dl class="flex flex-col gap-3.5 text-[12.5px]">
              <Fact label="Lead" value={lead()?.name ?? "Unassigned"} />
              <Fact label="Status" value={STATUS[p().status].label} />
              <Fact label="Target date" value={prettyDue(p().due)} />
              <Fact label="Team size" value={String(team().length)} />
              <div>
                <dt class="mb-1.5 text-[11px] font-medium text-[var(--muted)]">Progress</dt>
                <div class="flex items-center gap-2">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-[var(--element)]">
                    <span
                      class="block h-full bg-[var(--green)]"
                      style={{ width: `${Math.max(0, Math.min(100, p().progress))}%` }}
                    />
                  </div>
                  <span class="tabular-nums text-[var(--text)]">{p().progress}%</span>
                </div>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Fact(props: { label: string; value: string }) {
  return (
    <div class="flex items-center justify-between gap-3">
      <dt class="text-[11px] font-medium text-[var(--muted)]">{props.label}</dt>
      <dd class="truncate text-right font-semibold text-[var(--text)]">{props.value}</dd>
    </div>
  );
}

const PHASE_COLOR: Record<PhaseState, { bg: string; fg: string }> = {
  done: { bg: "var(--green)", fg: "var(--on-accent)" },
  active: { bg: "var(--accent)", fg: "var(--on-accent)" },
  queued: { bg: "var(--element-active)", fg: "var(--text-2)" },
  blocked: { bg: "var(--red)", fg: "var(--on-accent)" },
};

/** A proportional strip of the project's phases, colored by state. */
function RoadmapStrip(props: { phases: ProjectPhase[] }) {
  const widths = createMemo(() => {
    const days = props.phases.map((ph) => {
      const s = new Date(ph.start + "T00:00:00").getTime();
      const e = new Date(ph.end + "T00:00:00").getTime();
      const d = (e - s) / 86_400_000;
      return Number.isFinite(d) && d > 0 ? d : 1;
    });
    const total = days.reduce((a, b) => a + b, 0) || 1;
    return days.map((d) => (d / total) * 100);
  });

  return (
    <Show
      when={props.phases.length}
      fallback={<p class="text-[12.5px] text-[var(--muted)]">No roadmap yet — ask AULAR to draft one.</p>}
    >
      <div class="flex h-7 gap-1">
        <For each={props.phases}>
          {(ph, i) => (
            <div
              class="flex items-center overflow-hidden rounded-[4px] px-2"
              title={`${ph.name} · ${ph.state}`}
              style={{ width: `${widths()[i()]}%`, background: PHASE_COLOR[ph.state].bg }}
            >
              <span class="truncate text-[10px] font-semibold" style={{ color: PHASE_COLOR[ph.state].fg }}>
                {ph.name}
              </span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

const TASK_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  submitted: { bg: "var(--element)", fg: "var(--muted)", label: "Queued" },
  working: { bg: "var(--green-soft)", fg: "var(--green)", label: "Working" },
  "input-required": { bg: "var(--amber-soft)", fg: "var(--amber)", label: "Needs you" },
};

/** The project's in-flight tasks, straight from the task spine. */
function OpenTasks(props: { project: Project }) {
  const teamIds = createMemo(
    () => new Set(props.project.allAgents ? state.agents.map((a) => a.id) : props.project.team),
  );
  const open = createMemo(() => {
    const ids = teamIds();
    const orgWide = props.project.allAgents === true;
    const onTeam = (t: Task) => !!t.to_agent_profile_id && ids.has(t.to_agent_profile_id);
    return Object.values(state.tasks).filter((t) => {
      if (TERMINAL_TASK_STATES.has(t.state)) return false;
      // The org-wide view is the catch-all: everything in flight.
      if (orgWide) return onTeam(t);
      // A real project owns the tasks its lead stamped for it…
      if (t.project_id) return t.project_id === props.project.id;
      // …and falls back to team membership for unscoped/legacy tasks.
      return onTeam(t);
    });
  });

  return (
    <Show when={open().length} fallback={<p class="text-[12.5px] text-[var(--muted)]">No open tasks.</p>}>
      <div class="flex max-w-[640px] flex-col gap-1.5">
        <For each={open().slice(0, 6)}>{(t) => <TaskLine task={t} />}</For>
        <Show when={open().length > 6}>
          <span class="pl-0.5 text-[11px] text-[var(--faint)]">+{open().length - 6} more</span>
        </Show>
      </div>
    </Show>
  );
}

function TaskLine(props: { task: Task }) {
  const chip = () => TASK_CHIP[props.task.state];
  return (
    <div class="flex items-center gap-2 rounded-[var(--r2)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <span class="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text)]">{props.task.task}</span>
      <span class="shrink-0 text-[11px] text-[var(--muted)]">{props.task.to_agent_name}</span>
      <Show when={chip()}>
        <span
          class="shrink-0 rounded-[var(--pill)] px-1.5 py-[1px] text-[9.5px] font-semibold"
          style={{ background: chip()!.bg, color: chip()!.fg }}
        >
          {chip()!.label}
        </span>
      </Show>
    </div>
  );
}

/**
 * A project the AULAR agent is drafting — it takes over the detail pane so you
 * watch it before it lands. Apply makes it real and selected; Discard drops it.
 */
function DraftDetail(props: {
  draft: Extract<Proposal, { kind: "project" }>;
  onApply: () => void | Promise<void>;
  onDiscard: () => void;
}) {
  const [busy, setBusy] = createSignal(false);
  const apply = async () => {
    if (busy()) return;
    setBusy(true);
    await props.onApply();
    setBusy(false);
  };

  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="px-8 py-6">
        <div class="max-w-[560px] rounded-[var(--r4)] border-[1.5px] border-dashed border-[var(--accent)] bg-[var(--accent-soft)] p-6">
          <div class="flex items-center gap-1.5 text-[var(--accent-text)]">
            <Sparkles size={14} stroke-width={2} />
            <span class="text-[10.5px] font-bold uppercase tracking-[0.08em]">Draft · from AULAR</span>
            <button
              type="button"
              aria-label="Discard"
              onClick={props.onDiscard}
              class="ml-auto grid size-6 place-items-center rounded text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              <X size={14} stroke-width={2} />
            </button>
          </div>
          <h1 class="mt-2 text-[24px] font-semibold text-[var(--text)]" style={{ "font-family": "var(--serif)" }}>
            {props.draft.name}
          </h1>
          <p class="mt-1.5 text-[12.5px] text-[var(--muted)]">
            {props.draft.leadName ? `Lead ${props.draft.leadName}` : "no lead yet"} · reports to you · staffed on apply
          </p>
          <div class="mt-5 flex gap-2">
            <button
              type="button"
              disabled={busy()}
              onClick={apply}
              class="rounded-[var(--r2)] bg-[var(--text)] px-4 py-2 text-[12.5px] font-[650] text-[var(--bg)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--on-accent)] disabled:opacity-50"
            >
              {busy() ? "Applying…" : "Apply — create and select"}
            </button>
            <button
              type="button"
              disabled={busy()}
              onClick={props.onDiscard}
              class="rounded-[var(--r2)] px-3.5 py-2 text-[12.5px] font-[650] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty(props: { children: any }) {
  return (
    <div class="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
      <p class="text-[12.5px] text-[var(--muted)]">{props.children}</p>
    </div>
  );
}

function SectionHead(props: { children: any }) {
  return (
    <h2 class="mb-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--text-2)]">
      {props.children}
    </h2>
  );
}

import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { Plus, Sparkles, X } from "lucide-solid";

import { Avatar } from "~/components/avatar";
import { Modal } from "~/components/modal";
import { api } from "~/lib/api";
import type { Proposal } from "~/lib/intent";
import { applyProposal } from "~/lib/proposals";
import { loadScheduleEntries, type ScheduleEntry as Entry } from "~/lib/schedules";
import { actions, activeProject, agentById, atHome, isProjectMember, state } from "~/lib/store";

/**
 * Schedules — the design's view: recurring routines and scheduled agent work
 * as a grouped LIST (morning / afternoon / evening by next run), with owner,
 * cadence, next run, and an active/paused chip. Data comes from the shared
 * schedule join (lib/schedules), the same truth the flow canvas draws.
 */
export function SchedulesPanel() {
  const [creating, setCreating] = createSignal(false);

  const [data, { refetch }] = createResource(loadScheduleEntries);

  /**
   * Routines belong to agents, not to projects — so a project's cadence is what
   * its team runs. Everything filters through here, which keeps the stat cards
   * and the groups below from disagreeing about what's in scope. An ownerless
   * routine can't be attributed to a team, so it shows only at home.
   */
  const entries = createMemo<Entry[]>(() => {
    const all = data() ?? [];
    if (atHome()) return all;
    const project = activeProject();
    return all.filter((e) => {
      const owner = agentById(e.agentId);
      return owner ? isProjectMember(project, owner) : false;
    });
  });

  // A routine the AULAR agent has drafted — a ghost row until you Apply it.
  const draftRoutine = (): Extract<Proposal, { kind: "routine" }> | null =>
    state.draft?.kind === "routine" ? state.draft : null;
  const [draftNote, setDraftNote] = createSignal("");
  const applyDraft = async () => {
    const d = draftRoutine();
    if (!d) return;
    const res = await applyProposal(d);
    setDraftNote(res.note ?? "");
    actions.clearDraft();
    void refetch();
  };

  // ── the stat cards ───────────────────────────────────────────────────────
  const activeCount = () => entries().filter((e) => e.active).length;
  const runsToday = () => {
    const now = new Date();
    return entries().filter(
      (e) => e.active && e.next && e.next.toDateString() === now.toDateString(),
    ).length;
  };
  const nextRun = () => {
    const soonest = entries()
      .filter((e) => e.active && e.next && e.next.getTime() > Date.now())
      .sort((a, b) => a.next!.getTime() - b.next!.getTime())[0];
    return soonest?.next ? nextLabel(soonest.next) : "—";
  };

  // ── grouped by when they run next ────────────────────────────────────────
  const groups = createMemo(() => {
    const g: Record<string, Entry[]> = { Morning: [], Afternoon: [], Evening: [], Unscheduled: [] };
    for (const e of entries()) {
      if (!e.next) g["Unscheduled"]!.push(e);
      else {
        const h = e.next.getHours();
        (h < 12 ? g["Morning"] : h < 17 ? g["Afternoon"] : g["Evening"])!.push(e);
      }
    }
    for (const list of Object.values(g))
      list.sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity));
    return (Object.entries(g) as [string, Entry[]][]).filter(([, list]) => list.length);
  });

  const toggle = async (e: Entry) => {
    if (!e.routine) return;
    await api
      .updateRoutine(e.routine.id, { active: !e.routine.active })
      .catch(() => {});
    void refetch();
  };

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-[22px] py-[13px]">
        <div class="min-w-0 flex-1">
          <div class="text-[18px] font-semibold text-[var(--text)]" style={{ "font-family": "var(--serif)" }}>
            Schedules
          </div>
          <div class="text-[11.5px] text-[var(--muted)]">
            {atHome()
              ? "Recurring routines and scheduled agent work"
              : `What the ${activeProject().name} team runs on its own`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          class="inline-flex items-center gap-[7px] rounded-[var(--r2)] bg-[var(--text)] px-3.5 py-[9px] text-[12.5px] font-[650] text-[var(--bg)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--on-accent)]"
        >
          <Plus size={15} stroke-width={2} />
          New schedule
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto p-[22px]">
        <div class="mx-auto w-full max-w-[920px]">
          {/* stats */}
          <div class="mb-[26px] grid grid-cols-3 gap-3">
            <Stat label="Active schedules" value={String(activeCount())} />
            <Stat label="Runs today" value={String(runsToday())} />
            <Stat label="Next run" value={nextRun()} />
          </div>

          <Show when={draftRoutine()}>
            {(d) => (
              <ScheduleGhost
                draft={d()}
                onApply={applyDraft}
                onDiscard={() => {
                  actions.clearDraft();
                  setDraftNote("");
                }}
              />
            )}
          </Show>
          <Show when={draftNote()}>
            <div class="mb-6 rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-[11.5px] text-[var(--muted)]">
              {draftNote()}
            </div>
          </Show>

          <Show
            when={entries().length}
            fallback={
              <p class="py-16 text-center text-[12px] text-[var(--muted)]">
                Nothing scheduled yet. Routines an agent runs on its own — a
                morning brief, a nightly review — appear here.
              </p>
            }
          >
            <For each={groups()}>
              {([label, items]) => (
                <>
                  <div class="mx-0.5 mb-2.5 flex items-center">
                    <span class="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
                      {label}
                    </span>
                    <span class="ml-2 text-[11px] text-[var(--faint)]">{items.length}</span>
                  </div>
                  <div
                    class="mb-6 overflow-hidden rounded-[var(--r4)] border border-[var(--line)] bg-[var(--surface)]"
                    style={{ "box-shadow": "var(--shadow-1)" }}
                  >
                    <For each={items}>{(e) => <Row entry={e} onToggle={() => void toggle(e)} />}</For>
                  </div>
                </>
              )}
            </For>
          </Show>
        </div>
      </div>

      <Show when={creating()}>
        <NewScheduleDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void refetch();
          }}
        />
      </Show>
    </div>
  );
}

/**
 * A routine the AULAR agent is drafting — the ghost that lands here as you talk
 * to the rail. Apply schedules it; Discard drops it.
 */
function ScheduleGhost(props: {
  draft: Extract<Proposal, { kind: "routine" }>;
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
    <div class="aular-pop mb-6 rounded-[var(--r4)] border-[1.5px] border-dashed border-[var(--accent)] bg-[var(--accent-soft)] p-4">
      <div class="flex items-center gap-1.5 text-[var(--accent-text)]">
        <Sparkles size={13} stroke-width={2} />
        <span class="text-[10px] font-bold uppercase tracking-[0.08em]">Draft · from AULAR</span>
        <button
          type="button"
          aria-label="Discard"
          onClick={props.onDiscard}
          class="ml-auto grid size-6 place-items-center rounded text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          <X size={13} stroke-width={2} />
        </button>
      </div>

      <div class="mt-2">
        <div class="text-[13px] font-[650] text-[var(--text)]">{props.draft.name}</div>
        <div class="mt-[5px] flex items-center gap-[7px]">
          <Avatar name={props.draft.agentName} size={18} />
          <span class="text-[11px] text-[var(--muted)]">
            {props.draft.agentName} · {props.draft.rule}
          </span>
        </div>
        <Show when={props.draft.behavior}>
          <p class="mt-1.5 text-[11.5px] leading-relaxed text-[var(--text-2)]">
            {props.draft.behavior}
          </p>
        </Show>
      </div>

      <div class="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy()}
          onClick={apply}
          class="rounded-[var(--r2)] bg-[var(--text)] px-3.5 py-[7px] text-[12px] font-[650] text-[var(--bg)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--on-accent)] disabled:opacity-50"
        >
          {busy() ? "Scheduling…" : "Apply — schedule it"}
        </button>
        <button
          type="button"
          disabled={busy()}
          onClick={props.onDiscard}
          class="rounded-[var(--r2)] px-3 py-[7px] text-[12px] font-[650] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

/** A design stat card: 11px muted label over a serif 24px figure. */
function Stat(props: { label: string; value: string }) {
  return (
    <div
      class="rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5"
      style={{ "box-shadow": "var(--shadow-1)" }}
    >
      <div class="text-[11px] text-[var(--muted)]">{props.label}</div>
      <div
        class="mt-1 text-[24px] font-semibold leading-tight text-[var(--text)]"
        style={{ "font-family": "var(--serif)" }}
      >
        {props.value}
      </div>
    </div>
  );
}

/** One schedule row: time · name + owner · next · state chip. */
function Row(props: { entry: Entry; onToggle: () => void }) {
  const e = () => props.entry;
  return (
    <div class="grid grid-cols-[78px_1fr_auto_auto] items-center gap-3.5 border-b border-[var(--line)] px-4 py-[13px] last:border-b-0">
      <span class="text-[12px] font-bold text-[var(--accent-text)]">
        {e().next
          ? e().next!.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "—"}
      </span>

      <div class="min-w-0">
        <div class="truncate text-[13px] font-[650] text-[var(--text)]">{e().name}</div>
        <div class="mt-[5px] flex items-center gap-[7px]">
          <Avatar name={e().ownerName} size={18} />
          <span class="text-[11px] text-[var(--muted)]">
            {e().ownerName} · {e().cadence}
          </span>
        </div>
      </div>

      <span class="text-right text-[11px] text-[var(--muted)]">
        Next
        <br />
        <span class="font-semibold text-[var(--text-2)]">
          {e().next ? nextLabel(e().next!) : "—"}
        </span>
      </span>

      <button
        type="button"
        disabled={!e().routine}
        onClick={props.onToggle}
        title={e().routine ? (e().active ? "Pause" : "Resume") : undefined}
        class="rounded-[var(--pill)] px-2.5 py-[3px] text-[10.5px] font-[650] disabled:cursor-default"
        style={{
          background: e().active ? "var(--green-soft)" : "var(--element)",
          color: e().active ? "var(--green)" : "var(--muted)",
        }}
      >
        {e().active ? "Active" : "Paused"}
      </button>
    </div>
  );
}

/** "09:30" today, "Tomorrow 09:30", or "Jul 21, 09:30". */
function nextLabel(d: Date): string {
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

/** Create a routine: who runs it, what it does, and on what cadence. */
function NewScheduleDialog(props: { onClose: () => void; onCreated: () => void }) {
  const staff = () => state.agents.filter((a) => a.role !== "system");
  const [agentId, setAgentId] = createSignal(staff()[0]?.id ?? "");
  const [name, setName] = createSignal("");
  const [rule, setRule] = createSignal("every weekday at 9:00");
  const [behavior, setBehavior] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const canCreate = () => !!agentId() && !!name().trim() && !!rule().trim() && !!behavior().trim();

  const create = async () => {
    if (!canCreate() || busy()) return;
    setBusy(true);
    setError("");
    try {
      await api.createRoutine({
        agent_profile_id: agentId(),
        name: name().trim(),
        schedule_rule: rule().trim(),
        target_behavior: behavior().trim(),
        active: true,
      });
      props.onCreated();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]";
  const label =
    "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]";

  return (
    <Modal
      title="New schedule"
      width={460}
      onClose={props.onClose}
      footer={
        <div class="flex items-center justify-end gap-2">
          <Show when={error()}>
            <span class="mr-auto text-[11.5px] text-[var(--red)]">{error()}</span>
          </Show>
          <button
            type="button"
            onClick={props.onClose}
            class="rounded-md px-3 py-1.5 text-[12.5px] font-medium text-[var(--muted)] hover:bg-[var(--element-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCreate() || busy()}
            onClick={() => void create()}
            class="rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-40"
          >
            {busy() ? "Creating…" : "Create schedule"}
          </button>
        </div>
      }
    >
      <div class="flex flex-col gap-4">
        <Show
          when={staff().length}
          fallback={
            <p class="text-[12.5px] text-[var(--muted)]">
              Hire an agent first — a schedule needs someone to run it.
            </p>
          }
        >
          <div>
            <label class={label}>Agent</label>
            <select value={agentId()} onChange={(e) => setAgentId(e.currentTarget.value)} class={field}>
              <For each={staff()}>{(a) => <option value={a.id}>{a.name}</option>}</For>
            </select>
          </div>
          <div>
            <label class={label}>Name</label>
            <input
              autofocus
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Morning brief"
              class={field}
            />
          </div>
          <div>
            <label class={label}>When</label>
            <input
              value={rule()}
              onInput={(e) => setRule(e.currentTarget.value)}
              placeholder="every weekday at 9:00"
              class={field}
            />
          </div>
          <div>
            <label class={label}>What it should do</label>
            <textarea
              value={behavior()}
              onInput={(e) => setBehavior(e.currentTarget.value)}
              rows={3}
              placeholder="Summarize overnight activity and flag anything that needs me."
              class={`${field} resize-none`}
            />
          </div>
        </Show>
      </div>
    </Modal>
  );
}

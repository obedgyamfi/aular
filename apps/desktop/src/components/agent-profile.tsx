import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Avatar } from "~/components/avatar";
import { confirmDialog } from "~/components/confirm";
import { age, StateDot, STATE_META } from "~/components/task-state";
import { api } from "~/lib/api";
import { actions, liveTasks, state } from "~/lib/store";
import type { Agent, OrgDocument, Task } from "~/lib/types";
import { TERMINAL_TASK_STATES } from "~/lib/types";

/**
 * The panes of an agent's profile: its soul (who it is), its knowledge (the
 * role documents injected into its prompt), its work (live and recent tasks),
 * and its routines. The org-wide knowledge bank stays in Organization; these
 * are the agent-scoped cut of the same stores.
 *
 * They live here and are composed by `agent-profile-modal.tsx`, which owns the
 * identity card and the tab bar around them. There used to be a full-screen
 * page here too; a profile you navigate to strands you away from the thread you
 * opened it from, so the dialog won.
 */

// ── Soul ─────────────────────────────────────────────────────────────────────

export function SoulTab(props: { agent: Agent }) {
  const [name, setName] = createSignal(props.agent.name);
  const [role, setRole] = createSignal(props.agent.role);
  const [tone, setTone] = createSignal(props.agent.tone ?? "");
  const [persona, setPersona] = createSignal(props.agent.persona ?? "");
  const [instructions, setInstructions] = createSignal(props.agent.instructions ?? "");
  const [reportsTo, setReportsTo] = createSignal(props.agent.reports_to ?? "");
  const [busy, setBusy] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [error, setError] = createSignal("");
  const isSystem = () => props.agent.role === "system";

  // Follow the agent if the page switches to another one.
  let loaded = props.agent.id;
  createEffect(() => {
    if (props.agent.id === loaded) return;
    loaded = props.agent.id;
    setName(props.agent.name);
    setRole(props.agent.role);
    setTone(props.agent.tone ?? "");
    setPersona(props.agent.persona ?? "");
    setInstructions(props.agent.instructions ?? "");
    setReportsTo(props.agent.reports_to ?? "");
  });

  const save = async () => {
    if (busy() || !name().trim()) return;
    setBusy(true);
    setError("");
    try {
      await actions.updateAgent(props.agent.id, {
        name: name().trim(),
        role: role().trim(),
        tone: tone().trim(),
        persona: persona(),
        instructions: instructions(),
        reports_to: reportsTo() || "",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="flex flex-col gap-4">
      <Show when={isSystem()}>
        <p class="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11.5px] text-v2-text-text-muted">
          AULAR is the system agent — its persona ships with the platform and
          can't be rewritten, but you can read it here.
        </p>
      </Show>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input value={name()} disabled={isSystem()} onInput={(e) => setName(e.currentTarget.value)} class={input} />
        </Field>
        <Field label="Role">
          <input value={role()} disabled={isSystem()} onInput={(e) => setRole(e.currentTarget.value)} class={input} />
        </Field>
        <Field label="Tone">
          <input value={tone()} disabled={isSystem()} onInput={(e) => setTone(e.currentTarget.value)} class={input} />
        </Field>
      </div>

      <Show when={!isSystem()}>
        <Field label="Reports to">
          <ManagerMenu agentId={props.agent.id} value={reportsTo()} onChange={setReportsTo} />
        </Field>
      </Show>

      <Field label="Persona — who they are, how they think">
        <textarea
          value={persona()}
          disabled={isSystem()}
          onInput={(e) => setPersona(e.currentTarget.value)}
          rows={5}
          class={`${input} resize-y leading-relaxed`}
        />
      </Field>
      <Field label="Standing instructions — rules for every turn">
        <textarea
          value={instructions()}
          disabled={isSystem()}
          onInput={(e) => setInstructions(e.currentTarget.value)}
          rows={5}
          class={`${input} resize-y leading-relaxed`}
        />
      </Field>

      <Show when={error()}>
        <p class="text-[11.5px] text-v2-state-fg-danger">{error()}</p>
      </Show>

      <Show when={!isSystem()}>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy() || !name().trim()}
            class="w-fit rounded-md bg-v2-background-bg-accent px-3.5 py-2 text-[12px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
          >
            {busy() ? "Saving…" : "Save soul"}
          </button>
          <Show when={saved()}>
            <span class="text-[11.5px] text-v2-state-fg-success">Saved.</span>
          </Show>
          <span class="text-[10.5px] text-v2-text-text-faint">
            Prompt changes reach new conversations; existing threads keep the
            prompt they started with.
          </span>
        </div>
      </Show>
    </div>
  );
}

/** Reports-to as a designed menu, not a native select. */
function ManagerMenu(props: {
  agentId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;
  const onDown = (e: PointerEvent) => {
    if (!root?.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDown));

  const options = () =>
    state.agents.filter((a) => a.id !== props.agentId && a.role !== "system");
  const current = () => state.agents.find((a) => a.id === props.value);

  return (
    <div ref={root} class="relative w-fit">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open()}
        class="flex items-center gap-1.5 rounded-md border border-v2-border-border-muted px-2.5 py-1.5 text-[12px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      >
        <Show when={current()} fallback={<span>You (the CEO)</span>}>
          {(a) => (
            <span class="flex items-center gap-1.5">
              <Avatar name={a().name} size={15} />
              {a().name}
            </span>
          )}
        </Show>
        <Icon name="chevron-down" size="small" />
      </button>
      <Show when={open()}>
        <div class="aular-pop absolute left-0 top-full z-40 mt-1 max-h-[220px] w-[210px] overflow-y-auto rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-02 py-1 shadow-xl">
          <MenuRow
            label="You (the CEO)"
            active={!props.value}
            onClick={() => {
              props.onChange("");
              setOpen(false);
            }}
          />
          <For each={options()}>
            {(a) => (
              <MenuRow
                label={a.name}
                avatar
                active={props.value === a.id}
                onClick={() => {
                  props.onChange(a.id);
                  setOpen(false);
                }}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function MenuRow(props: {
  label: string;
  avatar?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
    >
      <Show when={props.avatar}>
        <Avatar name={props.label} size={16} />
      </Show>
      <span class="min-w-0 flex-1 truncate">{props.label}</span>
      <Show when={props.active}>
        <Icon name="check-small" size="small" />
      </Show>
    </button>
  );
}

// ── Knowledge ────────────────────────────────────────────────────────────────

export function KnowledgeTab(props: { agent: Agent }) {
  const [docs, { refetch }] = createResource(() =>
    api.listDocuments().then((d) => d ?? []).catch(() => []),
  );
  const mine = createMemo(() =>
    (docs() ?? []).filter((d) => d.agent_profile_id === props.agent.id),
  );
  const [editing, setEditing] = createSignal<OrgDocument | "new" | null>(null);

  return (
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <p class="text-[11.5px] leading-relaxed text-v2-text-text-muted">
          Role documents — injected into {props.agent.name}'s prompt on every
          turn, on top of the org-wide knowledge bank.
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          class="shrink-0 rounded-md border border-v2-border-border-base px-2.5 py-1.5 text-[11.5px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
        >
          New document
        </button>
      </div>

      <Show
        when={editing()}
        fallback={
          <div class="flex flex-col gap-1.5">
            <For
              each={mine()}
              fallback={
                <p class="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-4 text-center text-[11.5px] text-v2-text-text-faint">
                  No role documents yet — give {props.agent.name} its playbook.
                </p>
              }
            >
              {(d) => (
                <button
                  type="button"
                  onClick={() => setEditing(d)}
                  class="flex items-baseline gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                >
                  <span class="min-w-0 flex-1 truncate text-[12.5px] font-medium text-v2-text-text-base">
                    {d.title}
                  </span>
                  <span class="shrink-0 text-[10.5px] text-v2-text-text-faint">
                    {d.kind} · {new Date(d.updated_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                </button>
              )}
            </For>
          </div>
        }
      >
        {(doc) => (
          <RoleDocEditor
            agent={props.agent}
            doc={doc() === "new" ? null : (doc() as OrgDocument)}
            onDone={async () => {
              await refetch();
              setEditing(null);
            }}
          />
        )}
      </Show>
    </div>
  );
}

function RoleDocEditor(props: {
  agent: Agent;
  doc: OrgDocument | null;
  onDone: () => void;
}) {
  const [title, setTitle] = createSignal(props.doc?.title ?? "");
  const [content, setContent] = createSignal(props.doc?.content ?? "");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const save = async () => {
    if (!title().trim() || busy()) return;
    setBusy(true);
    setError("");
    try {
      await api.upsertDocument({
        agent_profile_id: props.agent.id,
        title: title().trim(),
        kind: props.doc?.kind ?? "doc",
        content: content(),
      });
      props.onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!props.doc || busy()) return;
    const ok = await confirmDialog({
      title: `Delete “${props.doc.title}”?`,
      message: "It comes out of this agent's prompt immediately.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteDocument(props.doc.id);
      props.onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div class="flex flex-col gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
      <input
        value={title()}
        onInput={(e) => setTitle(e.currentTarget.value)}
        placeholder="Document title"
        class={input}
      />
      <textarea
        value={content()}
        onInput={(e) => setContent(e.currentTarget.value)}
        rows={12}
        placeholder={`Markdown — ${props.agent.name}'s playbook, standards, context. This goes into its prompt.`}
        class={`${input} resize-y font-mono leading-relaxed`}
      />
      <Show when={error()}>
        <p class="text-[11.5px] text-v2-state-fg-danger">{error()}</p>
      </Show>
      <div class="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy() || !title().trim()}
          class="rounded-md bg-v2-background-bg-accent px-3 py-1.5 text-[12px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
        >
          {busy() ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={props.onDone}
          class="rounded-md px-2.5 py-1.5 text-[12px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover"
        >
          Cancel
        </button>
        <div class="flex-1" />
        <Show when={props.doc}>
          <button
            type="button"
            onClick={() => void remove()}
            class="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-v2-state-fg-danger transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          >
            Delete
          </button>
        </Show>
      </div>
    </div>
  );
}

// ── Work ─────────────────────────────────────────────────────────────────────

export function WorkTab(props: { agent: Agent }) {
  const live = createMemo(() =>
    liveTasks().filter((t) => t.to_agent_profile_id === props.agent.id),
  );
  const finished = createMemo(() =>
    Object.values(state.tasks)
      .filter(
        (t) =>
          t.to_agent_profile_id === props.agent.id &&
          TERMINAL_TASK_STATES.has(t.state),
      )
      .sort((a, b) =>
        (b.state_updated_at ?? b.created_at).localeCompare(
          a.state_updated_at ?? a.created_at,
        ),
      )
      .slice(0, 15),
  );

  return (
    <div class="flex flex-col gap-4">
      <section class="flex flex-col gap-1.5">
        <h3 class="text-[10.5px] font-medium uppercase tracking-[0.08em] text-v2-text-text-faint">
          Live
        </h3>
        <For
          each={live()}
          fallback={
            <p class="text-[11.5px] text-v2-text-text-faint">
              Nothing assigned right now.
            </p>
          }
        >
          {(t) => <TaskRow task={t} />}
        </For>
      </section>

      <section class="flex flex-col gap-1.5">
        <h3 class="text-[10.5px] font-medium uppercase tracking-[0.08em] text-v2-text-text-faint">
          Recent
        </h3>
        <For
          each={finished()}
          fallback={
            <p class="text-[11.5px] text-v2-text-text-faint">No finished tasks yet.</p>
          }
        >
          {(t) => <TaskRow task={t} />}
        </For>
      </section>
    </div>
  );
}

function TaskRow(props: { task: Task }) {
  const t = () => props.task;
  return (
    <div class="flex items-center gap-2.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <StateDot state={t().state} size={11} />
      <span
        class="w-[86px] shrink-0 text-[11px] font-medium"
        style={{ color: STATE_META[t().state].color }}
      >
        {STATE_META[t().state].label}
      </span>
      <span class="min-w-0 flex-1 truncate text-[11.5px] text-v2-text-text-muted" title={t().task}>
        {t().task}
      </span>
      <span class="shrink-0 text-[10px] tabular-nums text-v2-text-text-faint">
        from {t().from_agent_name} · {age(t().state_updated_at ?? t().created_at)}
      </span>
    </div>
  );
}

// ── Routines ─────────────────────────────────────────────────────────────────

export function RoutinesTab(props: { agent: Agent; onManage: () => void }) {
  const [routines] = createResource(
    () => props.agent.id,
    (id) => api.listRoutines(id).then((r) => r ?? []).catch(() => []),
  );

  return (
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <p class="text-[11.5px] leading-relaxed text-v2-text-text-muted">
          What {props.agent.name} does on a schedule. Every routine also
          appears on the org Calendar.
        </p>
        <button
          type="button"
          onClick={props.onManage}
          class="shrink-0 rounded-md border border-v2-border-border-base px-2.5 py-1.5 text-[11.5px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
        >
          Manage routines
        </button>
      </div>
      <div class="flex flex-col gap-1.5">
        <For
          each={routines() ?? []}
          fallback={
            <p class="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-4 text-center text-[11.5px] text-v2-text-text-faint">
              No routines yet — scheduled behaviors show up here and on the
              calendar.
            </p>
          }
        >
          {(r) => (
            <div class="flex items-center gap-2.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
              <span
                class="size-1.5 shrink-0 rounded-full"
                classList={{
                  "bg-v2-state-fg-success": r.active,
                  "bg-v2-text-text-faint": !r.active,
                }}
              />
              <span class="min-w-0 flex-1 truncate text-[12px] text-v2-text-text-base">
                {r.name}
              </span>
              <span class="shrink-0 font-mono text-[10.5px] text-v2-text-text-faint">
                {r.schedule_rule}
              </span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────

function Field(props: { label: string; children: any }) {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-[11px] text-[var(--muted)]">
        {props.label}
      </span>
      {props.children}
    </label>
  );
}

const input =
  "w-full rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] px-[11px] py-2 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)] disabled:opacity-60";

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

import { createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { Plus, Search, X } from "lucide-solid";

import { defaultSkillsForRole } from "~/components/agent-capabilities";
import { actions, activeProject, state } from "~/lib/store";
import { api } from "~/lib/api";
import type { AgentTemplate } from "~/lib/types";

/**
 * The design's Add-an-agent dialog: an 860px surface with a serif header,
 * underline tabs, and three ways in — From library (role cards with skills and
 * tool chips), Build with Aular (describe it; the system agent builds it), and
 * Manual. All three end in a real agent.
 */
type Tab = "library" | "aular" | "manual";

export function AddAgentModal(props: { onClose: () => void }) {
  const [tab, setTab] = createSignal<Tab>("library");

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
  };
  document.addEventListener("keydown", onKey);
  onCleanup(() => document.removeEventListener("keydown", onKey));

  return (
    <div
      class="aular-fade fixed inset-0 z-[60] grid place-items-center p-5"
      style={{ background: "color-mix(in srgb, #000 42%, transparent)" }}
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        class="aular-pop flex max-h-[86vh] w-[min(860px,100%)] flex-col overflow-hidden rounded-[var(--r4)] border border-[var(--line)] bg-[var(--surface-2)]"
        style={{ "box-shadow": "var(--shadow-2)" }}
      >
        {/* header */}
        <div class="flex items-center gap-[9px] border-b border-[var(--line)] px-[18px] py-[15px]">
          <span class="text-[17px] font-semibold text-[var(--text)]" style={{ "font-family": "var(--serif)" }}>
            Add an agent
          </span>
          <span class="text-[11.5px] text-[var(--muted)]">to {activeProject().name}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={props.onClose}
            class="ml-auto grid size-[30px] place-items-center rounded-[var(--r2)] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
          >
            <X size={16} stroke-width={1.8} />
          </button>
        </div>

        {/* tabs */}
        <div class="flex border-b border-[var(--line)] px-[18px]">
          <DialogTab active={tab() === "library"} onClick={() => setTab("library")}>
            From library
          </DialogTab>
          <DialogTab active={tab() === "aular"} onClick={() => setTab("aular")}>
            Build with Aular
          </DialogTab>
          <DialogTab active={tab() === "manual"} onClick={() => setTab("manual")} last>
            Manual
          </DialogTab>
        </div>

        {/* body */}
        <div class="min-h-0 flex-1 overflow-y-auto p-[18px] pt-4">
          <Show when={tab() === "library"}>
            <Library onClose={props.onClose} />
          </Show>
          <Show when={tab() === "aular"}>
            <BuildWithAular onClose={props.onClose} />
          </Show>
          <Show when={tab() === "manual"}>
            <Manual onClose={props.onClose} />
          </Show>
        </div>
      </div>
    </div>
  );
}

function DialogTab(props: { active: boolean; last?: boolean; onClick: () => void; children: any }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="py-[11px] text-[13px] font-[650] transition-colors"
      classList={{ "mr-[18px]": !props.last }}
      style={{
        color: props.active ? "var(--text)" : "var(--muted)",
        "border-bottom": props.active ? "2px solid var(--text)" : "2px solid transparent",
        "margin-bottom": "-1px",
      }}
    >
      {props.children}
    </button>
  );
}

// ── From library — the design's role cards, backed by real templates ────────

function Library(props: { onClose: () => void }) {
  const [templates] = createResource(() => api.listTemplates().catch(() => []));
  const [query, setQuery] = createSignal("");
  const [busy, setBusy] = createSignal("");
  const [error, setError] = createSignal("");

  const list = createMemo(() => {
    const q = query().trim().toLowerCase();
    const all = templates() ?? [];
    if (!q) return all;
    return all.filter(
      (t) =>
        (t.name ?? "").toLowerCase().includes(q) ||
        t.role.toLowerCase().includes(q) ||
        (t.persona ?? "").toLowerCase().includes(q),
    );
  });

  const hire = async (t: AgentTemplate) => {
    if (busy()) return;
    setBusy(t.role);
    setError("");
    try {
      const agent = await actions.createAgent({
        name: t.name ?? prettyRole(t.role),
        role: t.role,
        persona: t.persona,
        instructions: t.instructions,
        tone: t.tone,
        default_tools: t.default_tools,
      });
      props.onClose();
      actions.openChat(agent.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  };

  return (
    <div>
      {/* the search */}
      <div class="mb-3 flex h-[38px] items-center gap-2 rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--bg)] px-[11px]">
        <Search size={15} stroke-width={1.9} class="text-[var(--muted)]" />
        <input
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search pre-configured roles & skills…"
          class="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
        />
      </div>

      <Show when={error()}>
        <p class="mb-3 text-[11.5px] text-[var(--red)]">{error()}</p>
      </Show>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-2.5">
        <For
          each={list()}
          fallback={
            <p class="col-span-full py-8 text-center text-[12px] text-[var(--faint)]">
              {templates.loading ? "Loading roles…" : "No roles match."}
            </p>
          }
        >
          {(t) => <RoleCard template={t} busy={busy() === t.role} onHire={() => void hire(t)} />}
        </For>
      </div>
    </div>
  );
}

/** One role card: name + dept pill, skills, tool chips, and Hire. */
function RoleCard(props: { template: AgentTemplate; busy: boolean; onHire: () => void }) {
  const t = () => props.template;
  const skills = () => defaultSkillsForRole(t().role).slice(0, 3);
  const tools = () => (t().default_tools ?? []).slice(0, 3);

  return (
    <div class="flex flex-col gap-[9px] rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)] p-[13px]">
      <div class="flex items-start gap-2">
        <span class="min-w-0 flex-1 text-[13.5px] font-[650] leading-[1.25] text-[var(--text)]">
          {t().name ?? prettyRole(t().role)}
        </span>
        <span class="flex-none rounded-[var(--pill)] bg-[var(--element)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
          {prettyRole(t().role)}
        </span>
      </div>

      <div>
        <div class="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--faint)]">
          Skills
        </div>
        <div class="flex flex-wrap gap-[5px]">
          <For each={skills()}>
            {(s) => (
              <span class="rounded-[var(--pill)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-text)]">
                {s}
              </span>
            )}
          </For>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--faint)]">
          Tools
        </div>
        <div class="flex flex-wrap gap-[5px]">
          <For
            each={tools()}
            fallback={<span class="text-[10.5px] text-[var(--faint)]">Chosen on hire</span>}
          >
            {(tool) => (
              <span class="inline-flex items-center gap-[5px] rounded-[var(--pill)] border border-[var(--line)] bg-[var(--bg)] py-0.5 pl-[3px] pr-2 text-[10.5px] text-[var(--text-2)]">
                <span class="grid size-4 place-items-center rounded-[5px] bg-[var(--element)] text-[8px] font-extrabold text-[var(--muted)]">
                  {tool.charAt(0).toUpperCase()}
                </span>
                {tool}
              </span>
            )}
          </For>
        </div>
      </div>

      <button
        type="button"
        disabled={props.busy}
        onClick={props.onHire}
        class="mt-auto flex items-center gap-1.5 rounded-[var(--r2)] bg-[var(--text)] px-3 py-2 text-left text-[12px] font-[650] text-[var(--bg)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--on-accent)] disabled:opacity-60"
      >
        <Plus size={14} stroke-width={2} />
        {props.busy ? "Hiring…" : "Hire"}
      </button>
    </div>
  );
}

// ── Build with Aular — describe it; the system agent builds it ──────────────

function BuildWithAular(props: { onClose: () => void }) {
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const systemAgent = () => state.agents.find((a) => a.role === "system");

  const send = async () => {
    const agent = systemAgent();
    if (!agent || !text().trim() || busy()) return;
    setBusy(true);
    setError("");
    try {
      await actions.openAgent(agent.id);
      await actions.send(text().trim());
      props.onClose();
      actions.openChat(agent.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div>
      {/* the design's dashed accent callout */}
      <div class="mb-3.5 flex items-start gap-2.5 rounded-[var(--r3)] border border-dashed border-[var(--coral-9)] bg-[var(--accent-soft)] p-3">
        <span class="grid size-7 flex-none place-items-center rounded-lg bg-[var(--accent)] text-[12px] font-bold text-[var(--on-accent)]">
          ✦
        </span>
        <span class="text-[12px] leading-normal text-[var(--accent-text)]">
          Describe the agent you need and Aular drafts the role, rules and tools
          with you in chat — then builds it. It appears in your team when it's
          done.
        </span>
      </div>

      <textarea
        autofocus
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        placeholder="e.g. Someone to own database migrations and keep our Postgres schema healthy"
        class="mb-2.5 min-h-[80px] w-full resize-y rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--bg)] px-[11px] py-2.5 text-[13px] leading-normal text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]"
      />

      <Show when={!systemAgent()}>
        <p class="mb-2 text-[11.5px] text-[var(--red)]">The Aular system agent isn't available.</p>
      </Show>
      <Show when={error()}>
        <p class="mb-2 text-[11.5px] text-[var(--red)]">{error()}</p>
      </Show>

      <button
        type="button"
        disabled={!text().trim() || !systemAgent() || busy()}
        onClick={() => void send()}
        class="inline-flex items-center gap-[7px] rounded-[var(--r2)] bg-[var(--accent)] px-3.5 py-[9px] text-[12.5px] font-[650] text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
      >
        <span class="text-[13px]">✦</span>
        {busy() ? "Sending…" : "Build with Aular"}
      </button>
    </div>
  );
}

// ── Manual ──────────────────────────────────────────────────────────────────

const input =
  "h-[38px] w-full rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--bg)] px-[11px] text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]";

function Manual(props: { onClose: () => void }) {
  const [tools] = createResource(() => api.listToolDefinitions().catch(() => []));
  const [name, setName] = createSignal("");
  const [role, setRole] = createSignal("");
  const [persona, setPersona] = createSignal("");
  const [instructions, setInstructions] = createSignal("");
  const [selected, setSelected] = createSignal<string[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const hire = async () => {
    if (!name().trim() || !role().trim() || busy()) return;
    setBusy(true);
    setError("");
    try {
      const agent = await actions.createAgent({
        name: name().trim(),
        role: role().trim().replace(/\s+/g, "_").toLowerCase(),
        persona: persona(),
        instructions: instructions(),
        tone: "direct",
        default_tools: selected(),
      });
      props.onClose();
      actions.openChat(agent.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div class="flex max-w-[560px] flex-col gap-3.5">
      <Field label="Name">
        <input
          autofocus
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          placeholder="e.g. Marlowe"
          class={input}
        />
      </Field>
      <Field label="Role">
        <input
          value={role()}
          onInput={(e) => setRole(e.currentTarget.value)}
          placeholder="e.g. Data Engineer"
          class={input}
        />
      </Field>
      <Field label="Persona — who they are, how they think">
        <textarea
          value={persona()}
          onInput={(e) => setPersona(e.currentTarget.value)}
          rows={2}
          class="w-full resize-y rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--bg)] px-[11px] py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
      </Field>
      <Field label="Standing instructions — rules for every turn">
        <textarea
          value={instructions()}
          onInput={(e) => setInstructions(e.currentTarget.value)}
          rows={2}
          class="w-full resize-y rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--bg)] px-[11px] py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
      </Field>

      <Field label="Tools">
        <div class="flex flex-wrap gap-1.5 rounded-[var(--r2)] border border-[var(--line)] bg-[var(--surface)] p-2">
          <For each={tools() ?? []}>
            {(t) => {
              const on = () => selected().includes(t.name);
              return (
                <button
                  type="button"
                  title={t.description}
                  aria-pressed={on()}
                  onClick={() =>
                    setSelected((l) =>
                      l.includes(t.name) ? l.filter((x) => x !== t.name) : [...l, t.name],
                    )
                  }
                  class="rounded-[var(--pill)] border px-2 py-1 text-[10.5px] font-semibold transition-colors"
                  style={{
                    "border-color": on() ? "var(--accent)" : "var(--line)",
                    background: on() ? "var(--accent-soft)" : "var(--bg)",
                    color: on() ? "var(--accent-text)" : "var(--muted)",
                  }}
                >
                  {t.name}
                </button>
              );
            }}
          </For>
        </div>
      </Field>

      <Show when={error()}>
        <p class="text-[11.5px] text-[var(--red)]">{error()}</p>
      </Show>

      <div class="mt-0.5 flex justify-end gap-[9px]">
        <button
          type="button"
          onClick={props.onClose}
          class="rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-[9px] text-[12.5px] font-[650] text-[var(--text-2)] transition-colors hover:bg-[var(--element-hover)]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!name().trim() || !role().trim() || busy()}
          onClick={() => void hire()}
          class="rounded-[var(--r2)] bg-[var(--accent)] px-3.5 py-[9px] text-[12.5px] font-[650] text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {busy() ? "Hiring…" : "Hire agent"}
        </button>
      </div>
    </div>
  );
}

function Field(props: { label: string; children: any }) {
  return (
    <label class="flex flex-col gap-1.5">
      <span class="text-[12px] font-[650] text-[var(--text-2)]">{props.label}</span>
      {props.children}
    </label>
  );
}

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

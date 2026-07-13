import { createResource, createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Avatar } from "~/components/avatar";
import { Modal } from "~/components/modal";
import { api } from "~/lib/api";
import { actions, state } from "~/lib/store";
import type { AgentTemplate } from "~/lib/types";

/**
 * Hiring — ported from the prototype's AddAgentModal.
 *
 * Three ways to grow the org, because people arrive with different amounts of
 * clarity:
 *   Template — pick a role; it comes with a persona, operating rules, and tools.
 *   Describe — tell the AULAR system agent what you need, in plain English, and
 *              it builds the agent for you.
 *   Custom   — write the whole thing yourself.
 */
type Mode = "template" | "describe" | "custom";

export function AddAgentModal(props: { onClose: () => void }) {
  const [mode, setMode] = createSignal<Mode>("template");

  return (
    <Modal title="Hire an agent" width={520} onClose={props.onClose}>
      <div class="mb-4 flex gap-1 rounded-md bg-v2-background-bg-layer-02 p-0.5">
        <Tab active={mode() === "template"} onClick={() => setMode("template")}>
          From a role
        </Tab>
        <Tab active={mode() === "describe"} onClick={() => setMode("describe")}>
          Describe it
        </Tab>
        <Tab active={mode() === "custom"} onClick={() => setMode("custom")}>
          Custom
        </Tab>
      </div>

      <Show when={mode() === "template"}>
        <FromTemplate onClose={props.onClose} />
      </Show>
      <Show when={mode() === "describe"}>
        <Describe onClose={props.onClose} />
      </Show>
      <Show when={mode() === "custom"}>
        <Custom onClose={props.onClose} />
      </Show>
    </Modal>
  );
}

function Tab(props: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex-1 rounded px-3 py-1.5 text-[12px] transition-colors"
      classList={{
        "bg-v2-background-bg-layer-03 text-v2-text-text-base": props.active,
        "text-v2-text-text-muted hover:text-v2-text-text-base": !props.active,
      }}
    >
      {props.children}
    </button>
  );
}

// ── from a role ─────────────────────────────────────────────────────────────

function FromTemplate(props: { onClose: () => void }) {
  const [templates] = createResource(() => api.listTemplates().catch(() => []));
  const [picked, setPicked] = createSignal<AgentTemplate | null>(null);
  const [name, setName] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const hire = async () => {
    const tpl = picked();
    if (!tpl || !name().trim() || busy()) return;
    setBusy(true);
    setError("");
    try {
      const agent = await actions.createAgent({
        name: name().trim(),
        role: tpl.role,
        persona: tpl.persona,
        instructions: tpl.instructions,
        tone: tpl.tone,
        default_tools: tpl.default_tools,
      });
      props.onClose();
      void actions.openAgent(agent.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div class="flex flex-col gap-3">
      <input
        autofocus
        value={name()}
        onInput={(e) => setName(e.currentTarget.value)}
        placeholder="Name them (e.g. Forge)"
        class={field}
      />

      <div class="flex max-h-[280px] flex-col gap-1 overflow-y-auto">
        <For each={templates() ?? []}>
          {(t) => (
            <button
              type="button"
              onClick={() => {
                setPicked(t);
                if (!name().trim()) setName(t.name ?? "");
              }}
              aria-current={picked()?.role === t.role}
              class="flex items-start gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-v2-overlay-simple-overlay-hover aria-[current=true]:border-v2-border-border-focus aria-[current=true]:bg-v2-overlay-simple-overlay-pressed"
            >
              <Avatar name={t.name ?? t.role} size={28} />
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="text-[12.5px] text-v2-text-text-base">
                  {t.name ?? t.role}
                </span>
                <span class="line-clamp-2 text-[11px] leading-relaxed text-v2-text-text-muted">
                  {t.persona}
                </span>
              </span>
            </button>
          )}
        </For>
      </div>

      <Errors error={error()} />
      <Footer
        busy={busy()}
        disabled={!picked() || !name().trim()}
        label="Hire"
        onCancel={props.onClose}
        onConfirm={hire}
      />
    </div>
  );
}

// ── describe it ─────────────────────────────────────────────────────────────

/**
 * The AULAR system agent interviews you and emits an agent spec, which the
 * backend validates and turns into a real agent. You just say what you need.
 */
function Describe(props: { onClose: () => void }) {
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
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div class="flex flex-col gap-3">
      <p class="text-[11.5px] leading-relaxed text-v2-text-text-muted">
        Tell AULAR what you need in plain English. It will ask what it doesn't
        know, then build the agent — persona, rules and tools — and it appears in
        your team.
      </p>

      <textarea
        autofocus
        rows={4}
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        placeholder="I need a QA engineer who writes tests, runs the suite, and reports failures without fixing them."
        class={`${field} resize-none`}
      />

      <Show when={!systemAgent()}>
        <p class="text-[11.5px] text-v2-text-text-danger">
          The AULAR system agent isn't available.
        </p>
      </Show>

      <Errors error={error()} />
      <Footer
        busy={busy()}
        disabled={!text().trim() || !systemAgent()}
        label="Ask AULAR"
        onCancel={props.onClose}
        onConfirm={send}
      />
    </div>
  );
}

// ── custom ──────────────────────────────────────────────────────────────────

function Custom(props: { onClose: () => void }) {
  const [tools] = createResource(() => api.listToolDefinitions().catch(() => []));
  const [name, setName] = createSignal("");
  const [role, setRole] = createSignal("");
  const [persona, setPersona] = createSignal("");
  const [instructions, setInstructions] = createSignal("");
  const [tone, setTone] = createSignal("direct");
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
        tone: tone(),
        default_tools: selected(),
      });
      props.onClose();
      void actions.openAgent(agent.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-2">
        <input
          autofocus
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          placeholder="Name"
          class={field}
        />
        <input
          value={role()}
          onInput={(e) => setRole(e.currentTarget.value)}
          placeholder="Role (e.g. qa_reviewer)"
          class={field}
        />
      </div>

      <textarea
        rows={2}
        value={persona()}
        onInput={(e) => setPersona(e.currentTarget.value)}
        placeholder="Persona — who they are, how they think."
        class={`${field} resize-none`}
      />
      <textarea
        rows={2}
        value={instructions()}
        onInput={(e) => setInstructions(e.currentTarget.value)}
        placeholder="Standing instructions — rules for every turn."
        class={`${field} resize-none`}
      />

      <div class="flex flex-wrap gap-1.5 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 p-2">
        <For each={tools() ?? []}>
          {(t) => {
            const on = () => selected().includes(t.name);
            return (
              <button
                type="button"
                title={t.description}
                onClick={() =>
                  setSelected((l) =>
                    l.includes(t.name) ? l.filter((x) => x !== t.name) : [...l, t.name],
                  )
                }
                class="rounded border px-2 py-1 font-mono text-[10.5px] transition-colors"
                classList={{
                  "border-v2-border-border-focus bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base":
                    on(),
                  "border-v2-border-border-muted text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover":
                    !on(),
                }}
              >
                {t.name}
              </button>
            );
          }}
        </For>
      </div>

      <Errors error={error()} />
      <Footer
        busy={busy()}
        disabled={!name().trim() || !role().trim()}
        label="Create"
        onCancel={props.onClose}
        onConfirm={hire}
      />
    </div>
  );
}

// ── shared ──────────────────────────────────────────────────────────────────

const field =
  "w-full rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2.5 py-1.5 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-weak focus:border-v2-border-border-focus";

function Errors(props: { error: string }) {
  return (
    <Show when={props.error}>
      <p class="flex items-center gap-1.5 text-[11.5px] text-v2-text-text-danger">
        <Icon name="warning" size="small" />
        {props.error}
      </p>
    </Show>
  );
}

function Footer(props: {
  busy: boolean;
  disabled: boolean;
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div class="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={props.onCancel}
        class="rounded-md px-3 py-1.5 text-[12px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={props.onConfirm}
        disabled={props.busy || props.disabled}
        class="rounded-md bg-v2-background-bg-accent px-3 py-1.5 text-[12px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
      >
        {props.busy ? "Working…" : props.label}
      </button>
    </div>
  );
}

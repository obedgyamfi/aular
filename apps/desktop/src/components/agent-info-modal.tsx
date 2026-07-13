import { createResource, createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Avatar } from "~/components/avatar";
import { confirmDialog } from "~/components/confirm";
import { Modal } from "~/components/modal";
import { api } from "~/lib/api";
import { settingsActions } from "~/lib/settings";
import { actions, state } from "~/lib/store";
import type { Agent } from "~/lib/types";

/**
 * The agent's profile — ported from the prototype's AgentInfoModal.
 *
 * Everything about who this agent is, and editable: name, role, tone, persona,
 * standing instructions, the tools it is allowed to use (risk-badged, because
 * `terminal` is not `todo`), and who it reports to — which is what the org
 * engine reads to build its team roster.
 */
export function AgentInfoModal(props: { agent: Agent; onClose: () => void }) {
  const agent = () => props.agent;
  const isSystem = () => agent().role === "system";

  const [tools] = createResource(() => api.listToolDefinitions().catch(() => []));

  const [name, setName] = createSignal(agent().name);
  const [role, setRole] = createSignal(agent().role);
  const [tone, setTone] = createSignal(agent().tone ?? "");
  const [persona, setPersona] = createSignal(agent().persona ?? "");
  const [instructions, setInstructions] = createSignal(agent().instructions ?? "");
  const [selected, setSelected] = createSignal<string[]>(agent().default_tools ?? []);
  const [reportsTo, setReportsTo] = createSignal(agent().reports_to ?? "");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const managers = () =>
    state.agents.filter((a) => a.id !== agent().id && a.role !== "system");

  const toggleTool = (t: string) =>
    setSelected((list) =>
      list.includes(t) ? list.filter((x) => x !== t) : [...list, t],
    );

  const save = async () => {
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      await actions.updateAgent(agent().id, {
        name: name().trim(),
        role: role().trim(),
        tone: tone().trim(),
        persona: persona(),
        instructions: instructions(),
        default_tools: selected(),
        // "" clears the manager (reports to you); an id re-parents.
        reports_to: reportsTo() || "",
      });
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy()) return;
    const ok = await confirmDialog({
      title: `Remove ${agent().name}?`,
      message:
        "This deletes the agent and everything it has said. Work it already did — documents, reports — stays in the knowledge bank. This can't be undone.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await actions.deleteAgent(agent().id);
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const footer = (
    <div class="flex items-center justify-between gap-2">
      <Show when={!isSystem()} fallback={<span />}>
        <button
          type="button"
          onClick={remove}
          disabled={busy()}
          class="rounded-md px-3 py-1.5 text-[12px] text-v2-state-fg-danger transition-colors hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-50"
        >
          Remove agent
        </button>
      </Show>

      <div class="flex gap-2">
        <button
          type="button"
          onClick={props.onClose}
          class="rounded-md px-3 py-1.5 text-[12px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy() || !name().trim()}
          class="rounded-md bg-v2-background-bg-accent px-3 py-1.5 text-[12px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
        >
          {busy() ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );

  return (
    <Modal title="" onClose={props.onClose} width={520} footer={footer}>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3 pr-8">
          <Avatar name={name() || agent().name} size={44} />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <input
              value={name()}
              disabled={isSystem()}
              onInput={(e) => setName(e.currentTarget.value)}
              class={`${field} text-[14px] font-medium disabled:opacity-60`}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => settingsActions.toggleMute(agent().id)}
          class="flex w-fit items-center gap-1.5 rounded-md border border-v2-border-border-muted px-2.5 py-1 text-[11.5px] transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          classList={{
            "text-v2-text-text-base": settingsActions.isMuted(agent().id),
            "text-v2-text-text-muted": !settingsActions.isMuted(agent().id),
          }}
        >
          <Icon name="bubble-5" size="small" />
          {settingsActions.isMuted(agent().id)
            ? "Muted — notifications off"
            : "Mute notifications"}
        </button>

        <Show when={isSystem()}>
          <p class="rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 py-2 text-[11.5px] leading-relaxed text-v2-text-text-muted">
            This is the AULAR system agent — it builds and edits the rest of your
            team. It can't be renamed or removed.
          </p>
        </Show>

        <div class="grid grid-cols-2 gap-3">
          <Field label="Role">
            <input
              value={role()}
              disabled={isSystem()}
              onInput={(e) => setRole(e.currentTarget.value)}
              placeholder="backend_engineer"
              class={`${field} disabled:opacity-60`}
            />
          </Field>
          <Field label="Tone">
            <input
              value={tone()}
              onInput={(e) => setTone(e.currentTarget.value)}
              placeholder="direct"
              class={field}
            />
          </Field>
        </div>

        <Field label="Persona" hint="Who they are. Sets how they think and speak.">
          <textarea
            value={persona()}
            onInput={(e) => setPersona(e.currentTarget.value)}
            rows={3}
            class={`${field} resize-none`}
          />
        </Field>

        <Field
          label="Standing instructions"
          hint="Rules that apply to every turn — how they work, what they never do."
        >
          <textarea
            value={instructions()}
            onInput={(e) => setInstructions(e.currentTarget.value)}
            rows={3}
            class={`${field} resize-none`}
          />
        </Field>

        <Show when={!isSystem()}>
          <Field
            label="Reports to"
            hint="The org engine reads this to build each agent's team roster."
          >
            <select
              value={reportsTo()}
              onChange={(e) => setReportsTo(e.currentTarget.value)}
              class={field}
            >
              <option value="">You (top level)</option>
              <For each={managers()}>
                {(m) => <option value={m.id}>{m.name}</option>}
              </For>
            </select>
          </Field>
        </Show>

        <Field label="Tools" hint="What this agent is allowed to reach for.">
          <div class="flex max-h-[150px] flex-wrap gap-1.5 overflow-y-auto rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 p-2">
            <For each={tools() ?? []}>
              {(t) => {
                const on = () => selected().includes(t.name);
                return (
                  <button
                    type="button"
                    onClick={() => toggleTool(t.name)}
                    title={t.description}
                    class="flex items-center gap-1 rounded border px-2 py-1 font-mono text-[10.5px] transition-colors"
                    classList={{
                      "border-v2-border-border-focus bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base":
                        on(),
                      "border-v2-border-border-muted text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover":
                        !on(),
                    }}
                  >
                    {t.name}
                    <Show when={isRisky(t)}>
                      <span class="text-v2-state-fg-danger" title="High risk">
                        ●
                      </span>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </Field>

        <Show when={error()}>
          <p class="text-[11.5px] text-v2-state-fg-danger">{error()}</p>
        </Show>

      </div>
    </Modal>
  );
}

const field =
  "w-full rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2.5 py-1.5 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-weak focus:border-v2-border-border-focus";

function Field(props: { label: string; hint?: string; children: any }) {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-[10.5px] font-medium uppercase tracking-[0.08em] text-v2-text-text-weak">
        {props.label}
      </span>
      {props.children}
      <Show when={props.hint}>
        <span class="text-[10.5px] text-v2-text-text-weak">{props.hint}</span>
      </Show>
    </label>
  );
}

/** Tools that touch the machine deserve a badge — `terminal` is not `todo`. */
function isRisky(t: { name: string; risk_level?: string }): boolean {
  if (t.risk_level) return /high|danger/i.test(t.risk_level);
  return ["terminal", "file", "code_execution", "browser"].includes(t.name);
}

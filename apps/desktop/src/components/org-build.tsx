import { createResource, createSignal, For, Show } from "solid-js";

import { AddAgentModal } from "~/components/add-agent-modal";
import { Avatar } from "~/components/avatar";
import { actions, state } from "~/lib/store";
import { api } from "~/lib/api";
import type { AgentTemplate } from "~/lib/types";

/**
 * Organization → Hire — ported from the prototype's OrgBuild.
 *
 * Everything needed to stand up (or grow) the org, even when it's just you and
 * the AULAR system agent: describe the hire you need in plain English, take a
 * role template in one click, or craft an agent by hand. The three routes the
 * hire dialog offers, given a full page instead of a modal.
 */
export function OrgBuild() {
  const [templates] = createResource(() => api.listTemplates().catch(() => []));
  const [customOpen, setCustomOpen] = createSignal(false);
  const [hiring, setHiring] = createSignal<string | null>(null);
  const [error, setError] = createSignal("");

  const system = () => state.agents.find((a) => a.role === "system");
  const staff = () => state.agents.filter((a) => a.role !== "system");
  const staffNames = () => new Set(staff().map((a) => a.name.toLowerCase()));

  /** 0 = unlimited (the org engine is linked); otherwise the free shell's cap. */
  const cap = () => state.health?.max_agents ?? 0;
  const atCap = () => cap() > 0 && staff().length >= cap();

  const describeInChat = () => {
    const s = system();
    if (!s) return;
    actions.setRegister("chat");
    void actions.openAgent(s.id);
  };

  const hire = async (t: AgentTemplate) => {
    if (hiring() || atCap()) return;
    setHiring(t.role);
    setError("");
    try {
      await actions.createAgent({
        name: t.name,
        role: t.role,
        persona: t.persona,
        instructions: t.instructions,
        tone: t.tone,
        default_tools: t.default_tools,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setHiring(null);
    }
  };

  return (
    <div class="flex flex-col gap-5">
      {/* The hero: where this org is, and the three ways to grow it. */}
      <div class="flex flex-col gap-3 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-5 py-4 md:flex-row md:items-center">
        <div class="min-w-0 flex-1">
          <h2 class="text-[14px] font-medium text-v2-text-text-base">
            {staff().length === 0
              ? "It's just you and AULAR — build your organization"
              : `Grow your organization (${staff().length} agent${staff().length === 1 ? "" : "s"} hired)`}
          </h2>
          <p class="pt-1 text-[12px] leading-relaxed text-v2-text-text-muted">
            Hire from the role templates below, describe the hire you need to the
            AULAR system agent in plain English, or craft one by hand. New agents
            appear in the chat list and on the org chart — drag them there to
            shape who reports to whom.
          </p>
          <Show when={atCap()}>
            <p class="pt-1.5 text-[11.5px] text-v2-state-fg-warning">
              This build runs up to {cap()} agents. The licensed org engine lifts
              the cap.
            </p>
          </Show>
          <Show when={error()}>
            <p class="pt-1.5 text-[11.5px] text-v2-state-fg-danger">{error()}</p>
          </Show>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={describeInChat}
            disabled={!system()}
            class="rounded-md bg-v2-background-bg-accent px-3.5 py-2 text-[12.5px] font-medium text-v2-text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Describe it to AULAR
          </button>
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            class="rounded-md border border-v2-border-border-base px-3.5 py-2 text-[12.5px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          >
            Custom agent
          </button>
        </div>
      </div>

      {/* The gallery. */}
      <div class="flex flex-col gap-2">
        <h3 class="px-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-v2-text-text-faint">
          Role templates
        </h3>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <For
            each={templates() ?? []}
            fallback={
              <div class="rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-5 py-8 text-center text-[12px] text-v2-text-text-faint md:col-span-2 xl:col-span-3">
                Loading templates…
              </div>
            }
          >
            {(t) => {
              const hired = () => staffNames().has(t.name.toLowerCase());
              return (
                <div class="flex flex-col rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-4 py-3.5">
                  <div class="flex items-center gap-3">
                    <Avatar name={t.name} size={36} />
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-[13px] font-medium text-v2-text-text-base">
                        {t.name}
                      </div>
                      <div class="truncate text-[11px] text-v2-text-text-muted">
                        {t.role.replaceAll("_", " ")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void hire(t)}
                      disabled={hired() || hiring() !== null || atCap()}
                      class="shrink-0 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors"
                      classList={{
                        "bg-v2-background-bg-layer-02 text-v2-text-text-faint":
                          hired() || atCap(),
                        "bg-v2-state-bg-info text-v2-state-fg-info hover:bg-v2-background-bg-accent hover:text-v2-text-text-inverse":
                          !hired() && !atCap(),
                      }}
                    >
                      {hired() ? "Hired ✓" : hiring() === t.role ? "Hiring…" : "Hire"}
                    </button>
                  </div>
                  <p class="line-clamp-2 pt-2 text-[11.5px] leading-relaxed text-v2-text-text-muted">
                    {t.persona}
                  </p>
                  <div class="flex flex-wrap gap-1 pt-2">
                    <For each={t.default_tools.slice(0, 4)}>
                      {(tool) => (
                        <span class="rounded bg-v2-background-bg-layer-02 px-1.5 py-px font-mono text-[10px] text-v2-text-text-faint">
                          {tool}
                        </span>
                      )}
                    </For>
                    <Show when={t.default_tools.length > 4}>
                      <span class="px-1 text-[10px] text-v2-text-text-faint">
                        +{t.default_tools.length - 4}
                      </span>
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      <Show when={customOpen()}>
        <AddAgentModal onClose={() => setCustomOpen(false)} />
      </Show>
    </div>
  );
}

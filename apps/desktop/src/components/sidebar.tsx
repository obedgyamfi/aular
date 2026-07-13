import { createMemo, createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { AgentListItem } from "~/components/agent-list-item";
import { AddAgentModal } from "~/components/add-agent-modal";
import { actions, state } from "~/lib/store";

/**
 * The org, as a list — ported from the prototype's Sidebar.
 *
 * The AULAR system agent is pinned at the top (it is how you build the rest of
 * the team), staff below, ordered by recent activity like a messenger. A search
 * box filters by name or role. Hiring sits at the foot as a real button — the
 * one action that grows the org shouldn't hide behind a 24px "+". (The account
 * lives in the title bar, beside the window controls.)
 */
export function Sidebar() {
  const [hiring, setHiring] = createSignal(false);
  const [query, setQuery] = createSignal("");

  const matches = (name: string, role: string) => {
    const q = query().trim().toLowerCase();
    if (!q) return true;
    return name.toLowerCase().includes(q) || role.toLowerCase().includes(q);
  };

  const system = createMemo(() =>
    state.agents.filter((a) => a.role === "system" && matches(a.name, a.role)),
  );

  // Staff, most recently active first — the messenger ordering.
  const staff = createMemo(() =>
    state.agents
      .filter((a) => a.role !== "system" && matches(a.name, a.role))
      .slice()
      .sort((a, b) => {
        const at = state.preview[a.id]?.at ?? a.updated_at ?? "";
        const bt = state.preview[b.id]?.at ?? b.updated_at ?? "";
        return bt.localeCompare(at);
      }),
  );

  const capped = () => {
    const max = state.health?.max_agents ?? 0;
    return max > 0 && state.agents.filter((a) => a.role !== "system").length >= max;
  };

  return (
    <aside class="flex w-[270px] min-w-0 shrink-0 flex-col overflow-hidden border-r border-v2-border-border-muted bg-v2-background-bg-base">
      <div class="flex h-9 shrink-0 items-center pl-3 pr-2">
        <span class="text-[11px] font-medium tracking-[0.08em] text-v2-text-text-muted">
          AGENTS
        </span>
      </div>

      <div class="shrink-0 px-2 pb-2">
        <div class="flex items-center gap-1.5 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-2 py-1 focus-within:border-v2-border-border-focus">
          <span class="shrink-0 text-v2-icon-icon-muted">
            <Icon name="magnifying-glass" size="small" />
          </span>
          <input
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search agents"
            class="min-w-0 flex-1 bg-transparent py-0.5 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
          />
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-2">
        <For each={system()}>
          {(a) => (
            <AgentListItem
              agent={a}
              active={state.activeAgentId === a.id}
              onClick={() => void actions.openAgent(a.id)}
            />
          )}
        </For>

        <Show when={staff().length}>
          <div class="px-2 pb-1 pt-3 text-[10px] font-medium tracking-[0.08em] text-v2-text-text-faint">
            STAFF
          </div>
        </Show>

        <For each={staff()}>
          {(a) => (
            <AgentListItem
              agent={a}
              active={state.activeAgentId === a.id}
              onClick={() => void actions.openAgent(a.id)}
            />
          )}
        </For>

        <Show when={!state.agents.length}>
          <p class="px-3 py-10 text-center text-[12px] text-v2-text-text-muted">
            No agents yet
          </p>
        </Show>

        <Show when={state.agents.length && !system().length && !staff().length}>
          <p class="px-3 py-8 text-center text-[11.5px] text-v2-text-text-faint">
            No agents match “{query()}”
          </p>
        </Show>
      </div>

      <Show when={capped()}>
        <div class="mx-2 mb-2 flex min-w-0 flex-col gap-1.5 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-2.5">
          <span class="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-v2-text-text-base">
            <span class="shrink-0">
              <Icon name="subagent" size="small" />
            </span>
            <span class="truncate">{state.health?.max_agents} agent limit</span>
          </span>
          <span class="text-[11px] leading-relaxed text-v2-text-text-muted">
            Agents that delegate work to each other, share a roadmap, and run on a
            schedule are AULAR&nbsp;Pro.
          </span>
        </div>
      </Show>

      {/* The foot of the list is where the list grows. */}
      <div class="shrink-0 border-t border-v2-border-border-muted p-2">
        <button
          type="button"
          disabled={capped()}
          title={capped() ? "Agent limit reached" : "Hire an agent"}
          onClick={() => setHiring(true)}
          class="flex w-full items-center justify-center gap-1.5 rounded-md bg-v2-background-bg-accent px-3 py-2 text-[12.5px] font-medium text-v2-text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Icon name="plus-small" size="small" />
          Hire an agent
        </button>
      </div>

      <Show when={hiring()}>
        <AddAgentModal onClose={() => setHiring(false)} />
      </Show>
    </aside>
  );
}

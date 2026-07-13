import { createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { NewAgentDialog } from "~/components/new-agent-dialog";
import { actions, state } from "~/lib/store";
import type { Agent } from "~/lib/types";

/** The org, as a list. 260px column, opencode's metrics. */
export function Sidebar() {
  const [creating, setCreating] = createSignal(false);

  const staff = () => state.agents.filter((a) => a.role !== "system");
  const system = () => state.agents.filter((a) => a.role === "system");
  const capped = () => {
    const max = state.health?.max_agents ?? 0;
    return max > 0 && staff().length >= max;
  };

  return (
    <aside class="flex w-[260px] min-w-0 shrink-0 flex-col overflow-hidden border-r border-v2-border-border-muted bg-v2-background-bg-base">
      <div class="flex h-9 shrink-0 items-center justify-between pl-3 pr-2">
        <span class="text-[11px] font-medium tracking-[0.08em] text-v2-text-text-muted">
          AGENTS
        </span>
        <button
          type="button"
          aria-label="New agent"
          disabled={capped()}
          onClick={() => setCreating(true)}
          class="flex size-6 items-center justify-center rounded text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base disabled:opacity-30"
        >
          <Icon name="plus-small" size="small" />
        </button>
      </div>

      <div class="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-2">
        <For each={system()}>{(a) => <AgentRow agent={a} />}</For>
        <Show when={staff().length}>
          <div class="px-2 pb-1 pt-3 text-[10px] font-medium tracking-[0.08em] text-v2-text-text-weak">
            STAFF
          </div>
        </Show>
        <For each={staff()}>{(a) => <AgentRow agent={a} />}</For>

        <Show when={!state.agents.length}>
          <p class="px-3 py-10 text-center text-[12px] text-v2-text-text-muted">
            No agents yet
          </p>
        </Show>
      </div>

      <Show when={capped()}>
        <div class="mx-2 mb-2 flex min-w-0 flex-col gap-1.5 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-2.5">
          <span class="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-v2-text-text-base">
            <span class="shrink-0">
              <Icon name="subagent" size="small" />
            </span>
            <span class="truncate">{state.health?.max_agents} agent limit reached</span>
          </span>
          <span class="text-[11px] leading-relaxed text-v2-text-text-muted">
            Agents that delegate work to each other, share a roadmap, and run on
            a schedule are AULAR&nbsp;Pro.
          </span>
        </div>
      </Show>

      <Show when={creating()}>
        <NewAgentDialog onClose={() => setCreating(false)} />
      </Show>
    </aside>
  );
}

function AgentRow(props: { agent: Agent }) {
  const a = () => props.agent;
  const active = () => state.activeAgentId === a().id;

  return (
    <button
      type="button"
      onClick={() => void actions.openAgent(a().id)}
      aria-current={active()}
      class="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-v2-overlay-simple-overlay-hover aria-[current=true]:bg-v2-overlay-simple-overlay-pressed"
    >
      <span class="flex size-5 shrink-0 items-center justify-center rounded bg-v2-background-bg-layer-02 text-[10px] font-medium text-v2-text-text-muted">
        {a().name.slice(0, 1).toUpperCase()}
      </span>
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-[12.5px] text-v2-text-text-base">{a().name}</span>
        <Show when={a().last_message}>
          <span class="truncate text-[11px] text-v2-text-text-weak">{a().last_message}</span>
        </Show>
      </span>
      <Show when={(a().unread_count ?? 0) > 0}>
        <span class="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-v2-background-bg-accent px-1 text-[10px] font-medium text-v2-text-text-inverse">
          {a().unread_count}
        </span>
      </Show>
    </button>
  );
}

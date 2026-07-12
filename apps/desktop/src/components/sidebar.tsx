import { Show } from "solid-js";

import { engine } from "~/lib/engine";

/**
 * Conversation list. The agent cap comes from the backend (0 = unlimited), so
 * the free shell can say exactly where its ceiling is instead of failing
 * mysteriously at the fourth agent.
 */
export function Sidebar(props: { maxAgents?: number }) {
  return (
    <aside
      class="flex w-[260px] shrink-0 flex-col"
      style={{
        background: "var(--aular-bg-elevated)",
        "border-right": "1px solid var(--aular-border-soft)",
      }}
    >
      <div class="flex items-center justify-between px-4 py-3">
        <h1 class="text-[13px] font-semibold">Chat</h1>
        <button
          type="button"
          aria-label="New agent"
          class="flex size-6 items-center justify-center rounded transition-colors"
          style={{ color: "var(--aular-text-muted)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div class="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        <div
          class="flex flex-col items-center gap-2 px-4 py-10 text-center"
          style={{ color: "var(--aular-text-faint)" }}
        >
          <p class="text-[12px]">No agents yet.</p>
          <p class="text-[11px]">Create one to start.</p>
        </div>
      </div>

      <Show when={engine.isFree(props.maxAgents)}>
        <div
          class="m-2 flex flex-col gap-1 rounded-md p-3"
          style={{
            background: "var(--aular-surface)",
            border: "1px solid var(--aular-border-soft)",
          }}
        >
          <span class="text-[11px] font-semibold">
            {props.maxAgents} agents, no delegation
          </span>
          <span class="text-[11px]" style={{ color: "var(--aular-text-muted)" }}>
            The organization — agents that dispatch work to each other, hold a
            roadmap, and run on a schedule — is AULAR Pro.
          </span>
        </div>
      </Show>
    </aside>
  );
}

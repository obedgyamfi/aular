import { Show } from "solid-js";

import { engine } from "~/lib/engine";

// The conversation list, sitting one layer above the deep background —
// opencode's layer-01 surface with a hairline border.
export function Sidebar(props: { maxAgents?: number }) {
  return (
    <aside class="flex w-[260px] shrink-0 flex-col border-r border-v2-border-border-muted bg-v2-background-bg-layer-01">
      <div class="flex h-9 shrink-0 items-center justify-between px-3">
        <span class="text-[11px] font-medium uppercase tracking-wide text-v2-text-text-muted">
          Agents
        </span>
        <button
          type="button"
          aria-label="New agent"
          class="flex size-6 items-center justify-center rounded text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <div class="flex flex-1 flex-col gap-px overflow-y-auto px-2">
        <div class="flex flex-col items-center gap-1 px-3 py-8 text-center">
          <p class="text-[12px] text-v2-text-text-muted">No agents yet</p>
          <p class="text-[11px] text-v2-text-text-weak">Create one to start</p>
        </div>
      </div>

      <Show when={engine.isFree(props.maxAgents)}>
        <div class="m-2 flex flex-col gap-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 p-3">
          <span class="text-[11px] font-medium text-v2-text-text-base">
            {props.maxAgents} agents, no delegation
          </span>
          <span class="text-[11px] leading-relaxed text-v2-text-text-muted">
            Agents that dispatch work to each other, share a roadmap, and run on a
            schedule are AULAR Pro.
          </span>
        </div>
      </Show>
    </aside>
  );
}

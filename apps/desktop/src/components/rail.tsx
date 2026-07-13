import { For } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { actions, state, type Register } from "~/lib/store";

// Their icon vocabulary — 20×20, 1px stroke, square caps. No hand-drawn paths.
const REGISTERS: {
  id: Register;
  label: string;
  icon: "speech-bubble" | "terminal" | "subagent";
}[] = [
  { id: "chat", label: "Chat", icon: "speech-bubble" },
  { id: "work", label: "Work", icon: "terminal" },
  { id: "org", label: "Organization", icon: "subagent" },
];

export function Rail() {
  return (
    <nav
      data-component="sidebar-rail"
      class="flex w-12 shrink-0 flex-col items-center gap-1 overflow-hidden border-r border-v2-border-border-muted bg-v2-background-bg-deep py-2"
    >
      <For each={REGISTERS}>
        {(reg) => (
          <button
            type="button"
            aria-label={reg.label}
            aria-current={state.register === reg.id}
            onClick={() => actions.setRegister(reg.id)}
            class="flex size-8 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base aria-[current=true]:bg-v2-overlay-simple-overlay-pressed aria-[current=true]:text-v2-icon-icon-accent"
          >
            <Icon name={reg.icon} size="small" />
          </button>
        )}
      </For>
    </nav>
  );
}

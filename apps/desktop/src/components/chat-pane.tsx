import { createSignal, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { AgentInfoModal } from "~/components/agent-info-modal";
import { Avatar } from "~/components/avatar";
import { Composer } from "~/components/composer";
import { Mark } from "~/components/logo";
import { MessageList } from "~/components/message-list";
import { Onboarding } from "~/components/onboarding";
import { RoutinesModal } from "~/components/routines-modal";
import { actions, activeAgent, activeWorking, state } from "~/lib/store";

/**
 * The chat register.
 *
 * The header carries the agent's identity and its live state — "typing…" while
 * it works, its role otherwise — and opens its profile. Clicking through to the
 * Work register shows the same conversation with every tool call it made.
 */
export function ChatPane() {
  const [info, setInfo] = createSignal(false);
  const [routines, setRoutines] = createSignal(false);

  /** The system agent ships with every account; staff is what you build. */
  const hasStaff = () => state.agents.some((a) => a.role !== "system");

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-v2-background-bg-base">
      <Show
        when={activeAgent()}
        fallback={
          // No staff yet means this is a first run — walk them in. Otherwise
          // they simply haven't picked a thread.
          <Show when={hasStaff()} fallback={<Onboarding />}>
            <div class="flex min-h-0 flex-1 items-center justify-center">
              <div class="flex max-w-sm flex-col items-center gap-3 text-center">
                <Mark class="h-8 w-auto opacity-40" />
                <div class="flex flex-col gap-1">
                  <p class="text-[13px] text-v2-text-text-base">
                    Select an agent to start
                  </p>
                  <p class="text-[12px] text-v2-text-text-muted">
                    They run on your machine, on your own model key.
                  </p>
                </div>
              </div>
            </div>
          </Show>
        }
      >
        {(agent) => (
          <>
            <header class="flex h-11 shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-3">
              <button
                type="button"
                onClick={() => setInfo(true)}
                aria-label="Agent profile"
                class="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-v2-overlay-simple-overlay-hover"
              >
                <Avatar name={agent().name} size={26} />
                <span class="flex min-w-0 flex-col">
                  <span class="truncate text-[12.5px] font-medium leading-4 text-v2-text-text-base">
                    {agent().name}
                  </span>
                  <Show
                    when={!activeWorking()}
                    fallback={
                      <span class="text-[10.5px] leading-3 text-v2-text-text-accent">
                        typing…
                      </span>
                    }
                  >
                    <span class="truncate text-[10.5px] leading-3 text-v2-text-text-weak">
                      {prettyRole(agent().role)}
                    </span>
                  </Show>
                </span>
              </button>

              <div class="flex-1" />

              <button
                type="button"
                onClick={() => setRoutines(true)}
                title="Scheduled work — what this agent does on its own"
                class="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
              >
                <Icon name="task" size="small" />
                Routines
              </button>

              <button
                type="button"
                onClick={() => actions.setRegister("work")}
                title="Open the work session — every tool this agent used"
                class="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
              >
                <Icon name="terminal" size="small" />
                Work
              </button>
            </header>

            <MessageList />
          </>
        )}
      </Show>

      <Show when={activeAgent() || hasStaff()}>
        <Composer />
      </Show>

      <Show when={info() && activeAgent()}>
        <AgentInfoModal agent={activeAgent()!} onClose={() => setInfo(false)} />
      </Show>

      <Show when={routines() && activeAgent()}>
        <RoutinesModal agent={activeAgent()!} onClose={() => setRoutines(false)} />
      </Show>
    </div>
  );
}

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

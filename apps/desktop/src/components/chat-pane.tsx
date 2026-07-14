import { createSignal, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Avatar } from "~/components/avatar";
import { Composer } from "~/components/composer";
import { Mark } from "~/components/logo";
import { MessageList } from "~/components/message-list";
import { Onboarding } from "~/components/onboarding";
import { RoutinesModal } from "~/components/routines-modal";
import { TaskStrip } from "~/components/task-state";
import { WorkFeed } from "~/components/work-panel";
import {
  actions,
  activeAgent,
  activeConversationId,
  activeWorking,
  state,
  tasksOfConversation,
} from "~/lib/store";

/**
 * The chat register.
 *
 * The header carries the agent's identity and its live state — working, or its
 * role — and opens its profile. The two controls beside it are the two things
 * you do with an agent that aren't talking: see what it does on a schedule
 * (Routines), and watch how it works rather than what it concluded (the
 * terminal view). That view is a lens on *this* conversation, not another
 * place — same thread, same composer, different rendering.
 */
export function ChatPane() {
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
                onClick={() => actions.openProfile(agent().id)}
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
                      <span class="aular-shimmer text-[10.5px] font-medium leading-3">
                        working…
                      </span>
                    }
                  >
                    <span class="truncate text-[10.5px] leading-3 text-v2-text-text-faint">
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

              {/* The lens. Same conversation, drawn as talk or as work. */}
              <button
                type="button"
                onClick={() => actions.toggleChatView()}
                aria-pressed={state.chatView === "work"}
                title={
                  state.chatView === "work"
                    ? "Back to the conversation"
                    : "Show the work — every tool this agent used"
                }
                class="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                classList={{
                  "bg-v2-overlay-simple-overlay-pressed text-v2-icon-icon-accent":
                    state.chatView === "work",
                  "text-v2-icon-icon-muted hover:text-v2-icon-icon-base":
                    state.chatView !== "work",
                }}
              >
                <Icon
                  name={state.chatView === "work" ? "speech-bubble" : "terminal"}
                  size="small"
                />
              </button>
            </header>

            {/* This conversation's live work, as chips — the spine surfacing. */}
            {(() => {
              const tasks = () => tasksOfConversation(activeConversationId() ?? "");
              return (
                <TaskStrip assigned={tasks().assigned} delegated={tasks().delegated} />
              );
            })()}

            <Show when={state.chatView === "chat"} fallback={<WorkFeed />}>
              <MessageList />
            </Show>
          </>
        )}
      </Show>

      <Show when={activeAgent() || hasStaff()}>
        <Composer />
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

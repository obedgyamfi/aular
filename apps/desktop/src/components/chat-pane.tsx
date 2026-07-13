import { Show } from "solid-js";

import { Composer } from "~/components/composer";
import { MessageList } from "~/components/message-list";
import { Mark } from "~/components/logo";
import { activeAgent, state } from "~/lib/store";

export function ChatPane() {
  return (
    <div class="flex min-h-0 flex-1 flex-col bg-v2-background-bg-base">
      <Show
        when={activeAgent()}
        fallback={
          <div class="flex min-h-0 flex-1 items-center justify-center">
            <div class="flex max-w-sm flex-col items-center gap-3 text-center">
              <Mark class="h-8 w-auto opacity-40" />
              <div class="flex flex-col gap-1">
                <p class="text-[13px] text-v2-text-text-base">
                  {state.agents.length ? "Select an agent to start" : "Create your first agent"}
                </p>
                <p class="text-[12px] text-v2-text-text-muted">
                  They run on your machine, on your own model key.
                </p>
              </div>
            </div>
          </div>
        }
      >
        {(agent) => (
          <>
            <div class="flex h-9 shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-4">
              <span class="text-[13px] font-medium text-v2-text-text-base">{agent().name}</span>
              <span class="text-[11px] text-v2-text-text-weak">{agent().role}</span>
            </div>
            <MessageList />
          </>
        )}
      </Show>
      <Composer />
    </div>
  );
}

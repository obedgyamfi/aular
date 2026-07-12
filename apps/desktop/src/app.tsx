import { createResource, Show } from "solid-js";

import { TitleBar } from "~/components/titlebar";
import { Rail } from "~/components/rail";
import { Sidebar } from "~/components/sidebar";
import { ChatPane } from "~/components/chat-pane";
import { api } from "~/lib/api";

/**
 * The window shell, laid out the way opencode's is: the titlebar spans the top
 * on the deep background, and everything below it sits in a single row — rail,
 * list, then the active pane.
 */
export function App() {
  const [health] = createResource(api.health);

  return (
    <div class="relative flex h-full min-h-0 min-w-0 flex-col bg-v2-background-bg-deep">
      <TitleBar engine={health()?.engine} />

      <main class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <Rail />
        <Sidebar maxAgents={health()?.max_agents} />
        <Show
          when={!health.error}
          fallback={
            <div class="flex flex-1 items-center justify-center bg-v2-background-bg-base px-8 text-center">
              <div class="flex max-w-sm flex-col gap-1">
                <p class="text-[13px] text-v2-text-text-base">
                  The agent backend isn't running.
                </p>
                <p class="text-[12px] text-v2-text-text-muted">
                  Start it with{" "}
                  <code class="font-mono">go run ./cmd/aular-core</code>
                </p>
              </div>
            </div>
          }
        >
          <ChatPane />
        </Show>
      </main>
    </div>
  );
}

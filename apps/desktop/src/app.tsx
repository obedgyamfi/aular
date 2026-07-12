import { createResource, Show } from "solid-js";

import { TitleBar } from "~/components/titlebar";
import { Rail } from "~/components/rail";
import { Sidebar } from "~/components/sidebar";
import { ChatPane } from "~/components/chat-pane";
import { api } from "~/lib/api";

/**
 * The window shell: title bar across the top, an icon rail and conversation
 * list on the left, the active pane filling the rest. This is the frame every
 * register (Chat, Work, Org) mounts into — it never re-renders when the pane
 * swaps.
 */
export function App() {
  // The backend reports which engine is linked, so the UI can present the
  // free shell honestly rather than dangling disabled paid features.
  const [health] = createResource(api.health);

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <TitleBar engine={health()?.engine} />

      <div class="flex min-h-0 flex-1">
        <Rail />
        <Sidebar maxAgents={health()?.max_agents} />
        <main class="flex min-h-0 min-w-0 flex-1 flex-col">
          <Show
            when={!health.error}
            fallback={
              <div class="flex flex-1 items-center justify-center px-8 text-center">
                <div class="flex max-w-sm flex-col gap-2">
                  <p style={{ color: "var(--aular-danger)" }}>
                    The agent backend isn't running.
                  </p>
                  <p class="text-xs" style={{ color: "var(--aular-text-muted)" }}>
                    Tauri starts it as a sidecar on launch. In a browser dev
                    session, start it yourself: <code>go run ./cmd/aular-core</code>
                  </p>
                </div>
              </div>
            }
          >
            <ChatPane />
          </Show>
        </main>
      </div>
    </div>
  );
}

import { createSignal, onMount, Show } from "solid-js";

import { AuthScreen } from "~/components/auth-screen";
import { ChatPane } from "~/components/chat-pane";
import { WorkPanel } from "~/components/work-panel";
import { OrgPanel } from "~/components/org-panel";
import { Rail } from "~/components/rail";
import { Sidebar } from "~/components/sidebar";
import { TitleBar } from "~/components/titlebar";
import { api } from "~/lib/api";
import { actions, state } from "~/lib/store";
import { onSidebarToggle, sidebarOpen } from "~/lib/window";

/**
 * The window shell.
 *
 * The account gate comes first: agents execute on this machine, but the
 * organization — who they are, what they know, how they're arranged — belongs
 * to the account, so nothing loads until we know whose org this is.
 */
export function App() {
  const [ready, setReady] = createSignal(false);
  const [showSidebar, setShowSidebar] = createSignal(sidebarOpen.value);
  onSidebarToggle(() => setShowSidebar(sidebarOpen.value));

  onMount(async () => {
    try {
      const user = await api.me();
      actions.setUser(user);
      await actions.load();
    } catch {
      // Not signed in — the auth screen takes it from here.
    } finally {
      setReady(true);
    }
  });

  const onAuthed = async (user: Parameters<typeof actions.setUser>[0]) => {
    actions.setUser(user);
    await actions.load();
  };

  return (
    <div class="relative flex h-full min-h-0 min-w-0 flex-col bg-v2-background-bg-deep">
      <TitleBar engine={state.health?.engine} />

      <main class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <Show when={ready()} fallback={<div class="flex-1 bg-v2-background-bg-base" />}>
          <Show when={state.user} fallback={<AuthScreen onAuthed={onAuthed} />}>
            <Rail />
            <Show when={state.register !== "org" && showSidebar()}>
              <Sidebar />
            </Show>

            {/* The chat pane stays mounted while you're elsewhere, so threads,
                drafts and scroll position survive switching — the prototype's
                behavior, and the reason registers feel instant. */}
            <div
              class="flex min-h-0 min-w-0 flex-1"
              classList={{ hidden: state.register !== "chat" }}
            >
              <ChatPane />
            </div>
            <Show when={state.register === "work"}>
              <WorkPanel />
            </Show>
            <Show when={state.register === "org"}>
              <OrgPanel />
            </Show>
          </Show>
        </Show>
      </main>
    </div>
  );
}

import { createSignal, onCleanup, onMount, Show } from "solid-js";

import { AddAgentModal } from "~/components/add-agent-modal";
import { AuthScreen } from "~/components/auth-screen";
import { CalendarPanel } from "~/components/calendar-panel";
import { ChatPane } from "~/components/chat-pane";
import { CommandPalette } from "~/components/command-palette";
import { ConfirmHost } from "~/components/confirm";
import { OrgPanel } from "~/components/org-panel";
import { Rail } from "~/components/rail";
import { SettingsPanel } from "~/components/settings-panel";
import { Sidebar } from "~/components/sidebar";
import { TitleBar } from "~/components/titlebar";
import { api } from "~/lib/api";
import { startNotifications } from "~/lib/notify";
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
  const [palette, setPalette] = createSignal(false);
  const [hiring, setHiring] = createSignal(false);
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

  onMount(() => onCleanup(startNotifications()));

  // ⌘K / Ctrl+K anywhere, including from inside the composer.
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (state.user) setPalette((p) => !p);
    }
  };
  document.addEventListener("keydown", onKeyDown);
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const onAuthed = async (user: Parameters<typeof actions.setUser>[0]) => {
    actions.setUser(user);
    await actions.load();
  };

  /** The sidebar is the chat list; the full-width registers don't want it. */
  const withSidebar = () => state.register === "chat" && showSidebar();

  return (
    <div class="relative flex h-full min-h-0 min-w-0 flex-col bg-v2-background-bg-deep">
      <TitleBar
        engine={state.health?.engine}
        onSearch={state.user ? () => setPalette(true) : undefined}
      />

      <main class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <Show when={ready()} fallback={<div class="flex-1 bg-v2-background-bg-base" />}>
          <Show when={state.user} fallback={<AuthScreen onAuthed={onAuthed} />}>
            <Rail />
            <Show when={withSidebar()}>
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
            <Show when={state.register === "org"}>
              <OrgPanel />
            </Show>
            <Show when={state.register === "calendar"}>
              <CalendarPanel />
            </Show>
            <Show when={state.register === "settings"}>
              <SettingsPanel />
            </Show>

            <Show when={palette()}>
              <CommandPalette
                onClose={() => setPalette(false)}
                onHire={() => setHiring(true)}
              />
            </Show>
            <Show when={hiring()}>
              <AddAgentModal onClose={() => setHiring(false)} />
            </Show>
          </Show>
        </Show>
      </main>

      {/* One host for every "are you sure?" in the app. */}
      <ConfirmHost />
    </div>
  );
}

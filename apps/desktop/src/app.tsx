import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";

import { AgentProfileModal } from "~/components/agent-profile-modal";
import { AuthScreen } from "~/components/auth-screen";
import { Backdrop } from "~/components/backdrop";
import { ResizeHandles } from "~/components/resize-handles";
import { SchedulesPanel } from "~/components/schedules-panel";
import { ChatPane } from "~/components/chat-pane";
import { CommandPalette } from "~/components/command-palette";
import { ConfirmHost } from "~/components/confirm";
import { OrgPanel } from "~/components/org-panel";
import { ProjectOverview } from "~/components/project-overview";
import { RoadmapPanel } from "~/components/roadmap-panel";
import { SettingsPanel } from "~/components/settings-panel";
import { ChannelSidebar } from "~/components/channel-sidebar";
import { CommunityRail } from "~/components/community-rail";
import { TitleBar } from "~/components/titlebar";
import { UserPanel } from "~/components/user-panel";
import { WorkBoard } from "~/components/work-board";
import { api } from "~/lib/api";
import { startNotifications } from "~/lib/notify";
import { actions, activeAgent, state } from "~/lib/store";
import { avatarColor } from "~/components/avatar";
import { settings } from "~/lib/settings";
import { accent, hasBackdrop, setAccent } from "~/theme/theme";
import { nudgeUiScale } from "~/lib/window";

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

  /**
   * Dynamic accenting: the app wears the colour of whoever you're talking to.
   *
   * The write is deliberately NOT remembered — it follows the selection turn by
   * turn, and persisting each hop would overwrite the fixed accent the user
   * actually chose. Switching the toggle off restores exactly that.
   */
  createEffect(() => {
    if (settings.dynamicAccent) {
      const a = activeAgent();
      if (a) setAccent(avatarColor(a.name), false);
    } else {
      setAccent(accent(), false);
    }
  });

  // ⌘K / Ctrl+K anywhere, including from inside the composer.
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (state.user) setPalette((p) => !p);
    }
  };
  // Ctrl/Cmd +/-/0 resize the UI. These used to live in the app menu; the menu
  // is gone, so without them there is no way to change the scale at all.
  const onZoomKeys = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const step =
      e.key === "=" || e.key === "+" ? "in" : e.key === "-" ? "out" : e.key === "0" ? "reset" : null;
    if (!step) return;
    e.preventDefault();
    nudgeUiScale(step);
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keydown", onZoomKeys);
  onCleanup(() => {
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keydown", onZoomKeys);
  });

  const onAuthed = async (user: Parameters<typeof actions.setUser>[0]) => {
    actions.setUser(user);
    await actions.load();
  };

  const profileAgent = () =>
    state.profileAgentId
      ? state.agents.find((a) => a.id === state.profileAgentId)
      : undefined;

  return (
    <div class="relative flex h-full min-h-0 min-w-0 flex-col bg-v2-background-bg-deep">
      {/* An undecorated window has no frame to grab, so the resize border is
          ours to draw. Above everything, including dialogs. */}
      <ResizeHandles />

      {/* On an accent theme the whole app sits on the constellation field: the
          panels go translucent (see ACCENT_SURFACES) and this reads through all
          of them, so the colour is the application's rather than one screen's
          decoration. The neutral themes stay opaque and never mount it. */}
      <Show when={hasBackdrop()}>
        <Backdrop fixed />
      </Show>

      <TitleBar engine={state.health?.engine} />

      <main class="relative z-10 flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--bg)]">
        <Show when={ready()} fallback={<div class="flex-1 bg-v2-background-bg-base" />}>
          <Show when={state.user} fallback={<AuthScreen onAuthed={onAuthed} />}>
            {/* Two tiers of navigation, as Discord does it: the 72px rail
                switches which org you're in — home, or one of your projects —
                and the sidebar beside it switches where you are inside it.
                Neither collapses — Discord's don't, and the sidebar is where
                your account lives now. */}
            {/* The two navigation columns, and the user panel floating across
                the bottom of both — which is why they share a positioned
                wrapper. The panel belongs to neither column: inside the sidebar
                it would be clipped to that column's width.

                Rail-coloured, so the sidebar's rounded top-left corner carves
                out of the rail the way Discord's does. The titlebar shares that
                colour too, which is what lets the corner read as one continuous
                surface instead of a notch. */}
            <div class="relative flex min-h-0 shrink-0 bg-[var(--rail)]">
              <CommunityRail />
              <ChannelSidebar onSearch={() => setPalette(true)} />
              <UserPanel />
            </div>

            {/* Welded, not floating: Discord runs its columns edge to edge, with
                the seams carried by colour alone — no gaps, no rounding, no
                deeper plane showing through.

                No background of its own: <main> already paints --bg, and on an
                accent theme that colour is translucent. Painting it again here
                (and a third time in ChatPane) stacked 72% over 72% over 72% and
                sealed the constellation field off completely. */}
            <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden border-t border-[var(--line)]">

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
              <div class="aular-rise flex min-h-0 min-w-0 flex-1"><WorkBoard /></div>
            </Show>
            {/* One panel, two doors: the sidebar's Org chart and Knowledge graph
                rows are the same surface opened on different tabs. */}
            <Show when={state.register === "org" || state.register === "knowledge"}>
              <div class="aular-rise flex min-h-0 min-w-0 flex-1"><OrgPanel /></div>
            </Show>
            {/* No builder chat docked beside these any more: AULAR sits at the
                top of the roster like any teammate, and you go to it — it isn't
                a panel that follows you around. Drafts it proposes still land
                here as ghosts, which is the part that mattered. */}
            <Show when={state.register === "overview"}>
              <div class="aular-rise flex min-h-0 min-w-0 flex-1"><ProjectOverview /></div>
            </Show>
            <Show when={state.register === "roadmap"}>
              <div class="aular-rise flex min-h-0 min-w-0 flex-1"><RoadmapPanel /></div>
            </Show>
            <Show when={state.register === "calendar"}>
              <div class="aular-rise flex min-h-0 min-w-0 flex-1"><SchedulesPanel /></div>
            </Show>
            </div>

            {/* The profile is a dialog over wherever you are, not a page you
                navigate to — you open it mid-conversation and closing it puts
                you straight back in the thread. */}
            <Show when={profileAgent()}>
              {(a) => (
                <AgentProfileModal agent={a()} onClose={() => actions.closeProfile()} />
              )}
            </Show>

            {/* Settings is a dialog too — same reasoning as the profile: you
                open it mid-thought, and closing returns you to your place. */}
            <Show when={state.settingsOpen}>
              <SettingsPanel onClose={() => actions.closeSettings()} />
            </Show>

            <Show when={palette()}>
              <CommandPalette
                onClose={() => setPalette(false)}
                onHire={() => actions.hireAgent()}
              />
            </Show>
          </Show>
        </Show>
      </main>

      {/* One host for every "are you sure?" in the app. */}
      <ConfirmHost />
    </div>
  );
}

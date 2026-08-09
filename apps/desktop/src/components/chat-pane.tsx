import { createMemo, createSignal, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";
import UserRound from "lucide-solid/icons/user-round";

import { AgentProfileAside } from "~/components/agent-profile-aside";
import { Avatar } from "~/components/avatar";
import { Composer } from "~/components/composer";
import { SystemTag } from "~/components/system-tag";
import { Tooltip } from "~/components/tooltip";
import { Mark } from "~/components/logo";
import { MessageList } from "~/components/message-list";
import { RoutinesModal } from "~/components/routines-modal";
import { TaskStrip } from "~/components/task-state";
import {
  actions,
  activeAgent,
  activeConversationId,
  activeWorking,
  state,
  tasksOfConversation,
} from "~/lib/store";

/** working | waiting (on a person) | idle — drives the header status pill. */
type ChatStatus = "working" | "waiting" | "idle";
const STATUS_PILL: Record<ChatStatus, { label: string; dot: string }> = {
  working: { label: "Working", dot: "var(--green)" },
  waiting: { label: "Waiting on you", dot: "var(--amber)" },
  idle: { label: "Idle", dot: "var(--faint)" },
};

/**
 * The chat register.
 *
 * A channel: a compact header naming the place, the timeline, and the composer.
 * The header carries the two things you do with an agent that aren't talking —
 * see what it runs on a schedule, and see who it is.
 */
export function ChatPane() {
  const [routines, setRoutines] = createSignal(false);
  // The profile panel is open by default, and the choice sticks. The storage
  // key still says "member-rail" from when this column held one — renaming it
  // would silently reset the preference for anyone who already set it.
  const [profileOpen, setProfileOpen] = createSignal(
    localStorage.getItem("aular-member-rail") !== "0",
  );
  const toggleProfile = () => {
    const next = !profileOpen();
    setProfileOpen(next);
    try {
      localStorage.setItem("aular-member-rail", next ? "1" : "0");
    } catch {
      /* private mode */
    }
  };

  /** The system agent ships with every account; staff is what you build. */
  const hasStaff = () => state.agents.some((a) => a.role !== "system");

  const status = createMemo<ChatStatus>(() => {
    if (activeWorking()) return "working";
    const { assigned } = tasksOfConversation(activeConversationId() ?? "");
    if (assigned.some((t) => t.state === "input-required")) return "waiting";
    return "idle";
  });

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <Show
        when={activeAgent()}
        fallback={
          // No thread picked yet. First-run setup and org building happen
          // elsewhere now — the onboarding gate, then the org canvas — so this
          // is just the empty conversation state.
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
        }
      >
        {(agent) => (
          <>
            {/* The channel header, Buzz's shape: one compact line — a leading
                glyph saying what kind of place this is, the name, a small live
                badge, then icon actions. No portrait, no role subtitle, no fat
                status pill: a channel is identified by its name, and the height
                that saves goes to the conversation. */}
            <header class="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[var(--line)] px-5">
              {/* Plain text, not a control. It was a button that opened the
                  profile, which meant a hover fill across the whole header and
                  a role that only appeared once you moused over it — motion for
                  something that never changes. The profile has its own toggle
                  two icons to the right. */}
              <div class="flex min-w-0 flex-1 items-center gap-2">
                {/* Everyone gets their face, AULAR included. It used to get a
                    hash and a lowercased name — the channel idiom — which said
                    "room" about the one teammate that builds the org for you. */}
                <span class="flex shrink-0 items-center">
                  <Avatar name={agent().name} size={24} circle />
                </span>
                <h1 class="shrink-0 truncate text-[16px] font-semibold leading-6 tracking-tight text-[var(--text)]">
                  {agent().name}
                </h1>
                {/* The system agent says what it is with a tag; a hire says it
                    with its role, after Discord's rule. */}
                <Show
                  when={agent().role === "system"}
                  fallback={
                    <>
                      <span aria-hidden="true" class="h-5 w-px shrink-0 bg-[var(--line)]" />
                      <span class="min-w-0 truncate text-[13px] leading-5 text-[var(--muted)]">
                        {prettyRole(agent().role)}
                      </span>
                    </>
                  }
                >
                  <SystemTag size="md" />
                </Show>
              </div>

              {/* Live state as a small badge, and only when there IS state. */}
              <Show when={status() !== "idle"}>
                <span class="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--pill)] bg-[var(--element)] px-2 py-[3px] text-[11px] font-semibold text-[var(--muted)]">
                  <span
                    class="size-[6px] rounded-full"
                    style={{ background: STATUS_PILL[status()].dot }}
                  />
                  {STATUS_PILL[status()].label}
                </span>
              </Show>

              <div class="flex shrink-0 items-center gap-1">
                <Tooltip label="Scheduled work" side="top">
                  <button
                    type="button"
                    onClick={() => setRoutines(true)}
                    aria-label="Routines"
                    class="grid size-8 place-items-center rounded-[var(--r2)] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
                  >
                    <Icon name="task" size="small" />
                  </button>
                </Tooltip>

                {/* Always the profile — AULAR is an agent like any other, and
                    the one thing worth showing beside a conversation is who
                    you're talking to. */}
                {(() => {
                  const label = () => (profileOpen() ? "Hide profile" : "Show profile");
                  return (
                    <Tooltip label={label()} side="top">
                      <button
                        type="button"
                        onClick={toggleProfile}
                        aria-pressed={profileOpen()}
                        aria-label="Profile"
                        class="grid size-8 place-items-center rounded-[var(--r2)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
                        classList={{
                          "bg-[var(--element)] text-[var(--text)]": profileOpen(),
                          "text-[var(--muted)]": !profileOpen(),
                        }}
                      >
                        <UserRound size={18} stroke-width={1.9} />
                      </button>
                    </Tooltip>
                  );
                })()}

              </div>
            </header>

            {/* This conversation's live work, as chips — the spine surfacing. */}
            {(() => {
              const tasks = () =>
                tasksOfConversation(activeConversationId() ?? "");
              return (
                <TaskStrip
                  assigned={tasks().assigned}
                  delegated={tasks().delegated}
                />
              );
            })()}

            <div class="flex min-h-0 min-w-0 flex-1">
              {/* The composer belongs to the conversation column, not to the
                  pane: the panel beside it runs the full height to the bottom,
                  so a composer spanning the whole width would slide underneath
                  it and put its controls in the panel's column. */}
              <div class="flex min-h-0 min-w-0 flex-1 flex-col">
                <MessageList />
                <Composer />
              </div>
              {/* Discord swaps this column by context — member list in a
                  channel, profile in a DM. We don't: every thread here is one
                  agent you're talking to — AULAR included — and its profile is
                  the same thing every other agent shows. A roster of everyone
                  belongs on the org chart, not beside a conversation. */}
              <Show when={profileOpen()}>
                <AgentProfileAside agent={agent()} onClose={toggleProfile} />
              </Show>
            </div>
          </>
        )}
      </Show>

      {/* With no thread open there's no column to sit in, so the composer spans
          the pane and simply invites you to pick someone. */}
      <Show when={!activeAgent() && hasStaff()}>
        <Composer />
      </Show>

      <Show when={routines() && activeAgent()}>
        <RoutinesModal
          agent={activeAgent()!}
          onClose={() => setRoutines(false)}
        />
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

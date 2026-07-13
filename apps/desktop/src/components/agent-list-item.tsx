import { Show } from "solid-js";

import { Avatar } from "~/components/avatar";
import { settingsActions } from "~/lib/settings";
import { agentWorking, state } from "~/lib/store";
import type { Agent } from "~/lib/types";

/**
 * A row in the chat list — ported from the prototype's AgentListItem.
 *
 * Reads like a messenger: avatar, name, the last message flattened to one clean
 * line, the time (clock today, date otherwise), an unread pill, and — while the
 * agent is actually working — animated dots and "typing…" in place of the
 * preview. Unread rows brighten, so pending work reads as new before you even
 * see the pill.
 */
export function AgentListItem(props: {
  agent: Agent;
  active: boolean;
  onClick: () => void;
}) {
  const agent = () => props.agent;
  const unread = () => state.unread[agent().id] ?? 0;
  const preview = () => state.preview[agent().id];
  const working = () => agentWorking(agent().id);
  const muted = () => settingsActions.isMuted(agent().id);

  // Unread and not open: brighter subtitle and time, like a real messenger.
  const isUnread = () => unread() > 0 && !props.active;

  const subtitle = () => {
    const p = preview();
    if (!p) return `${prettyRole(agent().role)} · ${agent().tone || "ready"}`;
    return (p.sender === "user" ? "You: " : "") + plainPreview(p.text);
  };

  const time = () => preview()?.at ?? agent().updated_at ?? "";

  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-current={props.active}
      class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-v2-overlay-simple-overlay-hover aria-[current=true]:bg-v2-overlay-simple-overlay-pressed"
    >
      <Avatar name={agent().name} size={32} />

      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <span class="flex min-w-0 items-center gap-1">
            <span class="truncate text-[12.5px] font-medium text-v2-text-text-base">
              {agent().name}
            </span>
            <Show when={muted()}>
              <span class="shrink-0 text-v2-text-text-weak" title="Muted">
                <MuteIcon />
              </span>
            </Show>
          </span>

          <Show when={time()}>
            <span
              class="shrink-0 text-[10.5px] tabular-nums"
              classList={{
                "text-v2-text-text-accent font-medium": isUnread(),
                "text-v2-text-text-weak": !isUnread(),
              }}
            >
              {listTime(time())}
            </span>
          </Show>
        </div>

        <div class="mt-0.5 flex items-center gap-2">
          <Show
            when={!working()}
            fallback={
              <span class="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[11.5px] text-v2-text-text-accent">
                <span class="flex items-center gap-0.5">
                  <TypingDot delay={0} />
                  <TypingDot delay={200} />
                  <TypingDot delay={400} />
                </span>
                typing…
              </span>
            }
          >
            <span
              class="min-w-0 flex-1 truncate text-[11.5px]"
              classList={{
                "text-v2-text-text-base font-medium": isUnread(),
                "text-v2-text-text-muted": !isUnread(),
              }}
            >
              {subtitle()}
            </span>
          </Show>

          <Show when={unread() > 0 && !working()}>
            <span
              class="flex h-[17px] min-w-[17px] shrink-0 items-center justify-center rounded-full bg-v2-background-bg-accent px-1 text-[10px] font-semibold text-v2-text-text-inverse"
              title={`${unread()} unread`}
            >
              {unread() > 99 ? "99+" : unread()}
            </span>
          </Show>
        </div>
      </div>
    </button>
  );
}

function TypingDot(props: { delay: number }) {
  return (
    <span
      class="size-1 animate-bounce rounded-full bg-v2-icon-icon-accent"
      style={{ "animation-duration": "1s", "animation-delay": `${props.delay}ms` }}
    />
  );
}

function MuteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Flatten a message to one clean line for the list — strip markdown syntax and
 * collapse whitespace, the way a messenger does. Raw markdown in a preview row
 * looks broken.
 */
function plainPreview(text: string): string {
  return text
    .replace(/\s*<<<AULAR_CHUNK>>>\s*/g, " ") // bubble-split markers
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links/images → label
    .replace(/[*_~]/g, "") // emphasis
    .replace(/^\s{0,3}(#{1,6}|[>\-+*])\s+/gm, "") // headings, quotes, bullets
    .replace(/\s+/g, " ")
    .trim();
}

/** Clock for today, short date otherwise. */
function listTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "numeric", day: "numeric" });
}

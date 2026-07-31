import { Show } from "solid-js";

import { Avatar } from "~/components/avatar";
import { agentWorking, state } from "~/lib/store";
import type { Agent } from "~/lib/types";

/**
 * A DM row, Discord's shape: a 32px circular portrait with a presence dot ringed
 * in the sidebar colour, the name, and a red unread badge.
 *
 * The second line is the *role*, which is Discord's activity line ("/help |
 * carl.gg") doing the job that matters here: a roster of seventeen agents is
 * unreadable when every row is just a name. What it is NOT is the last message —
 * that was tried, and three competing lines per agent turned the list into a
 * wall. A live agent's "working…" takes the line over while it runs, because
 * right-now beats what-it-is.
 */
export function AgentListItem(props: {
  agent: Agent;
  active: boolean;
  onClick: () => void;
}) {
  const agent = () => props.agent;
  const unread = () => state.unread[agent().id] ?? 0;
  const working = () => agentWorking(agent().id);

  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-current={props.active}
      class="group/dm mb-2 grid h-[46px] w-full grid-cols-[28px_1fr_auto] items-center gap-2 rounded-[var(--r1)] px-2 text-left transition-colors hover:bg-[var(--element-hover)] aria-[current=true]:bg-[var(--element-active)]"
    >
      <span class="relative">
        <Avatar name={agent().name} size={28} circle />
        <span
          class="absolute -bottom-0.5 -left-0.5 size-[10px] rounded-full border-[2px] border-[var(--sidebar)] transition-colors group-hover/dm:border-[var(--element-hover)]"
          style={{ background: working() ? "var(--green)" : "var(--faint)" }}
        />
      </span>

      <span class="min-w-0">
        <span
          class="mb-px block truncate text-[14px] font-medium leading-5 transition-colors group-hover/dm:text-[var(--text)]"
          classList={{
            "text-[var(--text)]": props.active || unread() > 0,
            "text-[var(--muted)]": !props.active && unread() === 0,
          }}
        >
          {agent().name}
        </span>
        <Show
          when={working()}
          fallback={
            <span class="block truncate text-[11px] leading-4 text-[var(--faint)]">
              {prettyRole(agent().role)}
            </span>
          }
        >
          <span class="flex items-center gap-[5px] leading-4">
            <span class="flex gap-[2px]">
              <TypeDot delay="0s" />
              <TypeDot delay=".2s" />
              <TypeDot delay=".4s" />
            </span>
            <span class="text-[10.5px] font-semibold text-[var(--green)]">working…</span>
          </span>
        </Show>
      </span>

      {/* Discord's unread badge: red, not neutral — it's a demand, not a stat. */}
      <Show when={unread() > 0}>
        <span class="grid h-4 min-w-4 place-items-center self-center rounded-[var(--pill)] bg-[var(--red)] px-1.5 text-[11px] font-bold text-white">
          {unread() > 99 ? "99+" : unread()}
        </span>
      </Show>
    </button>
  );
}

function prettyRole(role: string): string {
  if (role === "system") return "System";
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function TypeDot(props: { delay: string }) {
  return (
    <span
      class="size-1 rounded-full bg-[var(--green)]"
      style={{ animation: `typedot 1.2s infinite ${props.delay}` }}
    />
  );
}



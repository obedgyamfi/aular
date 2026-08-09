import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";

import { AgentListItem } from "~/components/agent-list-item";
import { Avatar } from "~/components/avatar";
import { SystemTag } from "~/components/system-tag";
import { actions, state, type Register } from "~/lib/store";
import type { Agent } from "~/lib/types";

/**
 * The pieces both sidebars are built from.
 *
 * Home and a project are different *places*, not different components: the rows
 * are the same shapes in both, only the contents change. Keeping them here is
 * what stops the two bodies drifting into two subtly different designs.
 */

/**
 * Discord's "Find or start a conversation" — a full-width pill at the top of
 * the column that opens the command palette.
 *
 * It sits here rather than in the titlebar because what you search for is
 * agents and channels, and this is the column that lists them.
 */
export function SearchPill(props: { placeholder: string; onOpen: () => void }) {
  return (
    // A fixed h-[52px], matching the chat header exactly — and fixed rather
    // than padded because the header is border-box (its rule lives INSIDE the
    // 52), while padding puts the rule on the outside. Padding alone left this
    // one sitting 1.2px lower than the header's, which is precisely the kind of
    // gap that reads as sloppy without being obvious.
    <div class="flex h-[52px] shrink-0 items-center border-b border-[var(--line)] px-3">
      <button
        type="button"
        onClick={props.onOpen}
        title="Search — ⌘K"
        class="flex h-7 w-full items-center gap-1.5 rounded-[var(--r1)] border border-[var(--line)] bg-[var(--rail)] px-1.5 text-left transition-colors hover:border-[var(--line-strong)] hover:brightness-110"
      >
        <Search size={14} stroke-width={2.2} class="flex-none text-[var(--faint)]" />
        <span class="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--faint)]">
          {props.placeholder}
        </span>
      </button>
    </div>
  );
}

/**
 * A surface row — Discord's Friends/Nitro/Shop shape: icon, label, and a filled
 * pill when you're on it. These are places, which is why they sit above the
 * conversations rather than among them.
 */
export function NavRow(props: {
  register: Register;
  label: string;
  icon: JSX.Element;
  badge?: number;
}) {
  const active = () => state.register === props.register;
  return (
    <button
      type="button"
      onClick={() => actions.setRegister(props.register)}
      aria-current={active()}
      class="group/nav mb-2 flex h-[36px] w-full items-center gap-3 rounded-[var(--r1)] px-2 text-left transition-colors hover:bg-[var(--element-hover)]"
      classList={{ "bg-[var(--element-active)]": active() }}
    >
      <span
        class="flex-none transition-colors"
        classList={{
          "text-[var(--text)]": active(),
          "text-[var(--muted)] group-hover/nav:text-[var(--text-2)]": !active(),
        }}
      >
        {props.icon}
      </span>
      <span
        class="min-w-0 flex-1 truncate text-[14px] font-medium leading-5 transition-colors group-hover/nav:text-[var(--text)]"
        classList={{ "text-[var(--text)]": active(), "text-[var(--muted)]": !active() }}
      >
        {props.label}
      </span>
      <Show when={(props.badge ?? 0) > 0}>
        <span class="grid h-4 min-w-4 flex-none place-items-center rounded-[var(--pill)] bg-[var(--red)] px-1.5 text-[11px] font-bold text-white">
          {props.badge! > 99 ? "99+" : props.badge}
        </span>
      </Show>
    </button>
  );
}

/** A collapsible group header, Slack's shape: chevron, caps label, hover +. */
export function Section(props: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  addLabel?: string;
  children: JSX.Element;
}) {
  return (
    <section class="group/section pb-2">
      {/* No fixed height: the padding defines this box. It used to carry h-6
          (24px) alongside 26px of vertical padding, so the bottom padding had
          nowhere to go and the first row hugged the label. */}
      <div class="flex items-center gap-1 pb-0.5 pl-2 pr-0.5 pt-[18px]">
        <button
          type="button"
          onClick={props.onToggle}
          aria-expanded={!props.collapsed}
          class="flex min-w-0 flex-1 items-center gap-1 rounded-[var(--r1)] py-0.5 pr-1 text-left transition-colors hover:text-[var(--text)]"
        >
          <span class="flex-none text-[var(--faint)]">
            <Show when={props.collapsed} fallback={<ChevronDown size={12} stroke-width={2.4} />}>
              <ChevronRight size={12} stroke-width={2.4} />
            </Show>
          </span>
          <span class="truncate text-[12px] font-semibold uppercase tracking-[0.02em] text-[var(--muted)]">
            {props.label}
          </span>
          <span class="flex-none text-[10.5px] text-[var(--faint)]">{props.count}</span>
        </button>
        <Show when={props.onAdd}>
          <button
            type="button"
            onClick={props.onAdd}
            title={props.addLabel}
            aria-label={props.addLabel}
            class="grid size-5 flex-none place-items-center rounded-[var(--r1)] text-[var(--faint)] opacity-0 transition-all hover:bg-[var(--element-hover)] hover:text-[var(--text)] focus-visible:opacity-100 group-hover/section:opacity-100"
          >
            <Plus size={14} stroke-width={2.2} />
          </button>
        </Show>
      </div>
      <Show when={!props.collapsed}>
        <div class="flex flex-col">{props.children}</div>
      </Show>
    </section>
  );
}

/**
 * The system agent, as a channel.
 *
 * No section header over it: there's exactly one, and a collapsible group
 * around a single row is furniture pretending to be structure. It sits between
 * the surfaces and the roster because that's what it is — a place you go, run
 * by someone you talk to.
 */
export function ChannelSection(props: { agents: Agent[]; hint?: string }) {
  return (
    <section class="flex flex-col pb-2">
      <For each={props.agents}>
        {(a) => (
          <ChannelRow
            name={a.name}
            hint={props.hint ?? "Build the org"}
            active={state.activeAgentId === a.id && state.register === "chat"}
            unread={state.unread[a.id] ?? 0}
            onClick={() => actions.openChat(a.id)}
          />
        )}
      </For>
    </section>
  );
}

/**
 * The roster — Discord's Direct Messages list, and the same in both places:
 * everyone at home, this project's team inside a project.
 */
export function AgentsSection(props: {
  label: string;
  agents: Agent[];
  collapsed: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  addLabel?: string;
  empty: string;
}) {
  return (
    <Section
      label={props.label}
      count={props.agents.length}
      collapsed={props.collapsed}
      onToggle={props.onToggle}
      onAdd={props.onAdd}
      addLabel={props.addLabel}
    >
      <For each={props.agents}>
        {(a) => (
          <AgentListItem
            agent={a}
            active={state.activeAgentId === a.id && state.register === "chat"}
            onClick={() => actions.openChat(a.id)}
          />
        )}
      </For>
      <Show when={!props.agents.length}>
        <p class="px-2 py-1.5 text-[11.5px] text-[var(--faint)]">{props.empty}</p>
      </Show>
    </Section>
  );
}

/**
 * The system agent's row.
 *
 * It used to be a bare `#` and a lowercased name, borrowed from Discord's
 * channel affordance. But AULAR is not a room — it's the teammate who builds
 * the organization, with a profile and a face like everyone else in the list
 * below. So it wears its portrait, its real name, and a SYSTEM tag that says
 * what kind of teammate it is. The tag does the work the hash was doing.
 */
export function ChannelRow(props: {
  name: string;
  hint?: string;
  active: boolean;
  unread: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-current={props.active}
      title={props.hint || props.name}
      class="group/ch mb-2 flex h-[36px] w-full items-center gap-2 rounded-[var(--r1)] px-2 text-left transition-colors hover:bg-[var(--element-hover)]"
      classList={{ "bg-[var(--element-active)]": props.active }}
    >
      <Avatar name={props.name} size={24} circle />
      <span
        class="min-w-0 truncate text-[15px] font-semibold leading-5 transition-colors group-hover/ch:text-[var(--text)]"
        classList={{
          "text-[var(--text)]": props.active || props.unread > 0,
          "text-[var(--muted)]": !props.active && props.unread === 0,
        }}
      >
        {props.name}
      </span>
      <SystemTag />
      <span class="flex-1" />
      <Show when={props.unread > 0}>
        <span class="grid h-4 min-w-4 flex-none place-items-center rounded-[var(--pill)] bg-[var(--red)] px-1.5 text-[11px] font-bold text-white">
          {props.unread > 99 ? "99+" : props.unread}
        </span>
      </Show>
    </button>
  );
}

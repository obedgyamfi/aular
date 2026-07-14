import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { actions, state, type Register } from "~/lib/store";

/**
 * The far-left rail. Icons match what each place IS: a speech bubble for
 * conversations, a task list for mission control, the org tree for the
 * organization, a drawn calendar (the icon set ships none) for schedules.
 * Hovering names the destination — an icon that needs guessing is a lock,
 * not a door.
 */
const REGISTERS: {
  id: Register;
  label: string;
  icon: () => JSX.Element;
}[] = [
  { id: "chat", label: "Chat", icon: () => <Icon name="speech-bubble" size="small" /> },
  { id: "work", label: "Work — every task, live", icon: () => <Icon name="task" size="small" /> },
  { id: "org", label: "Organization — chart, knowledge, hiring", icon: () => <Icon name="subagent" size="small" /> },
  { id: "calendar", label: "Calendar — routines & schedules", icon: () => <CalendarGlyph /> },
];

export function Rail() {
  return (
    <nav
      data-component="sidebar-rail"
      class="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-v2-border-border-muted bg-v2-background-bg-deep py-2"
    >
      <For each={REGISTERS}>
        {(reg) => (
          <RailButton
            label={reg.label}
            current={state.register === reg.id}
            onClick={() => actions.setRegister(reg.id)}
          >
            {reg.icon()}
          </RailButton>
        )}
      </For>

      <div class="flex-1" />

      <RailButton
        label="Settings"
        current={state.register === "settings"}
        onClick={() => actions.setRegister("settings")}
      >
        <Icon name="settings-gear" size="small" />
      </RailButton>
    </nav>
  );
}

/** An icon button with a named tooltip sliding out to the right. */
function RailButton(props: {
  label: string;
  current: boolean;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <div class="group relative">
      <button
        type="button"
        aria-label={props.label}
        aria-current={props.current}
        onClick={props.onClick}
        class="flex size-8 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base aria-[current=true]:bg-v2-overlay-simple-overlay-pressed aria-[current=true]:text-v2-icon-icon-accent"
      >
        {props.children}
      </button>
      <span
        role="tooltip"
        class="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-02 px-2 py-1 text-[11px] text-v2-text-text-base opacity-0 shadow-lg transition-opacity delay-150 group-hover:opacity-100"
      >
        {props.label}
      </span>
    </div>
  );
}

/** A calendar in the icon set's voice: 16×16, 1px currentColor stroke. */
function CalendarGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="10" stroke="currentColor" />
      <path d="M2.5 6.5H13.5" stroke="currentColor" />
      <path d="M5.5 2V4.5M10.5 2V4.5" stroke="currentColor" stroke-linecap="square" />
      <path d="M5 9H6.5M9.5 9H11M5 11.5H6.5" stroke="currentColor" />
    </svg>
  );
}

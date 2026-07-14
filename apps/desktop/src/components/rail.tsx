import { For } from "solid-js";
import type { JSX } from "solid-js";
import {
  CalendarDays,
  MessagesSquare,
  Network,
  Settings,
  SquareKanban,
} from "lucide-solid";

import { actions, state, type Register } from "~/lib/store";

/**
 * The far-left rail. Icons name what each place IS: conversations, the work
 * board, the org's shape, the schedule. They come from lucide (ISC) rather
 * than the design system's set, which ships no calendar, no board, and no
 * bell — hand-drawing those was a stopgap, not a vocabulary.
 *
 * Hovering names the destination: an icon that needs guessing is a lock, not
 * a door.
 */
const ICON = { size: 18, "stroke-width": 1.6 } as const;

const REGISTERS: {
  id: Register;
  label: string;
  icon: () => JSX.Element;
}[] = [
  { id: "chat", label: "Chat — talk to your agents", icon: () => <MessagesSquare {...ICON} /> },
  { id: "work", label: "Work — every task, live", icon: () => <SquareKanban {...ICON} /> },
  { id: "org", label: "Organization — chart, knowledge, hiring", icon: () => <Network {...ICON} /> },
  { id: "calendar", label: "Calendar — routines & schedules", icon: () => <CalendarDays {...ICON} /> },
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
        <Settings {...ICON} />
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

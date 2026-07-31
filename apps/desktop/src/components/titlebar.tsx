import { Show } from "solid-js";
import type { JSX } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  GanttChart,
  Hash,
  Network,
  SquareKanban,
  Users,
} from "lucide-solid";

import { WindowControls } from "~/components/window-controls";
import { actions, activeAgent, atHome, canGoBack, canGoForward, state } from "~/lib/store";

/**
 * The title bar: 38px, rail-coloured, working controls left, utility icons
 * right, and the empty runs are drag regions.
 *
 * No bottom border. Discord doesn't rule a line across the whole window here —
 * the titlebar shares the rail's colour and the columns below carve their own
 * edges out of it, so the only horizontal lines you see are the ones that
 * belong to a column. A full-width rule cut straight through that and made the
 * seams disagree.
 *
 * The centre names *where you are*, the way Discord's does ("Direct Messages").
 * It used to hold the brand mark, which is the one thing on screen that never
 * changes and so tells you nothing — and the app already says "Aular" on the
 * rail, in the window title, and on the icon in your dock.
 */
const HEIGHT = 38;
const isMac = navigator.userAgent.includes("Mac");

/** What the centre says, per surface. Chat names the conversation. */
function context(): { label: string; icon: JSX.Element } {
  const sz = { size: 13, "stroke-width": 2 } as const;
  switch (state.register) {
    case "org":
      return atHome()
        ? { label: "Org chart", icon: <Network {...sz} /> }
        : { label: "Team", icon: <Users {...sz} /> };
    case "knowledge":
      return { label: "Knowledge bank", icon: <BookOpen {...sz} /> };
    case "work":
      return {
        label: atHome() ? "Mission control" : "Work board",
        icon: <SquareKanban {...sz} />,
      };
    case "roadmap":
      return { label: "Roadmap", icon: <GanttChart {...sz} /> };
    case "calendar":
      return { label: "Schedules", icon: <CalendarDays {...sz} /> };
    case "overview":
      return { label: "Overview", icon: <ClipboardList {...sz} /> };
    default: {
      const a = activeAgent();
      if (!a) return { label: "Agents", icon: <Users {...sz} /> };
      return a.role === "system"
        ? { label: a.name.toLowerCase(), icon: <Hash {...sz} /> }
        : { label: a.name, icon: <Users {...sz} /> };
    }
  }
}

export function TitleBar(props: { engine?: string }) {
  return (
    <div
      data-slot="titlebar-v2"
      data-tauri-drag-region
      class="relative z-20 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-[var(--rail)]"
      style={{ height: `${HEIGHT}px`, "padding-left": isMac ? "84px" : "0" }}
    >
      {/* Every column carries data-tauri-drag-region of its own. Tauri's docs
          are explicit that the attribute "will only work on the element to
          which it is directly applied" — putting it only on this grid meant the
          three child columns covered the entire bar and the window could not be
          dragged anywhere. Buttons stay clickable precisely because they do NOT
          carry it. */}
      {/* Left: the working controls, compact. */}
      <div data-tauri-drag-region class="flex items-center gap-0.5 pl-1.5">
        {/* No search button: search is the pill at the top of the sidebar now,
            beside the agents and channels it actually searches. ⌘K still works
            from anywhere. */}
        <ToolbarButton
          label="Back"
          icon="arrow-left"
          disabled={!canGoBack()}
          onClick={() => actions.back()}
        />
        <ToolbarButton
          label="Forward"
          icon="arrow-right"
          disabled={!canGoForward()}
          onClick={() => actions.forward()}
        />
      </div>

      {/* Center: where you are. */}
      <div
        data-tauri-drag-region
        class="flex min-w-0 items-center justify-center gap-1.5 px-2"
      >
        <Show when={state.user}>
          <span class="flex-none text-[var(--muted)]">{context().icon}</span>
          <span class="min-w-0 truncate text-[12.5px] font-semibold text-[var(--text)]">
            {context().label}
          </span>
        </Show>
      </div>

      {/* Right: just the window. The theme switch moved to Settings ▸
          Appearance, and your account and notifications live in the sidebar's
          user panel — one home each. */}
      <div
        data-tauri-drag-region
        class="flex items-stretch justify-end self-stretch"
      >
        <Show when={!isMac}>
          <WindowControls />
        </Show>
      </div>
    </div>
  );
}

function ToolbarButton(props: {
  label: string;
  icon: "arrow-left" | "arrow-right";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      class="flex size-7 shrink-0 items-center justify-center rounded-[var(--r2)] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon name={props.icon} size="small" />
    </button>
  );
}

import { Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { AppMenu } from "~/components/app-menu";
import { Logo } from "~/components/logo";
import { WindowControls } from "~/components/window-controls";
import { actions, canGoBack, canGoForward } from "~/lib/store";
import { toggleSidebar } from "~/lib/window";

/**
 * The title bar, laid out like opencode's: the ☰ app menu, the sidebar toggle,
 * search, and back/forward on the left; the window controls hard right. The
 * empty middle is the drag region — grab anywhere and the window moves.
 *
 * Back and forward walk the view history — the registers and agents you've been
 * through — the same way a browser does.
 */
const HEIGHT = 36;
const isMac = navigator.userAgent.includes("Mac");

export function TitleBar(props: { engine?: string; onSearch?: () => void }) {
  return (
    <div
      data-slot="titlebar-v2"
      data-tauri-drag-region
      class="relative z-20 flex shrink-0 items-stretch bg-v2-background-bg-deep"
      style={{ height: `${HEIGHT}px`, "padding-left": isMac ? "84px" : "0" }}
    >
      {/* Left: brand, then menu + navigation */}
      <div class="flex shrink-0 items-center gap-0.5 px-1.5">
        <div data-tauri-drag-region class="flex items-center gap-2 pl-1.5 pr-2.5">
          <Logo size={14} />
          <span class="text-[12px] font-medium tracking-[0.12em] text-v2-text-text-base">
            AULAR
          </span>
        </div>
        <AppMenu />
        <ToolbarButton label="Toggle sidebar" icon="sidebar" onClick={toggleSidebar} />
        <ToolbarButton
          label="Search — ⌘K"
          icon="magnifying-glass"
          disabled={!props.onSearch}
          onClick={props.onSearch}
        />
        <span class="mx-1 h-4 w-px bg-v2-border-border-muted" />
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

      {/* The drag region: everything not a control. */}
      <div data-tauri-drag-region class="flex flex-1 items-center justify-end gap-3 px-3">
        <Show when={props.engine}>
          <span class="font-mono text-[11px] text-v2-text-text-weak">{props.engine}</span>
        </Show>
      </div>

      <Show when={!isMac}>
        <WindowControls />
      </Show>
    </div>
  );
}

function ToolbarButton(props: {
  label: string;
  icon: "sidebar" | "magnifying-glass" | "arrow-left" | "arrow-right";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      class="flex size-7 shrink-0 items-center justify-center rounded text-v2-icon-icon-base transition-colors hover:bg-v2-overlay-simple-overlay-hover disabled:text-v2-icon-icon-muted disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon name={props.icon} size="small" />
    </button>
  );
}

/**
 * Minimize / maximize / close.
 *
 * On Windows and Linux opencode lets the OS supply these (native frame, or
 * Electron's titleBarOverlay). Tauri has no overlay equivalent, so with
 * decorations off we draw them — at the standard 46×36 hit area, with the
 * conventional hover treatment: neutral for minimize/maximize, red for close.
 */
import { windowControls } from "~/lib/window";

export function WindowControls() {
  return (
    <div class="flex shrink-0 items-stretch self-stretch">
      <Control label="Minimize" onClick={windowControls.minimize}>
        <rect x="3.5" y="7.5" width="9" height="1" fill="currentColor" />
      </Control>

      <Control label="Maximize" onClick={windowControls.toggleMaximize}>
        <rect
          x="3.5"
          y="3.5"
          width="9"
          height="9"
          stroke="currentColor"
          fill="none"
        />
      </Control>

      <Control label="Close" danger onClick={windowControls.close}>
        <path
          d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"
          stroke="currentColor"
          stroke-linecap="square"
        />
      </Control>
    </div>
  );
}

function Control(props: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: any;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      class="flex w-[46px] items-center justify-center text-v2-icon-icon-base transition-colors"
      classList={{
        "hover:bg-v2-overlay-simple-overlay-hover": !props.danger,
        "hover:bg-[#c42b1c] hover:text-white": props.danger,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {props.children}
      </svg>
    </button>
  );
}

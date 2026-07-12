import { Show } from "solid-js";

// Window chrome, copied from opencode's titlebar: 36px tall, sitting on the
// deep background, drawn by us because the native decorations are off. The
// whole bar is a drag region except for the controls inside it.
const TITLEBAR_HEIGHT = 36;

export function TitleBar(props: { engine?: string }) {
  return (
    <div
      data-slot="titlebar-v2"
      data-tauri-drag-region
      class="relative z-20 flex shrink-0 items-center gap-2 bg-v2-background-bg-deep px-3"
      style={{ height: `${TITLEBAR_HEIGHT}px` }}
    >
      <div data-tauri-drag-region class="flex flex-1 items-center gap-2">
        <span class="text-[12px] font-medium text-v2-text-text-base">AULAR</span>
      </div>

      {/* The linked engine, stated plainly. The free shell says so rather than
          pretending to be something it isn't. */}
      <Show when={props.engine}>
        <span class="shrink-0 text-[11px] text-v2-text-text-muted">{props.engine}</span>
      </Show>
    </div>
  );
}

import { Show } from "solid-js";

/**
 * Custom window chrome. Tauri hides the native decorations (see
 * tauri.conf.json → decorations: false) so the title bar is ours to draw and
 * must declare its own drag region, or the window can't be moved.
 */
export function TitleBar(props: { engine?: string }) {
  return (
    <header
      data-tauri-drag-region
      class="flex h-10 shrink-0 items-center justify-between px-3"
      style={{
        background: "var(--aular-titlebar)",
        "border-bottom": "1px solid var(--aular-border-soft)",
      }}
    >
      <div data-tauri-drag-region class="flex items-center gap-2">
        <span
          class="flex size-5 items-center justify-center rounded text-[11px] font-semibold"
          style={{ background: "var(--aular-accent)", color: "var(--aular-on-accent)" }}
        >
          A
        </span>
        <span class="text-[12px]" style={{ color: "var(--aular-text-muted)" }}>
          AULAR
        </span>
      </div>

      {/* The linked engine, stated plainly. The free shell says so; it does not
          pretend to be something it isn't. */}
      <Show when={props.engine}>
        <span
          class="text-[11px]"
          style={{ color: "var(--aular-text-faint)" }}
          title="The backend engine linked into this build"
        >
          {props.engine}
        </span>
      </Show>
    </header>
  );
}

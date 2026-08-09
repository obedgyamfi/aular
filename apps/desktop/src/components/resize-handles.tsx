import { For } from "solid-js";

import { startResize, type ResizeEdge } from "~/lib/window";

/**
 * The window's resize border, drawn by us.
 *
 * An undecorated Tauri window keeps none of the frame the desktop would
 * normally give it, so there is nothing to grab: `decorations: false` removes
 * the resize edges along with the titlebar, and `resizable: true` cannot put
 * them back. Tauri's answer is `startResizeDragging(direction)` — the app
 * supplies the hit areas and the compositor does the rest.
 *
 * Eight of them: four edges and four corners, corners layered above so the
 * diagonal wins where they overlap. They sit at the very top of the stacking
 * order because the app paints edge to edge underneath; 6px is the usual
 * desktop grab width, wide enough to hit without swallowing clicks meant for
 * the scrollbar an edge away.
 */
const EDGES: { dir: ResizeEdge; cls: string; cursor: string }[] = [
  { dir: "North", cls: "top-0 left-0 right-0 h-[6px]", cursor: "ns-resize" },
  { dir: "South", cls: "bottom-0 left-0 right-0 h-[6px]", cursor: "ns-resize" },
  { dir: "West", cls: "left-0 top-0 bottom-0 w-[6px]", cursor: "ew-resize" },
  { dir: "East", cls: "right-0 top-0 bottom-0 w-[6px]", cursor: "ew-resize" },
  { dir: "NorthWest", cls: "top-0 left-0 size-[12px]", cursor: "nwse-resize" },
  { dir: "NorthEast", cls: "top-0 right-0 size-[12px]", cursor: "nesw-resize" },
  { dir: "SouthWest", cls: "bottom-0 left-0 size-[12px]", cursor: "nesw-resize" },
  { dir: "SouthEast", cls: "bottom-0 right-0 size-[12px]", cursor: "nwse-resize" },
];

export function ResizeHandles() {
  return (
    <For each={EDGES}>
      {(e) => (
        <div
          aria-hidden="true"
          onPointerDown={(ev) => {
            // Left button only — a right-click here belongs to the app.
            if (ev.button !== 0) return;
            ev.preventDefault();
            void startResize(e.dir);
          }}
          class={`fixed z-[100] ${e.cls}`}
          style={{ cursor: e.cursor }}
          classList={{ "z-[101]": e.dir.length > 5 }}
        />
      )}
    </For>
  );
}

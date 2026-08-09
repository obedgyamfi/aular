import { createSignal, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";

/**
 * Discord's tooltip: a dark flyout with an arrow, not the OS's `title=`.
 *
 * The native tooltip is unstyleable, arrives after a second of nothing, and in
 * an app whose controls are almost all icon-only that delay is the difference
 * between a rail you can read and one you have to memorize.
 *
 * It renders through a portal because the things that need it most — the rail's
 * tiles — live inside scrolling, clipping columns; positioned inline it would be
 * cropped by the very container it's trying to escape. Position is measured from
 * the trigger on open rather than tracked, since a tooltip whose anchor moves is
 * a tooltip that should have closed.
 */
type Side = "right" | "top";

const DELAY_MS = 120;

export function Tooltip(props: {
  label: string;
  side?: Side;
  /** Skip rendering entirely — for controls whose label is already visible. */
  disabled?: boolean;
  children: JSX.Element;
}) {
  const [at, setAt] = createSignal<{ x: number; y: number } | null>(null);
  let wrap: HTMLSpanElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const side = () => props.side ?? "right";

  const open = () => {
    if (props.disabled) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const el = wrap?.firstElementChild ?? wrap;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAt(
        side() === "right"
          ? { x: r.right + 12, y: r.top + r.height / 2 }
          : { x: r.left + r.width / 2, y: r.top - 10 },
      );
    }, DELAY_MS);
  };

  const close = () => {
    clearTimeout(timer);
    setAt(null);
  };

  onCleanup(close);

  return (
    <span
      ref={wrap}
      class="contents"
      onMouseEnter={open}
      onMouseLeave={close}
      onPointerDown={close}
      onFocusIn={open}
      onFocusOut={close}
    >
      {props.children}

      <Show when={at()}>
        {(pos) => (
          <Portal>
            <div
              role="tooltip"
              class="aular-pop pointer-events-none fixed z-[100] whitespace-nowrap rounded-[var(--r2)] bg-[var(--tooltip)] px-2.5 py-1.5 text-[13px] font-semibold leading-4 text-white shadow-[var(--shadow-2)]"
              style={
                side() === "right"
                  ? { left: `${pos().x}px`, top: `${pos().y}px`, transform: "translateY(-50%)" }
                  : {
                      left: `${pos().x}px`,
                      top: `${pos().y}px`,
                      transform: "translate(-50%, -100%)",
                    }
              }
            >
              {props.label}
              {/* The arrow, as a rotated square tucked under the card's edge. */}
              <span
                aria-hidden="true"
                class="absolute size-2 rotate-45 bg-[var(--tooltip)]"
                classList={{
                  "left-[-3px] top-1/2 -translate-y-1/2": side() === "right",
                  "bottom-[-3px] left-1/2 -translate-x-1/2": side() === "top",
                }}
              />
            </div>
          </Portal>
        )}
      </Show>
    </span>
  );
}

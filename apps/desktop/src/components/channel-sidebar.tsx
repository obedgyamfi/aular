import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import autoAnimate from "@formkit/auto-animate";

import { HomeBody } from "~/components/sidebar/home-body";
import { ProjectBody } from "~/components/sidebar/project-body";
import { SearchPill } from "~/components/sidebar/parts";
import { actions, activeProject, atHome, projectAgents, state } from "~/lib/store";

/**
 * The sidebar — Discord's second column.
 *
 * The rail picks the org you're in; this picks where you are inside it. Which
 * body it shows follows from that: at home you get the company (org chart,
 * knowledge, everyone), inside a project you get the project (its plan, its
 * cadence, its team). Both are the same shapes over different contents, which
 * is why they share `sidebar/parts`.
 *
 * Widths follow Discord: a 240px column, resizable 200–400.
 */
const WIDTH_KEY = "aular-channel-sidebar-width";
const COLLAPSED_KEY = "aular-channel-sections-collapsed";
const WIDTH_DEFAULT = 240; // Discord's channel column
const WIDTH_MIN = 200;
const WIDTH_MAX = 400;

export function ChannelSidebar(props: { onSearch: () => void }) {
  const [width, setWidth] = createSignal(readWidth());
  const [viewport, setViewport] = createSignal(window.innerWidth);
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>(readCollapsed());

  const toggle = (key: string) => {
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] };
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  };

  // Drag-to-resize on the right edge. Listeners live on the window so the drag
  // survives the cursor outrunning the 4px handle.
  //
  // The teardown is held here and registered with ONE component-scoped
  // onCleanup: calling onCleanup inside the pointer handler registers it
  // outside any reactive root, so Solid warns and never runs it — unmounting
  // mid-drag would leak both window listeners and a stuck col-resize cursor.
  let stopDrag: (() => void) | null = null;
  onCleanup(() => stopDrag?.());

  // Narrow the column on a small window instead of holding the saved width and
  // squeezing the conversation into a gutter. The stored preference is never
  // overwritten — widen the window and it comes straight back.
  const onResize = () => setViewport(window.innerWidth);
  window.addEventListener("resize", onResize);
  onCleanup(() => window.removeEventListener("resize", onResize));

  const effectiveWidth = createMemo(() =>
    Math.round(Math.max(WIDTH_MIN, Math.min(width(), viewport() * 0.38))),
  );

  const onGrab = (e: PointerEvent) => {
    e.preventDefault();
    stopDrag?.(); // never stack two drags
    const startX = e.clientX;
    const startW = width();

    const move = (ev: PointerEvent) => {
      setWidth(Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, startW + (ev.clientX - startX))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      stopDrag = null;
      persistWidth(width());
    };

    stopDrag = up;
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const scoped = createMemo(() => projectAgents());
  const system = createMemo(() => scoped().filter((a) => a.role === "system"));
  const staff = createMemo(() =>
    scoped()
      .filter((a) => a.role !== "system")
      .slice()
      .sort((a, b) => {
        const at = state.preview[a.id]?.at ?? a.updated_at ?? "";
        const bt = state.preview[b.id]?.at ?? b.updated_at ?? "";
        return bt.localeCompare(at);
      }),
  );

  const capped = () => {
    const max = state.health?.max_agents ?? 0;
    return max > 0 && staff().length >= max;
  };

  const title = () => (atHome() ? "Your Organization" : activeProject().name);

  return (
    <aside
      class="relative flex min-w-0 shrink-0 flex-col rounded-tl-[var(--r4)] border-l border-r border-t border-[var(--line)] bg-[var(--sidebar)]"
      style={{ width: `${effectiveWidth()}px` }}
    >
      <SearchPill
        placeholder={atHome() ? "Find an agent or channel" : `Search ${title()}`}
        onOpen={props.onSearch}
      />

      <div
        class="aular-hover-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-[60px]"
        ref={(el) => autoAnimate(el, { duration: 160, easing: "cubic-bezier(.2,0,0,1)" })}
      >
        <Show
          when={atHome()}
          fallback={
            <ProjectBody
              system={system()}
              team={staff()}
              projectName={title()}
              collapsed={collapsed()}
              onToggle={toggle}
              onStaff={() => actions.setRegister("overview")}
            />
          }
        >
          <HomeBody
            system={system()}
            staff={staff()}
            collapsed={collapsed()}
            onToggle={toggle}
            onHire={capped() ? undefined : () => actions.hireAgent()}
            hireLabel={capped() ? "Agent limit reached" : "Create an agent"}
          />
        </Show>
      </div>

      {/* The resize handle — a 4px hit area straddling the border. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={onGrab}
        onDblClick={() => {
          setWidth(WIDTH_DEFAULT);
          persistWidth(WIDTH_DEFAULT);
        }}
        class="absolute inset-y-0 -right-0.5 z-30 w-1 cursor-col-resize transition-colors hover:bg-[var(--accent)]"
      />

    </aside>
  );
}


function persistWidth(px: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(px));
  } catch {
    /* private mode */
  }
}

function readWidth(): number {
  const raw = Number(localStorage.getItem(WIDTH_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return WIDTH_DEFAULT;
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, raw));
}

function readCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

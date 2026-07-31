import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show, untrack } from "solid-js";
import { Clock, Maximize, Minus, Pencil, Plus, RotateCcw } from "lucide-solid";

import { Avatar, avatarColor } from "~/components/avatar";
import { defaultSkillsForRole } from "~/components/agent-capabilities";
import { userName } from "~/components/user-avatar";
import { buildOrgSpec, type OrgSpec, type WfNodeKind } from "~/lib/org-spec";
import {
  edgePath,
  FOUNDER_ID,
  layoutOrg,
  NODE_W,
  SCHED_H,
  SCHED_W,
  WF_H,
  WF_W,
  type LaidEdge,
  type LaidGraph,
  type LaidNode,
  type Pt,
} from "~/lib/org-layout";
import { actions, agentWorking, liveTasks, projectAgents, state } from "~/lib/store";
import type { ScheduleEntry } from "~/lib/schedules";

/**
 * The org canvas, spec-driven.
 *
 * It renders one thing: the ELK layout of a spec derived *live* from app state
 * (the roster, each agent's capabilities, and the workflows agents author). Every
 * real edit — a hire, a reporting change, a new workflow — re-derives the spec,
 * ELK re-lays it out, and the nodes glide to their new places. A pure function of
 * state; no hand-placed position math. The AULAR agent "patches the org" by
 * driving that state, and the canvas simply follows.
 */
type LayerId = "capabilities" | "operations" | "activity";
const LAYER_CHIPS: { id: LayerId; label: string; dot: string; hint: string }[] = [
  { id: "capabilities", label: "Capabilities", dot: "#4d7658", hint: "Tools and skills on each card" },
  { id: "operations", label: "Operations", dot: "var(--accent)", hint: "Every agent's schedules and workflows (off = only the focused one)" },
  { id: "activity", label: "Activity", dot: "var(--green)", hint: "Live work moving between agents" },
];

export function OrgGraph(props: {
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** The org's routines (loaded once by OrgPanel), folded into the spec so a
   *  focused agent's cadence shows on the canvas. */
  schedules?: ScheduleEntry[];
}) {
  // The spec is a live projection of app state — the single source of truth the
  // canvas renders. Any real edit (a hire, a reporting change, an agent-authored
  // workflow) flows through the stores below, re-derives here, and ELK reflows.
  const spec = createMemo(() =>
    buildOrgSpec({
      founderName: userName(),
      // Scoped, not global: inside a project this canvas IS the project's Team
      // row, and drawing the whole company there would make the row a lie. At
      // home the scope is every agent, so this is the same chart it always was.
      agents: projectAgents(),
      skillsOf: (a) => state.agentSkills[a.id] ?? defaultSkillsForRole(a.role),
      schedules: (props.schedules ?? []).flatMap((e) =>
        e.agentId ? [{ id: e.key, agent: e.agentId, cadence: e.cadence, does: e.name }] : [],
      ),
      workflows: state.workflows,
    }),
  );

  const [layers, setLayers] = createSignal<Record<LayerId, boolean>>({
    capabilities: true,
    operations: false,
    activity: true,
  });
  const on = (l: LayerId) => layers()[l];
  const toggleLayer = (l: LayerId) => setLayers((s) => ({ ...s, [l]: !s[l] }));
  const showOps = (agentId: string) => on("operations") || props.selected === agentId;

  // ELK is async: re-lay out whenever the spec, focus, or Operations changes.
  const [graph] = createResource<LaidGraph, { spec: OrgSpec; focus: string | null; ops: boolean; caps: boolean }>(
    () => ({ spec: spec(), focus: props.selected, ops: on("operations"), caps: on("capabilities") }),
    async ({ spec }) => await layoutOrg(spec, { showOps, showCaps: on("capabilities") }),
  );
  const nodeById = createMemo(() => new Map((graph()?.nodes ?? []).map((n) => [n.id, n])));

  // ── free drag ──────────────────────────────────────────────────────────────
  // Manual positions win over ELK; everything else still reflows. Overrides are
  // absolute node positions keyed by an agent/founder ref. An agent's schedules
  // and workflow shift by the SAME delta, so a dragged cluster stays intact and
  // its internal edges keep ELK's routing (just translated).
  // Drag positions persist per user (localStorage) so a nudged layout survives a
  // reload. Only these annotations live here — the roster itself persists via the
  // backend. Stale refs (e.g. a deleted agent) are simply ignored on load.
  const layoutKey = () => `aular-org-layout:${state.user?.id ?? "anon"}`;
  const readLayout = (): Record<string, Pt> => {
    try {
      const v = JSON.parse(localStorage.getItem(layoutKey()) || "{}");
      if (!v || typeof v !== "object") return {};
      const out: Record<string, Pt> = {};
      for (const [k, p] of Object.entries(v as Record<string, unknown>)) {
        const q = p as { x?: unknown; y?: unknown } | null;
        if (q && typeof q.x === "number" && typeof q.y === "number") out[k] = { x: q.x, y: q.y };
      }
      return out;
    } catch {
      return {};
    }
  };
  const [overrides, setOverrides] = createSignal<Record<string, Pt>>(readLayout());
  const [dragging, setDragging] = createSignal<string | null>(null);
  // Persist whenever the overrides change. The signal is initialised from storage
  // above, so the first run writes identical data — a no-op, never a clobber.
  createEffect(() => {
    const o = overrides();
    try {
      localStorage.setItem(layoutKey(), JSON.stringify(o));
    } catch {
      /* storage full or unavailable — the layout just won't persist */
    }
  });

  const ownerRefOf = (n: LaidNode): string =>
    n.kind === "agent" || n.kind === "founder"
      ? n.ref
      : n.kind === "wf"
        ? n.ref.split(":")[0] ?? ""
        : spec().schedules.find((s) => s.id === n.ref)?.agent ?? "";
  const deltaOf = (ref: string): Pt => {
    const ov = overrides()[ref];
    const base = nodeById().get(ref);
    return ov && base ? { x: ov.x - base.x, y: ov.y - base.y } : { x: 0, y: 0 };
  };
  const shiftOf = (n: LaidNode): Pt => deltaOf(ownerRefOf(n));
  const posOf = (n: LaidNode): Pt => {
    const s = shiftOf(n);
    return { x: n.x + s.x, y: n.y + s.y };
  };

  const centerOf = (n: LaidNode): Pt => {
    const p = posOf(n);
    return { x: p.x + n.w / 2, y: p.y + n.h / 2 };
  };

  // Structural edges are drawn as a clean curve between the source's bottom-centre
  // and the target's top-centre — the natural org-chart anchors. Both come from
  // posOf, so edges follow drags without any ELK-point bookkeeping; `edgePath`
  // curves them (vertical tangents for the top-down hierarchy).
  const edgeAnchors = (e: LaidEdge): { a: Pt; b: Pt } | null => {
    const from = nodeById().get(e.from);
    const to = nodeById().get(e.to);
    if (!from || !to) return null;
    const pf = posOf(from);
    const pt = posOf(to);
    return {
      a: { x: pf.x + from.w / 2, y: pf.y + from.h },
      b: { x: pt.x + to.w / 2, y: pt.y },
    };
  };

  // ── activity: live work moving between agents ──────────────────────────────
  // A delegation (a live task from one agent's thread to another's) draws a green
  // "packets flowing" edge from doer to doer. Derived from the task spine, gated
  // on the Activity lens, following drags via posOf. It's an OVERLAY only — never
  // fed to ELK — so live work never reshapes the org.
  const activityEdges = createMemo(() => {
    if (!on("activity")) return [];
    const byId = nodeById();
    const seen = new Set<string>();
    const out: { id: string; from: string; to: string }[] = [];
    for (const t of liveTasks()) {
      const from = state.agentOf[t.from_conversation_id];
      const to = t.to_agent_profile_id ?? state.agentOf[t.to_conversation_id];
      if (!from || !to || from === to || !byId.has(from) || !byId.has(to)) continue;
      const key = `${from}->${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: key, from, to });
    }
    return out;
  });

  const startNodeDrag = (ev: PointerEvent, node: LaidNode) => {
    ev.stopPropagation(); // a node drag must never pan the canvas
    const base = posOf(node);
    const sx = ev.clientX;
    const sy = ev.clientY;
    let moved = false;
    const move = (e: PointerEvent) => {
      if (!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 3) {
        moved = true;
        setDragging(node.ref);
      }
      if (!moved) return;
      const z = zoom();
      setOverrides((o) => ({
        ...o,
        [node.ref]: { x: base.x + (e.clientX - sx) / z, y: base.y + (e.clientY - sy) / z },
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(null);
      // A press with no drag is a click: focus agents (the founder isn't focusable).
      if (!moved && node.kind === "agent") props.onSelect(node.ref);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── viewport (pan / zoom) ────────────────────────────────────────────────
  let canvas: HTMLDivElement | undefined;
  const [pan, setPan] = createSignal<Pt>({ x: 0, y: 0 });
  const [zoom, setZoom] = createSignal(1);
  const [drag, setDrag] = createSignal<{ sx: number; sy: number; px: number; py: number } | null>(null);
  // The camera eases (a CSS transition on the world) for programmatic moves — a
  // fit, a focus — but snaps 1:1 while the user pans or zooms by hand.
  const [smoothCam, setSmoothCam] = createSignal(false);

  const onDown = (e: PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    setSmoothCam(false);
    setDrag({ sx: e.clientX, sy: e.clientY, px: pan().x, py: pan().y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const d = drag();
    if (d) setPan({ x: d.px + e.clientX - d.sx, y: d.py + e.clientY - d.sy });
  };
  const onUp = (e: PointerEvent) => {
    const d = drag();
    setDrag(null);
    // A click on empty canvas (no real drag) clears focus.
    if (d && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 4) props.onSelect(null);
  };
  const onWheel = (e: WheelEvent) => {
    setSmoothCam(false);
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.min(2, Math.max(0.4, z * (e.deltaY < 0 ? 1.08 : 0.93))));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };
  // Discrete zoom (the +/- buttons) eases like a fit does.
  const zoomBy = (f: number) => {
    setSmoothCam(true);
    setZoom((z) => Math.min(2, Math.max(0.4, z * f)));
  };

  // Fit a set of nodes into the canvas, centred, easing the camera there. Bounds
  // come from posOf so a dragged layout frames where things actually are.
  const frame = (nodes: LaidNode[], maxZoom = 1) => {
    if (!canvas || !nodes.length) return;
    const minX = Math.min(...nodes.map((n) => posOf(n).x)) - 48;
    const minY = Math.min(...nodes.map((n) => posOf(n).y)) - 48;
    const maxX = Math.max(...nodes.map((n) => posOf(n).x + n.w)) + 48;
    const maxY = Math.max(...nodes.map((n) => posOf(n).y + n.h)) + 48;
    const r = canvas.getBoundingClientRect();
    const z = Math.min(maxZoom, r.width / (maxX - minX), r.height / (maxY - minY));
    setSmoothCam(true);
    setZoom(z);
    setPan({ x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: (r.height - (maxY - minY) * z) / 2 - minY * z });
  };
  const fit = () => frame(graph()?.nodes ?? []);
  // Focusing an agent frames its cluster (the agent + its schedules + workflow)
  // and eases there — a calm zoom-to-fit, never a jump to a corner.
  const focusCluster = (id: string) => {
    const cluster = (graph()?.nodes ?? []).filter((n) => ownerRefOf(n) === id);
    frame(cluster.length ? cluster : graph()?.nodes ?? []);
  };

  onMount(() => {
    const wheelBlock = (e: WheelEvent) => {
      if ((e.ctrlKey || e.metaKey) && canvas?.contains(e.target as Node)) e.preventDefault();
    };
    document.addEventListener("wheel", wheelBlock, { passive: false });
    onCleanup(() => document.removeEventListener("wheel", wheelBlock));
  });

  // Frame the graph whenever it (re)lays out — fit the whole org, or ease to the
  // focused agent's cluster. We trigger on the layout itself (which already
  // changes on focus, via the resource) and read the rest untracked, so a node
  // drag never drags the camera along with it.
  createEffect(() => {
    const g = graph();
    if (!g) return;
    untrack(() => {
      const sel = props.selected;
      sel && nodeById().has(sel) ? focusCluster(sel) : fit();
    });
  });

  return (
    <div
      ref={canvas}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onWheel={onWheel}
      class="relative h-full w-full cursor-grab overflow-hidden rounded-[var(--r3)] border border-[var(--line)] active:cursor-grabbing"
      style={{
        "background-color": "var(--bg)",
        "background-image": "radial-gradient(var(--line) 1.2px, transparent 1.2px)",
        "background-size": "22px 22px",
        "touch-action": "none",
      }}
    >
      {/* controls */}
      <div class="absolute left-3 top-3 z-[5] flex items-center gap-1.5">
        <span class="inline-flex items-center gap-0.5 rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] p-0.5" style={{ "box-shadow": "var(--shadow-1)" }}>
          <IconBtn label="Zoom out" onClick={() => zoomBy(0.9)}>
            <Minus size={14} stroke-width={2} />
          </IconBtn>
          <span class="min-w-[38px] text-center text-[11px] font-semibold text-[var(--muted)]">{Math.round(zoom() * 100)}%</span>
          <IconBtn label="Zoom in" onClick={() => zoomBy(1.1)}>
            <Plus size={14} stroke-width={2} />
          </IconBtn>
        </span>
        <button type="button" onClick={fit} class="inline-flex items-center gap-1.5 rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] px-[11px] py-1.5 text-[11.5px] font-[650] text-[var(--text)] transition-colors hover:bg-[var(--element-hover)]" style={{ "box-shadow": "var(--shadow-1)" }}>
          <Maximize size={13} stroke-width={2} /> Fit
        </button>
        <Show when={Object.keys(overrides()).length > 0}>
          <button type="button" onClick={() => setOverrides({})} title="Return every node to its computed place" class="inline-flex items-center gap-1.5 rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] px-[11px] py-1.5 text-[11.5px] font-[650] text-[var(--text)] transition-colors hover:bg-[var(--element-hover)]" style={{ "box-shadow": "var(--shadow-1)" }}>
            <RotateCcw size={13} stroke-width={2} /> Reset layout
          </button>
        </Show>
      </div>

      {/* filter lenses */}
      <div class="absolute left-1/2 top-3 z-[5] flex -translate-x-1/2 items-center gap-1 rounded-[var(--r3)] border border-[var(--line-strong)] bg-[var(--surface)] py-1.5 pl-1 pr-1.5" style={{ "box-shadow": "var(--shadow-1)" }}>
        <span class="px-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--faint)]">Show</span>
        <For each={LAYER_CHIPS}>
          {(c) => (
            <button type="button" onClick={() => toggleLayer(c.id)} title={c.hint} aria-pressed={on(c.id)} class="inline-flex items-center gap-1.5 rounded-[var(--pill)] border px-2.5 py-[5px] text-[11.5px] font-semibold transition-colors" style={{ "border-color": on(c.id) ? "var(--line-strong)" : "var(--line)", background: on(c.id) ? "var(--element)" : "transparent", color: on(c.id) ? "var(--text)" : "var(--faint)" }}>
              <span class="size-[7px] rounded-full" style={{ background: c.dot, opacity: on(c.id) ? "1" : "0.4" }} />
              {c.label}
            </button>
          )}
        </For>
      </div>

      <Show when={graph.loading && !graph()}>
        <div class="absolute inset-0 grid place-items-center text-[12px] text-[var(--muted)]">Laying out…</div>
      </Show>

      {/* the world */}
      <div
        class="absolute left-0 top-0"
        style={{
          transform: `translate(${pan().x}px, ${pan().y}px) scale(${zoom()})`,
          "transform-origin": "0 0",
          transition: smoothCam() ? "transform 0.55s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
        }}
      >
        <svg width="6000" height="4000" class="pointer-events-none absolute left-0 top-0" style={{ overflow: "visible" }}>
          <defs>
            <marker id="og-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="3" orient="auto">
              <path d="M0 0 L6.5 3 L0 6 Z" fill="var(--line-strong)" />
            </marker>
            <marker id="og-arrow-crit" markerWidth="8" markerHeight="8" refX="6.5" refY="3" orient="auto">
              <path d="M0 0 L6.5 3 L0 6 Z" fill="var(--red)" />
            </marker>
          </defs>
          <For each={graph()?.edges ?? []}>
            {(e) => {
              const an = () => edgeAnchors(e);
              return (
                <Show when={an()}>
                  <EdgePath edge={e} a={an()!.a} b={an()!.b} dim={!!props.selected} />
                </Show>
              );
            }}
          </For>
          <For each={activityEdges()}>
            {(a) => {
              const pts = (): Pt[] | null => {
                const f = nodeById().get(a.from);
                const t = nodeById().get(a.to);
                return f && t ? [centerOf(f), centerOf(t)] : null;
              };
              return (
                <Show when={pts()}>
                  <path
                    d={edgePath(pts()!)}
                    fill="none"
                    stroke="var(--green)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-dasharray="2 9"
                    class="og-activity"
                    style={{ filter: "drop-shadow(0 0 2px var(--green-soft))" }}
                  />
                </Show>
              );
            }}
          </For>
        </svg>

        <For each={graph()?.nodes ?? []}>
          {(n) => (
            <Node
              laid={n}
              x={posOf(n).x}
              y={posOf(n).y}
              dragging={dragging() === ownerRefOf(n)}
              onDragStart={(e) => startNodeDrag(e, n)}
              spec={spec()}
              showCaps={on("capabilities")}
              selected={props.selected === n.ref}
              dimmed={!!props.selected && n.kind !== "wf" && n.kind !== "schedule" && props.selected !== n.ref}
            />
          )}
        </For>
      </div>
    </div>
  );
}

function EdgePath(props: { edge: LaidEdge; a: Pt; b: Pt; dim: boolean }) {
  const e = () => props.edge;
  const crit = () => e().when === "critical";
  const color = () => (e().kind === "schedule" ? "var(--accent)" : crit() ? "var(--red)" : "var(--line-strong)");
  return (
    <>
      <path
        d={edgePath([props.a, props.b])}
        fill="none"
        stroke={color()}
        stroke-width={e().kind === "report" ? "2" : "1.6"}
        stroke-dasharray={e().kind === "schedule" ? "3 4" : e().when ? "5 4" : undefined}
        marker-end={e().kind === "wf" ? (crit() ? "url(#og-arrow-crit)" : "url(#og-arrow)") : undefined}
        style={{ opacity: props.dim && e().kind === "report" ? "0.2" : e().kind === "schedule" ? "0.6" : "1", transition: "opacity 0.2s" }}
      />
      <Show when={e().when && e().when !== "critical" && e().when !== "else" ? false : e().when}>
        {(w) => (
          <text x={(props.a.x + props.b.x) / 2 + 8} y={(props.a.y + props.b.y) / 2} fill="var(--muted)" font-size="8.5" font-weight="700">
            {w()}
          </text>
        )}
      </Show>
    </>
  );
}

// ── nodes ────────────────────────────────────────────────────────────────────
function Node(props: {
  laid: LaidNode;
  x: number;
  y: number;
  dragging?: boolean;
  onDragStart?: (e: PointerEvent) => void;
  spec: OrgSpec | null;
  showCaps: boolean;
  selected: boolean;
  dimmed: boolean;
}) {
  return (
    <Show when={props.laid.kind === "founder"} fallback={<NonFounder {...props} />}>
      <div
        onPointerDown={props.onDragStart}
        class="absolute flex cursor-grab flex-col justify-center gap-2 rounded-[var(--r3)] px-3.5 active:cursor-grabbing"
        style={{ left: `${props.x}px`, top: `${props.y}px`, width: `${NODE_W}px`, height: `${props.laid.h}px`, background: "var(--text)", color: "var(--bg)", "box-shadow": "var(--shadow-2)", opacity: props.dimmed ? "0.3" : "1", transition: props.dragging ? "opacity 0.2s" : "opacity 0.2s, left 0.35s cubic-bezier(0,0,0.2,1), top 0.35s cubic-bezier(0,0,0.2,1)" }}
      >
        <div class="flex items-center gap-[11px]">
          <span class="grid size-[34px] place-items-center rounded-[9px] bg-[var(--bg)] text-[10px] font-bold text-[var(--text)]">YOU</span>
          <span class="min-w-0">
            <span class="block truncate text-[15px] font-semibold" style={{ "font-family": "var(--serif)" }}>{props.spec?.founder.name ?? "You"}</span>
            <span class="block text-[10.5px] opacity-70">{props.spec?.founder.role ?? "Founder · CEO"}</span>
          </span>
        </div>
      </div>
    </Show>
  );
}

function NonFounder(props: {
  laid: LaidNode;
  x: number;
  y: number;
  dragging?: boolean;
  onDragStart?: (e: PointerEvent) => void;
  spec: OrgSpec | null;
  showCaps: boolean;
  selected: boolean;
  dimmed: boolean;
}) {
  const motion = () =>
    props.dragging
      ? "opacity 0.2s, border-color 0.15s, box-shadow 0.2s"
      : "opacity 0.2s, border-color 0.15s, box-shadow 0.2s, left 0.35s cubic-bezier(0,0,0.2,1), top 0.35s cubic-bezier(0,0,0.2,1)";

  return (
    <Show when={props.laid.kind === "agent"} fallback={<OpsNode laid={props.laid} x={props.x} y={props.y} dragging={props.dragging} spec={props.spec} />}>
      {(() => {
        const agent = () => props.spec?.agents.find((a) => a.id === props.laid.ref);
        const working = () => agentWorking(props.laid.ref);
        return (
          <div
            onPointerDown={props.onDragStart}
            class="group absolute flex cursor-grab flex-col rounded-[var(--r3)] border-[1.5px] border-[var(--line)] bg-[var(--surface)] px-2.5 pb-[7px] pt-2 hover:border-[var(--accent)] active:cursor-grabbing"
            style={{
              left: `${props.x}px`,
              top: `${props.y}px`,
              width: `${NODE_W}px`,
              height: `${props.laid.h}px`,
              "border-color": working() || props.selected ? "var(--accent)" : undefined,
              "box-shadow": working() || props.selected ? "0 0 0 3px var(--accent-soft), var(--shadow-1)" : "var(--shadow-1)",
              opacity: props.dimmed ? "0.32" : "1",
              transition: motion(),
            }}
          >
            <div class="grid grid-cols-[30px_1fr_auto] items-center gap-[9px]">
              <Avatar name={agent()?.name ?? "?"} size={30} />
              <span class="min-w-0">
                <span class="flex items-center gap-1.5">
                  <span class="truncate text-[12.5px] font-[650] text-[var(--text)]">{agent()?.name}</span>
                  <span class="size-[7px] flex-none rounded-full" style={{ background: working() ? "var(--green)" : "var(--faint)" }} />
                </span>
                <span class="block truncate text-[10px] text-[var(--muted)]">{prettyRole(agent()?.role ?? "")}</span>
              </span>
              <button type="button" aria-label="Configure agent" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); actions.openProfile(props.laid.ref); }} class="grid size-6 place-items-center rounded-md text-[var(--faint)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]">
                <Pencil size={13} stroke-width={1.8} />
              </button>
            </div>
            <Show when={props.showCaps && agent()}>
              {(a) => (
                <div class="mt-1.5 flex flex-col gap-1 border-t border-[var(--line)] pt-1.5">
                  <Show when={[...a().tools, ...a().apps].length}>
                    <div class="flex flex-wrap items-center gap-1">
                      <For each={[...a().tools, ...a().apps].slice(0, 6)}>
                        {(t) => (
                          <span title={t} class="grid size-[17px] flex-none place-items-center rounded-[5px] text-[9px] font-bold text-white" style={{ background: avatarColor(t) }}>
                            {t.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                  <Show when={a().skills.length}>
                    <div class="flex flex-wrap items-center gap-1">
                      <For each={a().skills.slice(0, 2)}>
                        {(s) => <span class="max-w-[92px] truncate rounded-[var(--pill)] bg-[var(--blue-soft)] px-1.5 py-px text-[9px] font-[650] text-[var(--blue)]">{s}</span>}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </Show>
          </div>
        );
      })()}
    </Show>
  );
}

const WF_STYLE: Record<WfNodeKind, string> = {
  trigger: "var(--accent)",
  action: "var(--line-strong)",
  decision: "var(--line-strong)",
  delivery: "var(--red)",
  alert: "var(--red)",
  artifact: "var(--line-strong)",
};

function OpsNode(props: { laid: LaidNode; x: number; y: number; dragging?: boolean; spec: OrgSpec | null }) {
  const motion = () =>
    props.dragging ? "none" : "left 0.35s cubic-bezier(0,0,0.2,1), top 0.35s cubic-bezier(0,0,0.2,1)";

  return (
    <Show
      when={props.laid.kind === "schedule"}
      fallback={(() => {
        const [agentId, nodeId] = props.laid.ref.split(":");
        const wfn = () =>
          props.spec?.workflows.find((w) => w.owner === agentId)?.nodes.find((n) => n.id === nodeId);
        const color = () => WF_STYLE[wfn()?.kind ?? "action"];
        return (
          <div
            class="absolute flex flex-col justify-center rounded-[var(--r2)] border-[1.5px] bg-[var(--surface)] px-2"
            style={{ left: `${props.x}px`, top: `${props.y}px`, width: `${WF_W}px`, height: `${WF_H}px`, "border-color": color(), "box-shadow": "var(--shadow-1)", transition: motion() }}
          >
            <div class="flex items-center gap-1.5">
              <span class="size-[7px] flex-none rounded-full" style={{ background: color() }} />
              <span class="min-w-0 flex-1 truncate text-[10.5px] font-[650] text-[var(--text)]">{wfn()?.label}</span>
            </div>
            <span class="truncate pl-[13px] text-[8.5px] text-[var(--muted)]">{cap(wfn()?.kind ?? "")}</span>
          </div>
        );
      })()}
    >
      {(() => {
        const sched = () => props.spec?.schedules.find((s) => s.id === props.laid.ref);
        return (
          <button
            type="button"
            title="Opens Schedules"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => actions.setRegister("calendar")}
            class="absolute flex items-center gap-2 rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)] px-2 text-left transition-colors hover:border-[var(--accent)]"
            style={{ left: `${props.x}px`, top: `${props.y}px`, width: `${SCHED_W}px`, height: `${SCHED_H}px`, "box-shadow": "var(--shadow-1)", transition: motion() }}
          >
            <span class="grid size-[26px] flex-none place-items-center rounded-[7px] bg-[var(--accent-soft)] text-[var(--accent-text)]">
              <Clock size={14} stroke-width={1.8} />
            </span>
            <span class="min-w-0">
              <span class="block truncate text-[11.5px] font-[650] leading-[1.25] text-[var(--text)]">{sched()?.does || "Routine"}</span>
              <span class="block truncate text-[9.5px] text-[var(--muted)]">{sched()?.cadence}</span>
            </span>
          </button>
        );
      })()}
    </Show>
  );
}

function IconBtn(props: { label: string; onClick: () => void; children: any }) {
  return (
    <button type="button" aria-label={props.label} onClick={props.onClick} class="grid size-[26px] place-items-center rounded-[5px] text-[var(--text)] transition-colors hover:bg-[var(--element-hover)]">
      {props.children}
    </button>
  );
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function prettyRole(role: string): string {
  if (role === "system") return "System · Chief of Platform";
  return role.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

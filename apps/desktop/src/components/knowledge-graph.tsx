import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import Maximize from "lucide-solid/icons/maximize";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import X from "lucide-solid/icons/x";

import { Avatar, avatarColor } from "~/components/avatar";
import { tick, type ForceEdge, type ForceNode } from "~/lib/force";
import type { Agent, OrgDocument } from "~/lib/types";

/**
 * The knowledge graph — agents as suns, their documents in orbit.
 *
 * The organization's knowledge has two scopes and the canvas draws them as what
 * they are. A document written for one agent orbits that agent: it is their
 * specialization, and nobody else reads it. Org-wide documents gather at the
 * centre, drawn larger, with every agent bound to them.
 *
 * Positions are simulated rather than solved. A radial seed puts everything in
 * roughly the right place, then the forces let the arrangement find its own
 * shape — clusters push apart where the page has room, orbits tighten where it
 * doesn't, and dragging a node lets the whole graph rearrange around it.
 *
 * Agnostic about contents: N documents and M agents behave the same way. The
 * seed ring widens with the roster, and repulsion does the rest.
 */
const AGENT_R = 30;
const ORG_R = 26;
const DOC_R = 15;
/** Breathing room between the outermost general doc and the region's edge. Wide
 *  enough that a member's own label sits inside the boundary rather than on it. */
const ZONE_PAD = ORG_R + 34;

type Kind = "agent" | "org" | "own";

export function KnowledgeGraph(props: {
  agents: Agent[];
  documents: OrgDocument[];
  onOpenDoc: (doc: OrgDocument) => void;
  onOpenAgent: (agent: Agent) => void;
  selectedId?: string | null;
}) {
  const [zoom, setZoom] = createSignal(0.85);
  const [pan, setPan] = createSignal({ x: 0, y: 0 });
  const [query, setQuery] = createSignal("");
  /** Positions, republished each tick. A fresh Map is how Solid learns of it. */
  const [places, setPlaces] = createSignal(new Map<string, { x: number; y: number }>());

  const orgDocs = createMemo(() => props.documents.filter((d) => !d.agent_profile_id));
  const ownDocs = createMemo(() => {
    const by = new Map<string, OrgDocument[]>();
    for (const d of props.documents) {
      if (!d.agent_profile_id) continue;
      (by.get(d.agent_profile_id) ?? by.set(d.agent_profile_id, []).get(d.agent_profile_id)!).push(d);
    }
    return by;
  });

  /** The graph's shape: what exists and what binds to what. */
  const graph = createMemo(() => {
    const items: { id: string; kind: Kind; agent?: Agent; doc?: OrgDocument }[] = [];
    const edges: ForceEdge[] = [];
    for (const d of orgDocs()) items.push({ id: d.id, kind: "org", doc: d });
    for (const a of props.agents) {
      items.push({ id: a.id, kind: "agent", agent: a });
      for (const d of ownDocs().get(a.id) ?? []) {
        items.push({ id: d.id, kind: "own", doc: d });
        edges.push({ from: a.id, to: d.id, rest: 62, strength: 0.08 });
      }
    }
    // Nothing anchors anything to the middle. Every agent does read every org
    // document, but expressing that as force made the canvas a wheel: the
    // agents ringed a centre they were tied to, and a node dragged clear crept
    // back. The tier is said by size and colour instead, which costs no
    // geometry.
    //
    // Org documents still need to hold together as a family, though — with no
    // edges at all they were pure repulsion particles, shoved outward by
    // everything and with nothing to bring them home. Threading them to each
    // other gives the group its own cohesion, no centre required.
    const org = orgDocs();
    for (let i = 1; i < org.length; i++) {
      edges.push({ from: org[i - 1]!.id, to: org[i]!.id, rest: 84, strength: 0.06 });
    }
    if (org.length > 2) {
      edges.push({ from: org[org.length - 1]!.id, to: org[0]!.id, rest: 84, strength: 0.06 });
    }
    return { items, edges };
  });

  // ── the simulation ────────────────────────────────────────────────────────
  // Kept off the reactive graph deliberately: it mutates sixty times a second,
  // and only the published positions need to be reactive.
  let sim: ForceNode[] = [];
  let raf = 0;

  createEffect(() => {
    const { items, edges } = graph();
    cancelAnimationFrame(raf);

    // Seeded near the middle and left to sort itself out. A ring seed placed
    // everything on a perfect circle and the forces, already near equilibrium,
    // largely kept it there — which looked composed rather than physical. The
    // scatter is hashed from the id rather than Math.random so a given
    // organization lays out the same way every time it is opened.
    const prev = new Map(sim.map((n) => [n.id, n]));
    sim = items.map((it) => {
      const was = prev.get(it.id);
      if (was) return { ...was, charge: chargeOf(it.kind) };
      // With no centre pull the seed is roughly where the layout stays, so this
      // sets the graph's footprint as much as the forces do: spread far enough
      // that repulsion isn't fighting a pile-up, tight enough that everything
      // fits on screen without zooming out to read it.
      const h = hash(it.id);
      const a = (h % 360) * (Math.PI / 180);
      const r = 50 + ((h >> 9) % 190);
      return {
        id: it.id,
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: 0,
        vy: 0,
        charge: chargeOf(it.kind),
      };
    });
    // The hub is a real body so agents have something to orbit, but it never
    // moves and nothing draws it.

    reheat();
  });

  onCleanup(() => cancelAnimationFrame(raf));

  /**
   * Run the simulation until it stops moving.
   *
   * Keeps going while a node is held, which is what makes a dragged agent tow
   * its documents: the pinned node follows the pointer and the springs on its
   * edges pull the rest along every frame. Without that the children sat still
   * until release and then teleported.
   *
   * The frame budget is a backstop, not the stop condition — a graph that never
   * quite settles must not hold a frame loop open for the whole session.
   */
  const reheat = () => {
    cancelAnimationFrame(raf);
    let frames = 0;
    const run = () => {
      const moved = tick(sim, graph().edges, {
        // The general-docs area is a place, not an outline over one: agents and
        // their documents get pushed out of it rather than drifting through.
        zone: { members: zoneMembers(), pad: ZONE_PAD },
      });
      setPlaces(new Map(sim.map((n) => [n.id, { x: n.x, y: n.y }])));
      frames += 1;
      if (nodeDrag || (moved > 0.6 && frames < 600)) raf = requestAnimationFrame(run);
    };
    run();
  };

  // ── search ────────────────────────────────────────────────────────────────
  // Highlight rather than filter: a document's meaning here is who it hangs
  // off, and hiding everything else destroys exactly that.
  const matches = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return null;
    const hit = new Set<string>();
    for (const it of graph().items) {
      const text = it.kind === "agent" ? it.agent!.name : it.doc!.title;
      if (text.toLowerCase().includes(q)) hit.add(it.id);
    }
    return hit;
  });
  const dimmed = (id: string) => {
    const m = matches();
    return !!m && !m.has(id);
  };

  /** Which nodes the general-docs region belongs to. */
  const zoneMembers = createMemo(() => new Set(orgDocs().map((d) => d.id)));

  /**
   * The circle round the org-wide documents — drawn from exactly the numbers
   * the simulation uses to keep everything else out of it, so the outline and
   * the exclusion can never disagree.
   */
  const orgRegion = createMemo(() => {
    const pts = orgDocs()
      .map((d) => places().get(d.id))
      .filter((p): p is { x: number; y: number } => !!p);
    if (pts.length < 2) return null;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const r = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) + ZONE_PAD;
    return { cx, cy, r };
  });

  // ── pan, zoom, drag ───────────────────────────────────────────────────────
  let surface: HTMLDivElement | undefined;
  const [panDrag, setPanDrag] = createSignal<{ x: number; y: number; px: number; py: number } | null>(null);
  /**
   * A held node, and how far it has travelled.
   *
   * `moved` is what separates a click from a drag. The node used to carry an
   * onClick alongside its onPointerDown, and it never fired: grabbing the
   * pointer for the drag means pointerup lands on the capturing element, not on
   * the button, so the browser never synthesises a click. Opening a document or
   * an agent is decided here instead, on release, by whether the pointer
   * actually went anywhere.
   */
  let nodeDrag: { id: string; x: number; y: number; moved: number; open: () => void } | null = null;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const p = pan();
    setPanDrag({ x: e.clientX, y: e.clientY, px: p.x, py: p.y });
    surface?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (nodeDrag) {
      const n = sim.find((s) => s.id === nodeDrag!.id);
      if (n) {
        const dx = (e.clientX - nodeDrag.x) / zoom();
        const dy = (e.clientY - nodeDrag.y) / zoom();
        n.x += dx;
        n.y += dy;
        nodeDrag.moved += Math.abs(dx) + Math.abs(dy);
        nodeDrag.x = e.clientX;
        nodeDrag.y = e.clientY;
      }
      return;
    }
    const d = panDrag();
    if (!d) return;
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
  };
  const endDrag = () => {
    const held = nodeDrag;
    if (held) {
      const n = sim.find((s) => s.id === held.id);
      if (n) n.pinned = false;
      nodeDrag = null;
      // A press that never travelled was someone asking to open the thing.
      if (held.moved < 4) held.open();
      else reheat();
    }
    setPanDrag(null);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(2.2, Math.max(0.2, z * (e.deltaY < 0 ? 1.08 : 0.93))));
  };

  const startNodeDrag = (e: PointerEvent, id: string, open: () => void) => {
    e.stopPropagation();
    e.preventDefault();
    const n = sim.find((s) => s.id === id);
    if (!n) return;
    n.pinned = true;
    nodeDrag = { id, x: e.clientX, y: e.clientY, moved: 0, open };
    // Capture so the pointer keeps reporting to us once it leaves the node,
    // but never let it decide whether the drag happens: it throws for a
    // pointer the browser no longer considers active, and losing the loop
    // below to that exception means a drag that moves nothing on screen.
    try {
      surface?.setPointerCapture(e.pointerId);
    } catch {
      /* stale pointer — the surface's own handlers still see the move */
    }
    // Keep ticking while held, so edges tow the neighbours along.
    reheat();
  };

  /**
   * Frame everything, wherever it has drifted to.
   *
   * Pans to the content's own centre rather than resetting to the origin.
   * Nothing holds the graph at the origin any more, so after some dragging the
   * middle of the canvas is just an arbitrary point — and this is the only way
   * back from having pushed a cluster off-screen.
   */
  const fit = () => {
    const pts = [...places().values()];
    if (!pts.length || !surface) return;
    const pad = 110;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const r = surface.getBoundingClientRect();
    const z = Math.min(
      2.2,
      Math.max(0.2, Math.min(r.width / (maxX - minX + pad * 2), r.height / (maxY - minY + pad * 2))),
    );
    setZoom(z);
    // The world is scaled about the canvas centre, so the offset that brings
    // the content's midpoint there is scaled too.
    setPan({ x: -((minX + maxX) / 2) * z, y: -((minY + maxY) / 2) * z });
  };

  const at = (id: string) => places().get(id) ?? { x: 0, y: 0 };

  return (
    <div
      ref={surface}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
      class="relative h-full w-full cursor-grab overflow-hidden rounded-[var(--r3)] border border-[var(--line)] active:cursor-grabbing"
      style={{
        "background-image": "radial-gradient(circle at 1px 1px, var(--line) 1px, transparent 0)",
        "background-size": "22px 22px",
      }}
    >
      {/* Search, over the canvas rather than above it — the canvas is the
          surface, and a toolbar band would steal height from it. */}
      <div class="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
        <div
          class="pointer-events-auto flex w-full max-w-[340px] items-center gap-2 rounded-[var(--pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5"
          style={{ "box-shadow": "var(--shadow-1)" }}
        >
          <Search size={14} stroke-width={2} class="shrink-0 text-[var(--muted)]" />
          <input
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Search knowledge"
            class="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
          />
          <Show when={query()}>
            <span class="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
              {matches()?.size ?? 0}
            </span>
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              class="grid size-5 shrink-0 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
            >
              <X size={12} stroke-width={2.4} />
            </button>
          </Show>
        </div>
      </div>

      <div class="absolute left-3 top-3 z-10 flex items-center gap-1.5">
        <span
          class="inline-flex items-center gap-0.5 rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] p-0.5"
          style={{ "box-shadow": "var(--shadow-1)" }}
        >
          <IconBtn label="Zoom out" onClick={() => setZoom((z) => Math.max(0.2, z * 0.9))}>
            <Minus size={14} stroke-width={2} />
          </IconBtn>
          <span class="min-w-[38px] text-center text-[11px] font-semibold text-[var(--muted)]">
            {Math.round(zoom() * 100)}%
          </span>
          <IconBtn label="Zoom in" onClick={() => setZoom((z) => Math.min(2.2, z * 1.1))}>
            <Plus size={14} stroke-width={2} />
          </IconBtn>
        </span>
        <button
          type="button"
          onClick={fit}
          class="inline-flex items-center gap-1.5 rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] px-[11px] py-1.5 text-[11.5px] font-[650] text-[var(--text)] transition-colors hover:bg-[var(--element-hover)]"
          style={{ "box-shadow": "var(--shadow-1)" }}
        >
          <Maximize size={13} stroke-width={2} /> Fit
        </button>
      </div>

      <div
        class="absolute left-1/2 top-1/2"
        style={{
          transform: `translate(${pan().x}px, ${pan().y}px) scale(${zoom()})`,
          "transform-origin": "center",
        }}
      >
        <svg
          class="pointer-events-none absolute overflow-visible"
          style={{ left: "0", top: "0", width: "1px", height: "1px" }}
          aria-hidden="true"
        >
          {/* The general-docs boundary, under everything. */}
          <Show when={orgRegion()}>
            {(reg) => (
              <circle
                cx={reg().cx}
                cy={reg().cy}
                r={reg().r}
                fill="var(--accent)"
                fill-opacity="0.04"
                stroke="var(--accent)"
                stroke-opacity="0.35"
                stroke-width="1.5"
                stroke-dasharray="7 6"
              />
            )}
          </Show>

          {/* Every edge here is ownership — an agent and something only they
              read. Org-wide documents have none: they belong to everyone, and
              sixteen spokes into a point said that worse than size and colour
              do. */}
          <For each={graph().edges}>
            {(e) => {
              const a = () => at(e.from);
              const b = () => at(e.to);
              const owner = () => props.agents.find((x) => x.id === e.from);
              const lit = () => {
                const m = matches();
                return !m || m.has(e.from) || m.has(e.to);
              };
              return (
                <line
                  x1={a().x}
                  y1={a().y}
                  x2={b().x}
                  y2={b().y}
                  stroke={owner() ? avatarColor(owner()!.name) : "var(--line)"}
                  stroke-width={1.4}
                  opacity={lit() ? 0.5 : 0.06}
                />
              );
            }}
          </For>
        </svg>

        {/* The region's name, riding its top edge. HTML rather than SVG text so
            it inherits the same type scale as every other label here. */}
        <Show when={orgRegion()}>
          {(reg) => (
            <span
              class="pointer-events-none absolute whitespace-nowrap rounded-[var(--pill)] border border-[var(--accent)]/40 bg-[var(--surface)] px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--accent-text)]"
              style={{
                left: `${reg().cx}px`,
                top: `${reg().cy - reg().r}px`,
                transform: "translate(-50%, -50%)",
              }}
            >
              General docs
            </span>
          )}
        </Show>

        <For each={graph().items}>
          {(it) => (
            <Show
              when={it.kind === "agent"}
              fallback={
                <DocNode
                  doc={it.doc!}
                  org={it.kind === "org"}
                  pos={at(it.id)}
                  hit={!!matches()?.has(it.id)}
                  dim={dimmed(it.id)}
                  selected={props.selectedId === it.id}
                  onDrag={(e) => startNodeDrag(e, it.id, () => props.onOpenDoc(it.doc!))}
                />
              }
            >
              <AgentNode
                agent={it.agent!}
                pos={at(it.id)}
                count={ownDocs().get(it.id)?.length ?? 0}
                dim={dimmed(it.id)}
                selected={props.selectedId === it.id}
                onDrag={(e) => startNodeDrag(e, it.id, () => props.onOpenAgent(it.agent!))}
              />
            </Show>
          )}
        </For>
      </div>

      <Show when={!props.documents.length && !props.agents.length}>
        <div class="absolute inset-0 grid place-items-center text-[12.5px] text-[var(--muted)]">
          Nothing to map yet.
        </div>
      </Show>
    </div>
  );
}

/**
 * How hard a node pushes its neighbours away.
 *
 * Balanced against the spring constants below, not chosen for feel: repulsion
 * falls off as 1/d² while a spring pulls linearly, so the equilibrium distance
 * is set by their ratio. Charges ten times these made the graph settle three
 * thousand units across — correct physics, useless picture, and Fit answered by
 * zooming to 25%.
 */
/**
 * The halo behind a selected node.
 *
 * A blurred gradient rather than a ring: the node already wears a coloured
 * outline for identity, so selection had to say something that outline doesn't.
 * Sits behind its sibling and never takes a pointer, so it cannot eat the click
 * that produced it. Runs both accent stops, so it follows the theme — and the
 * agent's own colour when dynamic accenting is on.
 */
function SelectionGlow(props: { on: boolean; inset: number }) {
  return (
    <Show when={props.on}>
      <span
        aria-hidden="true"
        class="pointer-events-none absolute rounded-full"
        style={{
          inset: `${props.inset}px`,
          background:
            "conic-gradient(from 210deg, var(--accent), var(--accent-2), var(--accent))",
          filter: "blur(7px)",
          animation: "aular-glow 2.6s ease-in-out infinite",
        }}
      />
    </Show>
  );
}

function prettyRole(role: string): string {
  if (role === "system") return "System";
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** A stable number from an id — the scatter has to be the same every launch. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function chargeOf(kind: Kind): number {
  return kind === "agent" ? 340 : kind === "org" ? 280 : 150;
}

function AgentNode(props: {
  agent: Agent;
  pos: { x: number; y: number };
  count: number;
  dim: boolean;
  selected: boolean;
  onDrag: (e: PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={props.onDrag}
      title={props.agent.name}
      class="absolute flex cursor-grab flex-col items-center gap-1 transition-opacity active:cursor-grabbing hover:z-10"
      style={{
        left: `${props.pos.x}px`,
        top: `${props.pos.y}px`,
        transform: "translate(-50%, -50%)",
        opacity: props.dim ? "0.2" : "1",
      }}
    >
      <span class="relative grid place-items-center">
        <SelectionGlow on={props.selected} inset={-9} />
        <span
          class="relative grid place-items-center rounded-full p-[3px]"
          style={{
            background: "var(--surface)",
            "box-shadow": `0 0 0 1.5px ${avatarColor(props.agent.name)}`,
          }}
        >
          <Avatar name={props.agent.name} size={AGENT_R * 2 - 6} circle />
        </span>
      </span>
      {/* Name and role together. A canvas of bare first names tells you who is
          here but nothing about why any of them holds the documents it does. */}
      <span class="flex max-w-[132px] flex-col items-center rounded-[var(--r2)] bg-[var(--surface)]/85 px-1.5 leading-[13px]">
        <span class="whitespace-nowrap text-[11px] font-semibold text-[var(--text)]">
          {props.agent.name}
          <Show when={props.count}>
            <span class="pl-1 text-[10px] font-normal text-[var(--muted)]">{props.count}</span>
          </Show>
        </span>
        <span class="max-w-full truncate text-[9px] text-[var(--muted)]">
          {prettyRole(props.agent.role)}
        </span>
      </span>
    </button>
  );
}

function DocNode(props: {
  doc: OrgDocument;
  org: boolean;
  pos: { x: number; y: number };
  hit: boolean;
  dim: boolean;
  selected: boolean;
  onDrag: (e: PointerEvent) => void;
}) {
  const r = () => (props.org ? ORG_R : DOC_R);
  return (
    <button
      type="button"
      onPointerDown={props.onDrag}
      title={props.doc.title}
      class="absolute flex cursor-grab flex-col items-center gap-1 transition-opacity active:cursor-grabbing hover:z-10"
      style={{
        left: `${props.pos.x}px`,
        top: `${props.pos.y}px`,
        transform: "translate(-50%, -50%)",
        opacity: props.dim ? "0.15" : "1",
      }}
    >
      <span class="relative grid place-items-center">
        <SelectionGlow on={props.selected} inset={-8} />
        <span
          class="relative grid place-items-center rounded-full border transition-colors"
          classList={{
            "border-[var(--accent)] bg-[var(--accent-soft)]": props.selected || props.hit,
            "border-[var(--line-strong)] bg-[var(--surface)] hover:border-[var(--accent)]":
              !props.selected && !props.hit,
          }}
          style={{
            width: `${r() * 2}px`,
            height: `${r() * 2}px`,
            ...(props.hit && !props.selected ? { "box-shadow": "0 0 0 3px var(--accent-soft)" } : {}),
          }}
        >
          <span
            class="rounded-full"
            style={{
              width: `${r() * 0.55}px`,
              height: `${r() * 0.55}px`,
              background: props.org ? "var(--accent)" : "var(--muted)",
            }}
          />
        </span>
      </span>
      {/* Every document says its name. Hiding the specialization tier's labels
          traded the one thing you come here to read for tidiness — a canvas of
          anonymous dots. Org titles sit larger because those nodes are larger;
          the rest wrap to two lines and stop. */}
      <span
        class="line-clamp-2 max-w-[120px] rounded-[var(--r2)] bg-[var(--surface)]/85 px-1.5 text-center leading-[13px] text-[var(--text-2)]"
        classList={{
          "text-[10.5px] font-semibold": props.org,
          "text-[9.5px]": !props.org,
        }}
      >
        {props.doc.title}
      </span>
    </button>
  );
}

function IconBtn(props: { label: string; onClick: () => void; children: any }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      class="grid size-6 place-items-center rounded-[var(--r2)] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
    >
      {props.children}
    </button>
  );
}

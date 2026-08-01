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
/** The centre of the org-wide cluster: a coordinate every agent binds to, not
 *  a node anyone can click. */
const HUB = "__hub__";

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
      // One binding to the shared centre. Drawing a line to every org document
      // instead is agents x documents — 16 and 26 is 430 lines, a grey disc
      // that says nothing and costs a frame to paint.
      if (orgDocs().length) edges.push({ from: a.id, to: HUB, rest: 260, strength: 0.02 });
      for (const d of ownDocs().get(a.id) ?? []) {
        items.push({ id: d.id, kind: "own", doc: d });
        edges.push({ from: a.id, to: d.id, rest: 84, strength: 0.06 });
      }
    }
    // Org documents hold the middle: a short leash to the hub keeps the cluster
    // together while repulsion spaces its members.
    for (const d of orgDocs()) edges.push({ from: HUB, to: d.id, rest: 90, strength: 0.06 });
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

    // Seed radially. Random starts converge to the same place eventually but
    // spend the first second visibly untangling, which reads as jank rather
    // than physics.
    const prev = new Map(sim.map((n) => [n.id, n]));
    const agents = items.filter((i) => i.kind === "agent");
    const ring = Math.max(240, agents.length * 44);
    let ai = 0;
    sim = items.map((it) => {
      const was = prev.get(it.id);
      if (was) return { ...was, charge: chargeOf(it.kind) };
      let x = 0;
      let y = 0;
      if (it.kind === "agent") {
        const a = (ai++ / Math.max(agents.length, 1)) * Math.PI * 2 - Math.PI / 2;
        x = Math.cos(a) * ring;
        y = Math.sin(a) * ring;
      } else if (it.kind === "own") {
        const owner = items.find((o) => o.id === it.doc!.agent_profile_id);
        const oi = agents.indexOf(owner!);
        const a = (oi / Math.max(agents.length, 1)) * Math.PI * 2 - Math.PI / 2;
        x = Math.cos(a) * (ring + 90);
        y = Math.sin(a) * (ring + 90);
      } else {
        const i = orgDocs().findIndex((d) => d.id === it.id);
        const a = (i / Math.max(orgDocs().length, 1)) * Math.PI * 2;
        x = Math.cos(a) * 70;
        y = Math.sin(a) * 70;
      }
      return { id: it.id, x, y, vx: 0, vy: 0, charge: chargeOf(it.kind) };
    });
    // The hub is a real body so agents have something to orbit, but it never
    // moves and nothing draws it.
    sim.push({ id: HUB, x: 0, y: 0, vx: 0, vy: 0, charge: 0, pinned: true });

    let frames = 0;
    const run = () => {
      // A budget, not a convergence test alone: a graph that never quite
      // settles must not hold a frame loop open for the session.
      const moved = tick(sim, edges);
      setPlaces(new Map(sim.map((n) => [n.id, { x: n.x, y: n.y }])));
      frames += 1;
      if (moved > 0.6 && frames < 600) raf = requestAnimationFrame(run);
    };
    run();
  });

  onCleanup(() => cancelAnimationFrame(raf));

  /** Nudge the simulation awake — after a drag, or when someone asks. */
  const reheat = () => {
    cancelAnimationFrame(raf);
    let frames = 0;
    const run = () => {
      const moved = tick(sim, graph().edges);
      setPlaces(new Map(sim.map((n) => [n.id, { x: n.x, y: n.y }])));
      frames += 1;
      if (moved > 0.6 && frames < 600) raf = requestAnimationFrame(run);
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

  // ── pan, zoom, drag ───────────────────────────────────────────────────────
  let surface: HTMLDivElement | undefined;
  const [panDrag, setPanDrag] = createSignal<{ x: number; y: number; px: number; py: number } | null>(null);
  let nodeDrag: { id: string; x: number; y: number } | null = null;

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
        n.x += (e.clientX - nodeDrag.x) / zoom();
        n.y += (e.clientY - nodeDrag.y) / zoom();
        nodeDrag.x = e.clientX;
        nodeDrag.y = e.clientY;
        setPlaces(new Map(sim.map((s) => [s.id, { x: s.x, y: s.y }])));
      }
      return;
    }
    const d = panDrag();
    if (!d) return;
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
  };
  const endDrag = () => {
    if (nodeDrag) {
      const n = sim.find((s) => s.id === nodeDrag!.id);
      if (n) n.pinned = false;
      nodeDrag = null;
      reheat();
    }
    setPanDrag(null);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(2.2, Math.max(0.2, z * (e.deltaY < 0 ? 1.08 : 0.93))));
  };

  const startNodeDrag = (e: PointerEvent, id: string) => {
    e.stopPropagation();
    const n = sim.find((s) => s.id === id);
    if (!n) return;
    n.pinned = true;
    nodeDrag = { id, x: e.clientX, y: e.clientY };
    surface?.setPointerCapture(e.pointerId);
  };

  const fit = () => {
    const pts = [...places().values()];
    if (!pts.length || !surface) return;
    const pad = 110;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const r = surface.getBoundingClientRect();
    setZoom(
      Math.min(2.2, Math.max(0.2, Math.min(r.width / (maxX - minX + pad * 2), r.height / (maxY - minY + pad * 2)))),
    );
    setPan({ x: 0, y: 0 });
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
                  stroke-width={owner() ? 1.4 : 1}
                  opacity={lit() ? (owner() ? 0.5 : 0.3) : 0.06}
                />
              );
            }}
          </For>
        </svg>

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
                  onDrag={(e) => startNodeDrag(e, it.id)}
                  onOpen={() => props.onOpenDoc(it.doc!)}
                />
              }
            >
              <AgentNode
                agent={it.agent!}
                pos={at(it.id)}
                count={ownDocs().get(it.id)?.length ?? 0}
                dim={dimmed(it.id)}
                selected={props.selectedId === it.id}
                onDrag={(e) => startNodeDrag(e, it.id)}
                onOpen={() => props.onOpenAgent(it.agent!)}
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
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={props.onDrag}
      onClick={props.onOpen}
      title={props.agent.name}
      class="absolute flex cursor-grab flex-col items-center gap-1 transition-opacity active:cursor-grabbing hover:z-10"
      style={{
        left: `${props.pos.x}px`,
        top: `${props.pos.y}px`,
        transform: "translate(-50%, -50%)",
        opacity: props.dim ? "0.2" : "1",
      }}
    >
      <span
        class="grid place-items-center rounded-full p-[3px]"
        style={{
          background: props.selected ? avatarColor(props.agent.name) : "var(--surface)",
          "box-shadow": `0 0 0 1.5px ${avatarColor(props.agent.name)}`,
        }}
      >
        <Avatar name={props.agent.name} size={AGENT_R * 2 - 6} circle />
      </span>
      <span class="whitespace-nowrap rounded-[var(--r2)] bg-[var(--surface)]/85 px-1.5 text-[11px] font-semibold text-[var(--text)]">
        {props.agent.name}
        <Show when={props.count}>
          <span class="pl-1 text-[10px] font-normal text-[var(--muted)]">{props.count}</span>
        </Show>
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
  onOpen: () => void;
}) {
  const r = () => (props.org ? ORG_R : DOC_R);
  return (
    <button
      type="button"
      onPointerDown={props.onDrag}
      onClick={props.onOpen}
      title={props.doc.title}
      class="absolute flex cursor-grab flex-col items-center gap-1 transition-opacity active:cursor-grabbing hover:z-10"
      style={{
        left: `${props.pos.x}px`,
        top: `${props.pos.y}px`,
        transform: "translate(-50%, -50%)",
        opacity: props.dim ? "0.15" : "1",
      }}
    >
      <span
        class="grid place-items-center rounded-full border transition-colors"
        classList={{
          "border-[var(--accent)] bg-[var(--accent-soft)]": props.selected || props.hit,
          "border-[var(--line-strong)] bg-[var(--surface)] hover:border-[var(--accent)]":
            !props.selected && !props.hit,
        }}
        style={{
          width: `${r() * 2}px`,
          height: `${r() * 2}px`,
          ...(props.hit ? { "box-shadow": "0 0 0 3px var(--accent-soft)" } : {}),
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
      {/* A label per document is unreadable at a hundred nodes, so only the
          org tier and search hits carry one; the rest answer on hover. */}
      <Show when={props.org || props.hit}>
        <span class="max-w-[128px] truncate rounded-[var(--r2)] bg-[var(--surface)]/85 px-1.5 text-[10.5px] text-[var(--text-2)]">
          {props.doc.title}
        </span>
      </Show>
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

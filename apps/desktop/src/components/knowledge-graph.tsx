import { createMemo, createSignal, For, Show } from "solid-js";
import Maximize from "lucide-solid/icons/maximize";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";

import { Avatar, avatarColor } from "~/components/avatar";
import type { Agent, OrgDocument } from "~/lib/types";

/**
 * The knowledge graph — agents as suns, their documents as planets.
 *
 * The organization's knowledge has two scopes and the canvas draws them as
 * what they are. A document written for one agent orbits that agent: it is
 * their specialization, and nobody else reads it. A document written for the
 * organization sits at the centre, drawn larger, with a line to every agent —
 * because that is literally who reads it.
 *
 * Deliberately agnostic about how much of either exists. N org documents and M
 * agents with any number of their own each lay out the same way: the centre
 * cluster grows, the ring widens, the orbits pack tighter. Nothing here counts
 * on today's contents.
 *
 * Layout is computed, not solved. A radial arrangement is exactly expressible
 * in trigonometry, so there is no reason to hand it to a graph engine and hope
 * it finds the shape we already know we want.
 */
const AGENT_RADIUS = 34;
const ORG_RADIUS = 30;
const DOC_RADIUS = 17;
/** The centre of the org-wide cluster: where every agent's shared-knowledge
 *  line points. A coordinate, not a node. */
const ORG_HUB = "__org_hub__";

type Node =
  | { kind: "agent"; id: string; x: number; y: number; agent: Agent }
  | { kind: "doc"; id: string; x: number; y: number; doc: OrgDocument; scope: "org" | "own" };

export function KnowledgeGraph(props: {
  agents: Agent[];
  documents: OrgDocument[];
  onOpenDoc: (doc: OrgDocument) => void;
  onOpenAgent: (agent: Agent) => void;
  selectedId?: string | null;
}) {
  const [zoom, setZoom] = createSignal(0.9);
  const [pan, setPan] = createSignal({ x: 0, y: 0 });

  const orgDocs = createMemo(() => props.documents.filter((d) => !d.agent_profile_id));
  const docsOf = createMemo(() => {
    const by = new Map<string, OrgDocument[]>();
    for (const d of props.documents) {
      if (!d.agent_profile_id) continue;
      (by.get(d.agent_profile_id) ?? by.set(d.agent_profile_id, []).get(d.agent_profile_id)!).push(d);
    }
    return by;
  });

  /**
   * Everything's place, in one pass.
   *
   * The agent ring's radius grows with the roster so neighbours never collide,
   * and each agent's orbit grows with how much they know — a specialist with
   * twenty documents gets a wider orbit rather than twenty overlapping dots.
   */
  const layout = createMemo(() => {
    const agents = props.agents;
    const n = Math.max(agents.length, 1);
    const ringR = Math.max(230, n * 46);
    const nodes: Node[] = [];
    const edges: { id: string; from: string; to: string; scope: "org" | "own" }[] = [];

    // The centre: org-wide knowledge, in a cluster of its own.
    const org = orgDocs();
    const orgR = org.length <= 1 ? 0 : Math.max(50, org.length * 13);
    org.forEach((d, i) => {
      const a = (i / org.length) * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        kind: "doc",
        id: d.id,
        x: Math.cos(a) * orgR,
        y: Math.sin(a) * orgR,
        doc: d,
        scope: "org",
      });
    });

    agents.forEach((agent, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const ax = Math.cos(a) * ringR;
      const ay = Math.sin(a) * ringR;
      nodes.push({ kind: "agent", id: agent.id, x: ax, y: ay, agent });

      // Every agent reads every org document, but drawing that literally is
      // agents × documents lines — 16 and 26 is 416, a solid grey disc that
      // says nothing and costs a frame to paint. One line to the centre says
      // the same thing: this agent is bound to the shared knowledge, which
      // sits right there.
      if (org.length) {
        edges.push({ id: `${agent.id}-org`, from: agent.id, to: ORG_HUB, scope: "org" });
      }

      // Their own, orbiting them, facing away from the centre so the planets
      // never land on top of the ring they hang off.
      const own = docsOf().get(agent.id) ?? [];
      const orbit = Math.max(78, own.length * 16);
      own.forEach((d, j) => {
        const spread = Math.PI * 1.2;
        const t = own.length === 1 ? 0 : j / (own.length - 1) - 0.5;
        const ang = a + t * spread;
        nodes.push({
          kind: "doc",
          id: d.id,
          x: ax + Math.cos(ang) * orbit,
          y: ay + Math.sin(ang) * orbit,
          doc: d,
          scope: "own",
        });
        edges.push({ id: `${agent.id}-${d.id}`, from: agent.id, to: d.id, scope: "own" });
      });
    });

    // The hub is a coordinate, not a node — nothing to click, just the point
    // every agent's org line reaches toward.
    const byId = new Map<string, { x: number; y: number } | Node>(
      nodes.map((nd) => [nd.id, nd]),
    );
    byId.set(ORG_HUB, { x: 0, y: 0 });
    return { nodes, edges, byId };
  });

  // ── pan and zoom ──────────────────────────────────────────────────────────
  let surface: HTMLDivElement | undefined;
  const [drag, setDrag] = createSignal<{ x: number; y: number; px: number; py: number } | null>(null);

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const p = pan();
    setDrag({ x: e.clientX, y: e.clientY, px: p.x, py: p.y });
    surface?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const d = drag();
    if (!d) return;
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
  };
  const onUp = () => setDrag(null);
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(2, Math.max(0.25, z * (e.deltaY < 0 ? 1.08 : 0.93))));
  };

  /** Frame everything — the only reliable way back from a long drag. */
  const fit = () => {
    const ns = layout().nodes;
    if (!ns.length || !surface) {
      setPan({ x: 0, y: 0 });
      setZoom(0.9);
      return;
    }
    const pad = 90;
    const xs = ns.map((n) => n.x);
    const ys = ns.map((n) => n.y);
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
    const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
    const r = surface.getBoundingClientRect();
    setZoom(Math.min(2, Math.max(0.25, Math.min(r.width / w, r.height / h))));
    setPan({
      x: -((Math.max(...xs) + Math.min(...xs)) / 2),
      y: -((Math.max(...ys) + Math.min(...ys)) / 2),
    });
  };

  return (
    <div
      ref={surface}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={onWheel}
      class="relative h-full w-full cursor-grab overflow-hidden rounded-[var(--r3)] border border-[var(--line)] active:cursor-grabbing"
      style={{
        "background-image":
          "radial-gradient(circle at 1px 1px, var(--line) 1px, transparent 0)",
        "background-size": "22px 22px",
      }}
    >
      {/* Controls, matching the org chart's so the two canvases feel like one
          tool rather than two. */}
      <div class="absolute left-3 top-3 z-10 flex items-center gap-1.5">
        <span
          class="inline-flex items-center gap-0.5 rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] p-0.5"
          style={{ "box-shadow": "var(--shadow-1)" }}
        >
          <IconBtn label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z * 0.9))}>
            <Minus size={14} stroke-width={2} />
          </IconBtn>
          <span class="min-w-[38px] text-center text-[11px] font-semibold text-[var(--muted)]">
            {Math.round(zoom() * 100)}%
          </span>
          <IconBtn label="Zoom in" onClick={() => setZoom((z) => Math.min(2, z * 1.1))}>
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
        {/* Edges under everything, and never interactive: they describe the
            nodes rather than being things themselves. */}
        <svg
          class="pointer-events-none absolute overflow-visible"
          style={{ left: "0", top: "0", width: "1px", height: "1px" }}
          aria-hidden="true"
        >
          <For each={layout().edges}>
            {(e) => {
              const a = () => layout().byId.get(e.from);
              const b = () => layout().byId.get(e.to);
              return (
                <Show when={a() && b()}>
                  <line
                    x1={a()!.x}
                    y1={a()!.y}
                    x2={b()!.x}
                    y2={b()!.y}
                    stroke={
                      e.scope === "org"
                        ? "var(--line)"
                        : avatarColor((a() as Extract<Node, { kind: "agent" }>).agent.name)
                    }
                    stroke-width={e.scope === "org" ? 1 : 1.4}
                    opacity={e.scope === "org" ? 0.35 : 0.55}
                  />
                </Show>
              );
            }}
          </For>
        </svg>

        <For each={layout().nodes}>
          {(n) => (
            <Show
              when={n.kind === "agent"}
              fallback={
                <DocNode
                  node={n as Extract<Node, { kind: "doc" }>}
                  selected={props.selectedId === n.id}
                  onOpen={() => props.onOpenDoc((n as Extract<Node, { kind: "doc" }>).doc)}
                />
              }
            >
              <AgentNode
                node={n as Extract<Node, { kind: "agent" }>}
                selected={props.selectedId === n.id}
                count={docsOf().get(n.id)?.length ?? 0}
                onOpen={() => props.onOpenAgent((n as Extract<Node, { kind: "agent" }>).agent)}
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

/** An agent: the sun its own documents orbit. */
function AgentNode(props: {
  node: Extract<Node, { kind: "agent" }>;
  selected: boolean;
  count: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={props.onOpen}
      title={props.node.agent.name}
      class="absolute flex flex-col items-center gap-1 transition-transform hover:z-10"
      style={{
        left: `${props.node.x}px`,
        top: `${props.node.y}px`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <span
        class="grid place-items-center rounded-full transition-all"
        style={{
          padding: "3px",
          background: props.selected
            ? avatarColor(props.node.agent.name)
            : "var(--surface)",
          "box-shadow": `0 0 0 1.5px ${avatarColor(props.node.agent.name)}`,
        }}
      >
        <Avatar name={props.node.agent.name} size={AGENT_RADIUS * 2 - 6} circle />
      </span>
      <span class="whitespace-nowrap rounded-[var(--r2)] bg-[var(--surface)]/85 px-1.5 text-[11px] font-semibold text-[var(--text)]">
        {props.node.agent.name}
        <Show when={props.count}>
          <span class="pl-1 text-[10px] font-normal text-[var(--muted)]">{props.count}</span>
        </Show>
      </span>
    </button>
  );
}

/** A document. Org-wide ones are drawn larger — they are read by everyone. */
function DocNode(props: {
  node: Extract<Node, { kind: "doc" }>;
  selected: boolean;
  onOpen: () => void;
}) {
  const r = () => (props.node.scope === "org" ? ORG_RADIUS : DOC_RADIUS);
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={props.onOpen}
      title={props.node.doc.title}
      class="absolute flex flex-col items-center gap-1 hover:z-10"
      style={{
        left: `${props.node.x}px`,
        top: `${props.node.y}px`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <span
        class="grid place-items-center rounded-full border transition-colors"
        classList={{
          "border-[var(--accent)] bg-[var(--accent-soft)]": props.selected,
          "border-[var(--line-strong)] bg-[var(--surface)] hover:border-[var(--accent)]":
            !props.selected,
        }}
        style={{ width: `${r() * 2}px`, height: `${r() * 2}px` }}
      >
        <span
          class="rounded-full"
          style={{
            width: `${r() * 0.55}px`,
            height: `${r() * 0.55}px`,
            background:
              props.node.scope === "org" ? "var(--accent)" : "var(--muted)",
          }}
        />
      </span>
      <span
        class="max-w-[128px] truncate rounded-[var(--r2)] bg-[var(--surface)]/85 px-1.5 text-[10.5px] text-[var(--text-2)]"
        classList={{ "font-semibold": props.node.scope === "org" }}
      >
        {props.node.doc.title}
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

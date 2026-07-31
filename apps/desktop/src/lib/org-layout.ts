import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";

import type { OrgSpec, OrgAgent } from "./org-spec";

const elk = new ELK();

export type Pt = { x: number; y: number };

export const NODE_W = 196;
export const FOUNDER_H = 72;
/** An agent card with no capabilities shown: just the avatar row. */
export const AGENT_H = 48;
export const SCHED_W = 156;
export const SCHED_H = 54;
export const WF_W = 128;
export const WF_H = 42;
export const FOUNDER_ID = "__founder__";

/**
 * How tall an agent card is — it grows to fit the capabilities it actually shows,
 * so tool tiles and skill tags never spill past the border. Tools sit on one row;
 * long skill tags wrap one per row (capped at two). When the Capabilities lens is
 * off, the card is just its avatar row.
 */
export function agentNodeHeight(a: OrgAgent, showCaps: boolean): number {
  if (!showCaps) return AGENT_H;
  const hasTools = a.tools.length + a.apps.length > 0;
  const skillRows = Math.min(a.skills.length, 2);
  if (!hasTools && skillRows === 0) return AGENT_H;
  let extra = 13; // the divider + margins above the capabilities block
  if (hasTools) extra += 17; // one row of tool tiles
  if (skillRows > 0) extra += (hasTools ? 4 : 0) + skillRows * 15 + (skillRows - 1) * 4;
  return AGENT_H + extra;
}

export type LaidKind = "founder" | "agent" | "schedule" | "wf";
export interface LaidNode {
  id: string;
  kind: LaidKind;
  /** The spec id this node stands for (agent id, schedule id, `${agent}:${wfNode}`). */
  ref: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LaidEdge {
  id: string;
  kind: "report" | "schedule" | "wf";
  from: string;
  to: string;
  points: { x: number; y: number }[];
  when?: string;
}
export interface LaidGraph {
  nodes: LaidNode[];
  edges: LaidEdge[];
  width: number;
  height: number;
}

export interface ViewOpts {
  /** Whether an agent's schedules + workflow are drawn (focus or Operations-on). */
  showOps: (agentId: string) => boolean;
  /** Whether capability tiles/tags are shown (the Capabilities lens); the card
   *  grows to fit them. */
  showCaps: boolean;
}

export const wfNodeId = (agentId: string, nodeId: string) => `wf:${agentId}:${nodeId}`;

/**
 * Compile the spec into an ELK graph — the hierarchy plus each shown agent's
 * schedules and workflow, all in ONE graph — and let ELK place everything and
 * route the edges. The canvas renders straight from the result.
 */
export async function layoutOrg(spec: OrgSpec, view: ViewOpts): Promise<LaidGraph> {
  const children: ElkNode[] = [];
  const edges: ElkExtendedEdge[] = [];
  const meta = new Map<string, { kind: LaidKind; ref: string }>();
  const edgeKind = new Map<string, LaidEdge["kind"]>();
  const edgeWhen = new Map<string, string>();

  const node = (id: string, w: number, h: number, kind: LaidKind, ref: string) => {
    children.push({ id, width: w, height: h });
    meta.set(id, { kind, ref });
  };
  const edge = (id: string, from: string, to: string, kind: LaidEdge["kind"], when?: string) => {
    edges.push({ id, sources: [from], targets: [to] });
    edgeKind.set(id, kind);
    if (when) edgeWhen.set(id, when);
  };

  const agentIds = new Set(spec.agents.map((a) => a.id));
  node(FOUNDER_ID, NODE_W, FOUNDER_H, "founder", FOUNDER_ID);
  for (const a of spec.agents) node(a.id, NODE_W, agentNodeHeight(a, view.showCaps), "agent", a.id);
  for (const a of spec.agents) {
    const parent = a.reports_to && agentIds.has(a.reports_to) ? a.reports_to : FOUNDER_ID;
    edge(`r-${a.id}`, parent, a.id, "report");
  }

  for (const a of spec.agents) {
    if (!view.showOps(a.id)) continue;
    for (const s of spec.schedules.filter((x) => x.agent === a.id)) {
      const sid = `sc:${s.id}`;
      node(sid, SCHED_W, SCHED_H, "schedule", s.id);
      edge(`se-${s.id}`, sid, a.id, "schedule");
    }
    for (const wf of spec.workflows.filter((w) => w.owner === a.id)) {
      for (const n of wf.nodes) node(wfNodeId(a.id, n.id), WF_W, WF_H, "wf", `${a.id}:${n.id}`);
      const incoming = new Set(wf.edges.map((e) => e.to));
      for (const n of wf.nodes) {
        if (!incoming.has(n.id)) edge(`wr-${a.id}-${n.id}`, a.id, wfNodeId(a.id, n.id), "wf");
      }
      for (const e of wf.edges) {
        edge(`we-${a.id}-${e.from}-${e.to}`, wfNodeId(a.id, e.from), wfNodeId(a.id, e.to), "wf", e.when);
      }
    }
  }

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "36",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      "elk.layered.spacing.edgeNodeBetweenLayers": "26",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.edgeRouting": "SPLINES",
    },
    children,
    edges,
  };

  const res = await elk.layout(graph);

  const nodes: LaidNode[] = (res.children ?? []).map((c) => {
    const m = meta.get(c.id)!;
    return { id: c.id, kind: m.kind, ref: m.ref, x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 };
  });

  const laidEdges: LaidEdge[] = (res.edges ?? []).map((e) => {
    const pts: { x: number; y: number }[] = [];
    for (const s of e.sections ?? []) {
      if (s.startPoint) pts.push(s.startPoint);
      for (const b of s.bendPoints ?? []) pts.push(b);
      if (s.endPoint) pts.push(s.endPoint);
    }
    return {
      id: e.id,
      kind: edgeKind.get(e.id) ?? "report",
      from: e.sources?.[0] ?? "",
      to: e.targets?.[0] ?? "",
      points: pts,
      when: edgeWhen.get(e.id),
    };
  });

  return { nodes, edges: laidEdges, width: res.width ?? 0, height: res.height ?? 0 };
}

/**
 * A smooth Catmull-Rom spline through the routed points (start → bends → end).
 * Two points get a single eased cubic; three or more are threaded with a
 * tension-controlled curve. Collinear runs (ELK's straight verticals) stay
 * straight, while bends round off.
 */
export function edgePath(pts: Pt[], tension = 0.5): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) {
    const a = pts[0]!;
    const b = pts[1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Tangents along the dominant axis, so the curve bends the natural way:
    // vertical for a top-down hierarchy edge, horizontal for a sideways link.
    if (Math.abs(dy) >= Math.abs(dx)) {
      const k = dy * tension;
      return `M${a.x} ${a.y} C${a.x} ${a.y + k} ${b.x} ${b.y - k} ${b.x} ${b.y}`;
    }
    const k = dx * tension;
    return `M${a.x} ${a.y} C${a.x + k} ${a.y} ${b.x - k} ${b.y} ${b.x} ${b.y}`;
  }
  let d = `M${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    d +=
      ` C${p1.x + ((p2.x - p0.x) / 6) * tension} ${p1.y + ((p2.y - p0.y) / 6) * tension}` +
      ` ${p2.x - ((p3.x - p1.x) / 6) * tension} ${p2.y - ((p3.y - p1.y) / 6) * tension}` +
      ` ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * A small force simulation — enough physics for a knowledge graph, no more.
 *
 * Three forces, which is all a graph this shape needs: every node pushes every
 * other away, every edge pulls its ends toward a rest length, and everything
 * drifts weakly toward the origin so the whole thing can't wander off screen.
 * Velocity is damped each tick, so it settles instead of ringing forever.
 *
 * Written rather than imported. d3-force is the obvious dependency and it is
 * excellent, but it brings a module graph for three formulas we can state in
 * thirty lines, and the one thing we need that it makes awkward — pinning a
 * node under the pointer mid-drag — is a single boolean here.
 *
 * O(n²) on repulsion. At the scale a person can actually read — a few hundred
 * nodes — that is a few thousand cheap operations a frame, and a quadtree would
 * cost more in complexity than it saves in time.
 */
export interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** How hard this node pushes others away. Bigger nodes claim more room. */
  charge: number;
  /** Held in place — by the pointer, or because it anchors the layout. */
  pinned?: boolean;
}

export interface ForceEdge {
  from: string;
  to: string;
  /** What length this edge is happy at. */
  rest: number;
  /** 0–1. How insistently it pulls toward that length. */
  strength: number;
}

export interface ForceOptions {
  /** Pull toward the origin. Small — it frames, it shouldn't crush. */
  gravity?: number;
  damping?: number;
  /** Below this total movement the layout is done and the loop can stop. */
  settleAt?: number;
}

/**
 * Advance the simulation one tick, in place.
 *
 * Returns the total distance everything moved, so a caller can stop animating
 * once the graph has stopped changing rather than burning frames forever.
 */
export function tick(
  nodes: ForceNode[],
  edges: ForceEdge[],
  opts: ForceOptions = {},
): number {
  const gravity = opts.gravity ?? 0.012;
  const damping = opts.damping ?? 0.82;

  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Repulsion. Softened at very short range: two nodes that land exactly on
  // top of each other would otherwise divide by ~zero and fire off the canvas.
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        // Deterministic nudge rather than random, so layouts are reproducible.
        dx = (i % 2 ? 1 : -1) * 0.5;
        dy = (j % 2 ? 1 : -1) * 0.5;
        d2 = dx * dx + dy * dy;
      }
      const d = Math.sqrt(d2);
      const f = ((a.charge * b.charge) / d2) * 0.5;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  // Springs.
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const f = (d - e.rest) * e.strength;
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Gravity, damping, integrate.
  let moved = 0;
  for (const n of nodes) {
    if (n.pinned) {
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    n.vx -= n.x * gravity;
    n.vy -= n.y * gravity;
    n.vx *= damping;
    n.vy *= damping;
    n.x += n.vx;
    n.y += n.vy;
    moved += Math.abs(n.vx) + Math.abs(n.vy);
  }
  return moved;
}

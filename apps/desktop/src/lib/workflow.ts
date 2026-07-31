export type WorkflowNodeKind = "trigger" | "action" | "decision" | "artifact" | "delivery" | "alert";
export type WorkflowNodeStatus = "waiting" | "running" | "complete" | "attention" | "failed";

export interface WorkflowNode {
  id: string;
  label: string;
  kind: WorkflowNodeKind;
  status: WorkflowNodeStatus;
  owner?: string;
  detail?: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  label?: string;
  condition?: "standard" | "yes" | "no" | "critical";
}

export interface WorkflowArtifact {
  id: string;
  title: string;
  owner: string;
  schedule: string;
  status: "draft" | "ready" | "running" | "paused" | "complete" | "failed";
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowLayout {
  positions: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
}

/** Deterministic left-to-right DAG layout. Branch siblings occupy separate lanes. */
export function layoutWorkflow(workflow: WorkflowArtifact): WorkflowLayout {
  const depth = new Map(workflow.nodes.map((node) => [node.id, 0]));
  // A valid workflow is small. Repeated relaxation also handles edges supplied
  // out of order without coupling the renderer to the JSON's node ordering.
  for (let pass = 0; pass < workflow.nodes.length; pass++) {
    let changed = false;
    for (const edge of workflow.edges) {
      const next = Math.max(depth.get(edge.to) ?? 0, (depth.get(edge.from) ?? 0) + 1);
      if (next !== depth.get(edge.to)) {
        depth.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const columns = new Map<number, WorkflowNode[]>();
  for (const node of workflow.nodes) {
    const d = depth.get(node.id) ?? 0;
    const column = columns.get(d) ?? [];
    column.push(node);
    columns.set(d, column);
  }

  const maxDepth = Math.max(0, ...depth.values());
  const maxRows = Math.max(1, ...[...columns.values()].map((nodes) => nodes.length));
  const width = Math.max(700, 120 + maxDepth * 230 + 210);
  const height = Math.max(300, 120 + maxRows * 128);
  const positions: WorkflowLayout["positions"] = {};
  for (const [d, nodes] of columns) {
    const blockHeight = (nodes.length - 1) * 128;
    nodes.forEach((node, index) => {
      positions[node.id] = {
        x: 60 + d * 230,
        y: height / 2 - 38 - blockHeight / 2 + index * 128,
      };
    });
  }
  return { positions, width, height };
}

const START = "<<<AULAR_WORKFLOW>>>";
const END = "<<<END_AULAR_WORKFLOW>>>";
const BLOCK = /<<<AULAR_WORKFLOW>>>\s*([\s\S]*?)\s*<<<END_AULAR_WORKFLOW>>>/;

export function parseWorkflowArtifact(content: string): {
  text: string;
  workflow: WorkflowArtifact | null;
} {
  const match = BLOCK.exec(content);
  if (!match) return { text: content, workflow: null };

  try {
    const candidate = JSON.parse(match[1]!) as unknown;
    if (!isWorkflowArtifact(candidate)) return { text: content, workflow: null };
    const text = `${content.slice(0, match.index)}${content.slice(match.index + match[0].length)}`.trim();
    return { text, workflow: candidate };
  } catch {
    return { text: content, workflow: null };
  }
}

function isWorkflowArtifact(value: unknown): value is WorkflowArtifact {
  if (!isRecord(value)) return false;
  if (
    !isString(value.id) ||
    !isString(value.title) ||
    !isString(value.owner) ||
    !isString(value.schedule) ||
    !["draft", "ready", "running", "paused", "complete", "failed"].includes(String(value.status)) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    value.nodes.length === 0
  ) {
    return false;
  }

  const ids = new Set<string>();
  for (const node of value.nodes) {
    if (
      !isRecord(node) ||
      !isString(node.id) ||
      !isString(node.label) ||
      !["trigger", "action", "decision", "artifact", "delivery", "alert"].includes(String(node.kind)) ||
      !["waiting", "running", "complete", "attention", "failed"].includes(String(node.status)) ||
      ids.has(node.id)
    ) {
      return false;
    }
    ids.add(node.id);
  }

  for (const edge of value.edges) {
    if (!isRecord(edge) || !isString(edge.from) || !isString(edge.to)) return false;
    if (!ids.has(edge.from) || !ids.has(edge.to)) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const WORKFLOW_MARKERS = { start: START, end: END } as const;

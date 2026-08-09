import { createMemo, createSignal, For, Show } from "solid-js";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Clock3 from "lucide-solid/icons/clock-3";
import ExternalLink from "lucide-solid/icons/external-link";
import FileText from "lucide-solid/icons/file-text";
import Play from "lucide-solid/icons/play";
import ShieldAlert from "lucide-solid/icons/shield-alert";

import {
  layoutWorkflow,
  type WorkflowArtifact,
  type WorkflowEdge,
  type WorkflowNode,
} from "~/lib/workflow";

const NODE_W = 180;
const NODE_H = 76;

export function WorkflowPreview(props: {
  workflow: WorkflowArtifact;
  onOpen: (workflow: WorkflowArtifact) => void;
}) {
  const layout = createMemo(() => layoutWorkflow(props.workflow));
  return (
    <section class="mt-2 overflow-hidden rounded-[var(--r3)] border border-[var(--line-strong)] bg-[var(--bg)]">
      <div class="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
        <StatusMark status={props.workflow.status} />
        <div class="min-w-0 flex-1">
          <div class="truncate text-[12px] font-[700] text-[var(--text)]">{props.workflow.title}</div>
          <div class="truncate text-[10px] text-[var(--muted)]">
            {props.workflow.nodes.length} nodes · {props.workflow.owner} · {props.workflow.schedule}
          </div>
        </div>
        <button
          type="button"
          onClick={() => props.onOpen(props.workflow)}
          class="inline-flex h-7 items-center gap-1 rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[10.5px] font-[650] text-[var(--text)] hover:border-[var(--accent)]"
        >
          Open canvas <ExternalLink size={11} stroke-width={2} />
        </button>
      </div>
      <svg
        viewBox={`0 0 ${layout().width} ${layout().height}`}
        class="block h-[188px] w-full"
        role="img"
        aria-label={`${props.workflow.title} orchestration diagram`}
      >
        <WorkflowGrid width={layout().width} height={layout().height} />
        <For each={props.workflow.edges}>
          {(edge) => <WorkflowEdgePath edge={edge} workflow={props.workflow} positions={layout().positions} />}
        </For>
        <For each={props.workflow.nodes}>
          {(node) => {
            const p = () => layout().positions[node.id]!;
            return <SvgNode node={node} x={p().x} y={p().y} />;
          }}
        </For>
      </svg>
    </section>
  );
}

export function WorkflowCanvas(props: {
  workflow: WorkflowArtifact;
  onBack: () => void;
}) {
  const layout = createMemo(() => layoutWorkflow(props.workflow));
  const [selectedId, setSelectedId] = createSignal<string | null>(
    props.workflow.nodes.find((n) => n.status === "running")?.id ?? props.workflow.nodes[0]?.id ?? null,
  );
  const selected = createMemo(() => props.workflow.nodes.find((n) => n.id === selectedId()) ?? null);

  return (
    <section class="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--r3)] border border-[var(--line-strong)] bg-[var(--surface)]" style={{ "box-shadow": "var(--shadow-1)" }}>
      <header class="flex h-[58px] shrink-0 items-center gap-3 border-b border-[var(--line)] px-3.5">
        <button
          type="button"
          aria-label="Back to organization"
          onClick={props.onBack}
          class="grid size-8 place-items-center rounded-[var(--r2)] text-[var(--muted)] hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={15} stroke-width={2} />
        </button>
        <div class="min-w-0">
          <div class="truncate text-[14px] font-[700] text-[var(--text)]">{props.workflow.title}</div>
          <div class="truncate text-[10.5px] text-[var(--muted)]">
            Owned by {props.workflow.owner} · {props.workflow.schedule}
          </div>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <span class="hidden text-[10px] font-[700] uppercase tracking-[0.06em] text-[var(--muted)] md:inline">
            {props.workflow.nodes.length} nodes · {props.workflow.edges.length} routes
          </span>
          <span class="inline-flex items-center gap-1.5 rounded-[var(--r2)] bg-[var(--accent-soft)] px-2 py-1 text-[10px] font-[750] uppercase tracking-[0.06em] text-[var(--accent-text)]">
            <StatusMark status={props.workflow.status} /> {props.workflow.status}
          </span>
        </div>
      </header>

      <div class="relative min-h-0 flex-1 overflow-auto bg-[var(--bg)]">
        <div
          class="relative min-h-full min-w-full"
          style={{ width: `${layout().width}px`, height: `${layout().height}px` }}
        >
          <svg
            width={layout().width}
            height={layout().height}
            class="pointer-events-none absolute inset-0"
            aria-hidden="true"
          >
            <WorkflowGrid width={layout().width} height={layout().height} />
            <For each={props.workflow.edges}>
              {(edge) => <WorkflowEdgePath edge={edge} workflow={props.workflow} positions={layout().positions} />}
            </For>
          </svg>
          <For each={props.workflow.nodes}>
            {(node) => {
              const p = () => layout().positions[node.id]!;
              return (
                <button
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  class="absolute flex flex-col justify-between rounded-[var(--r3)] border-[1.5px] bg-[var(--surface)] p-2.5 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-px"
                  classList={{
                    "border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]": selectedId() === node.id,
                    "border-[var(--line-strong)]": selectedId() !== node.id,
                  }}
                  style={{ left: `${p().x}px`, top: `${p().y}px`, width: `${NODE_W}px`, height: `${NODE_H}px` }}
                >
                  <div class="flex min-w-0 items-start gap-2">
                    <NodeIcon node={node} />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[11.5px] font-[700] text-[var(--text)]">{node.label}</span>
                      <span class="mt-0.5 block truncate text-[9.5px] text-[var(--muted)]">
                        {node.detail || node.owner || prettyKind(node.kind)}
                      </span>
                    </span>
                  </div>
                  <span class="flex items-center justify-between border-t border-[var(--line)] pt-1 text-[9px] text-[var(--muted)]">
                    <span>{node.owner || prettyKind(node.kind)}</span>
                    <NodeState status={node.status} />
                  </span>
                </button>
              );
            }}
          </For>
        </div>

        <Show when={selected()}>
          {(node) => (
            <aside
              class="sticky bottom-3 z-[4] mr-3 w-[258px] rounded-[var(--r3)] border border-[var(--line-strong)] bg-[var(--surface)] p-3"
              style={{
                left: "calc(100% - 270px)",
                "margin-top": "-106px",
                "margin-bottom": "12px",
                "box-shadow": "var(--shadow-2)",
              }}
            >
              <div class="flex items-start gap-2">
                <NodeIcon node={node()} />
                <div class="min-w-0 flex-1">
                  <div class="text-[12px] font-[750] text-[var(--text)]">{node().label}</div>
                  <div class="text-[10px] text-[var(--muted)]">{prettyKind(node().kind)} node</div>
                </div>
                <NodeState status={node().status} />
              </div>
              <div class="mt-2.5 grid grid-cols-[58px_1fr] gap-x-2 gap-y-1 border-t border-[var(--line)] pt-2 text-[10.5px]">
                <span class="text-[var(--muted)]">Owner</span><strong>{node().owner || "AULAR"}</strong>
                <span class="text-[var(--muted)]">Output</span><strong class="font-[600]">{node().detail || "Available when this node runs"}</strong>
              </div>
            </aside>
          )}
        </Show>
      </div>
    </section>
  );
}

function WorkflowGrid(props: { width: number; height: number }) {
  return (
    <>
      <defs>
        <pattern id="workflow-grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--line)" opacity="0.85" />
        </pattern>
        <marker id="workflow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="var(--line-strong)" />
        </marker>
      </defs>
      <rect width={props.width} height={props.height} fill="url(#workflow-grid)" />
    </>
  );
}

function WorkflowEdgePath(props: {
  edge: WorkflowEdge;
  workflow: WorkflowArtifact;
  positions: Record<string, { x: number; y: number }>;
}) {
  const from = props.positions[props.edge.from]!;
  const to = props.positions[props.edge.to]!;
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const bend = Math.max(38, (x2 - x1) * 0.42);
  const color = props.edge.condition === "critical" ? "var(--red)" : props.edge.condition ? "var(--accent)" : "var(--line-strong)";
  const d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  return (
    <g>
      <path d={d} fill="none" stroke={color} stroke-width="2" stroke-dasharray={props.edge.condition ? "5 4" : undefined} marker-end="url(#workflow-arrow)" />
      <Show when={props.edge.label}>
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} text-anchor="middle" fill="var(--muted)" font-size="9" font-weight="700">
          {props.edge.label}
        </text>
      </Show>
    </g>
  );
}

function SvgNode(props: { node: WorkflowNode; x: number; y: number }) {
  return (
    <g transform={`translate(${props.x} ${props.y})`}>
      <rect width={NODE_W} height={NODE_H} rx="9" fill="var(--surface)" stroke={nodeColor(props.node)} stroke-width="1.7" />
      <circle cx="17" cy="19" r="5" fill={nodeColor(props.node)} />
      <text x="29" y="22" fill="var(--text)" font-size="11" font-weight="700">{props.node.label}</text>
      <text x="14" y="43" fill="var(--muted)" font-size="9">{props.node.detail || props.node.owner || prettyKind(props.node.kind)}</text>
      <text x="14" y="62" fill="var(--muted)" font-size="8.5">{props.node.owner || prettyKind(props.node.kind)}</text>
      <text x={NODE_W - 13} y="62" text-anchor="end" fill={nodeColor(props.node)} font-size="8.5" font-weight="700">{props.node.status}</text>
    </g>
  );
}

function NodeIcon(props: { node: WorkflowNode }) {
  const icon = () => {
    if (props.node.kind === "trigger") return <Clock3 size={13} stroke-width={2} />;
    if (props.node.kind === "artifact") return <FileText size={13} stroke-width={2} />;
    if (props.node.kind === "alert") return <ShieldAlert size={13} stroke-width={2} />;
    return <Play size={12} stroke-width={2} />;
  };
  return <span class="grid size-6 flex-none place-items-center rounded-[7px] bg-[var(--accent-soft)] text-[var(--accent-text)]">{icon()}</span>;
}

function NodeState(props: { status: WorkflowNode["status"] }) {
  return <span class="inline-flex items-center gap-1 font-[700]" style={{ color: statusColor(props.status) }}><i class="size-1.5 rounded-full" style={{ background: statusColor(props.status) }} />{props.status}</span>;
}

function StatusMark(props: { status: WorkflowArtifact["status"] }) {
  return <span class="inline-block size-2 rounded-full" style={{ background: artifactStatusColor(props.status) }} />;
}

function nodeColor(node: WorkflowNode) {
  if (node.kind === "alert" || node.status === "failed") return "var(--red)";
  if (node.status === "running") return "var(--accent)";
  if (node.status === "complete") return "var(--green)";
  if (node.status === "attention") return "var(--amber)";
  return "var(--line-strong)";
}

function statusColor(status: WorkflowNode["status"]) {
  if (status === "running") return "var(--accent-text)";
  if (status === "complete") return "var(--green)";
  if (status === "attention") return "var(--amber)";
  if (status === "failed") return "var(--red)";
  return "var(--muted)";
}

function artifactStatusColor(status: WorkflowArtifact["status"]) {
  if (status === "running") return "var(--accent)";
  if (status === "complete" || status === "ready") return "var(--green)";
  if (status === "failed") return "var(--red)";
  if (status === "paused") return "var(--amber)";
  return "var(--muted)";
}

function prettyKind(kind: WorkflowNode["kind"]) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

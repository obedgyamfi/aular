import { createMemo, createSignal, For, Show } from "solid-js";

import { AgentInfoModal } from "~/components/agent-info-modal";
import { Avatar } from "~/components/avatar";
import { actions, state } from "~/lib/store";
import type { Agent } from "~/lib/types";

/**
 * The org chart — ported from the prototype's OrgPanel chart tab.
 *
 * The reporting tree, rendered from `reports_to`. Drag an agent onto another to
 * make it report to them; drop it on the top row to bring it back under you.
 * This isn't decoration: the org engine reads exactly this structure to build
 * each agent's team roster and to decide who may dispatch to whom.
 */
export function OrgChart() {
  const [dragging, setDragging] = createSignal<string | null>(null);
  const [dropTarget, setDropTarget] = createSignal<string | null>(null);
  const [editing, setEditing] = createSignal<Agent | null>(null);
  const [error, setError] = createSignal("");

  const staff = createMemo(() => state.agents.filter((a) => a.role !== "system"));
  const childrenOf = (id: string | null) =>
    staff().filter((a) => (a.reports_to || null) === id);

  const reparent = async (agentId: string, managerId: string | null) => {
    setDropTarget(null);
    setDragging(null);
    const agent = staff().find((a) => a.id === agentId);
    if (!agent || (agent.reports_to || null) === managerId) return;
    if (managerId === agentId) return;

    setError("");
    try {
      await actions.updateAgent(agentId, { reports_to: managerId ?? "" });
    } catch (e) {
      // The backend rejects cycles and self-reports; say so plainly.
      setError((e as Error).message);
    }
  };

  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-0.5">
        <h2 class="text-[13px] font-medium text-v2-text-text-base">Reporting</h2>
        <p class="text-[11.5px] text-v2-text-text-muted">
          Drag an agent onto another to change who they report to. Agents can only
          delegate to the team this defines.
        </p>
      </div>

      <Show when={error()}>
        <p class="text-[11.5px] text-v2-text-text-danger">{error()}</p>
      </Show>

      {/* You — the top of the tree, and a drop target for un-parenting. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropTarget("__top__");
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={() => {
          const id = dragging();
          if (id) void reparent(id, null);
        }}
        class="flex w-fit flex-col items-center gap-1 rounded-md border-2 border-dashed px-6 py-3 transition-colors"
        classList={{
          "border-v2-border-border-focus bg-v2-overlay-simple-overlay-pressed":
            dropTarget() === "__top__",
          "border-v2-border-border-muted": dropTarget() !== "__top__",
        }}
      >
        <Avatar name={state.user?.display_name || "You"} size={34} />
        <span class="text-[12px] font-medium text-v2-text-text-base">
          {state.user?.display_name || "You"}
        </span>
        <span class="text-[10px] text-v2-text-text-weak">CEO</span>
      </div>

      {/* The top-level rail, hanging off the CEO card. */}
      <div class="ml-[24px] flex flex-col border-l border-v2-border-border-muted">
        <For each={childrenOf(null)}>
          {(a) => (
            <Node
              agent={a}
              depth={0}
              childrenOf={childrenOf}
              dragging={dragging()}
              dropTarget={dropTarget()}
              onDragStart={setDragging}
              onDropTarget={setDropTarget}
              onDrop={reparent}
              onOpen={setEditing}
            />
          )}
        </For>

        <Show when={!staff().length}>
          <p class="py-6 text-[11.5px] text-v2-text-text-weak">
            No staff yet. Hire an agent and it appears here.
          </p>
        </Show>
      </div>

      <Show when={editing()}>
        {(a) => <AgentInfoModal agent={a()} onClose={() => setEditing(null)} />}
      </Show>
    </div>
  );
}

function Node(props: {
  agent: Agent;
  depth: number;
  childrenOf: (id: string | null) => Agent[];
  dragging: string | null;
  dropTarget: string | null;
  onDragStart: (id: string | null) => void;
  onDropTarget: (id: string | null) => void;
  onDrop: (agentId: string, managerId: string | null) => void;
  onOpen: (a: Agent) => void;
}) {
  const a = () => props.agent;
  const kids = () => props.childrenOf(a().id);
  const isTarget = () => props.dropTarget === a().id;
  const isDragging = () => props.dragging === a().id;

  return (
    <div class="flex flex-col">
      <div class="flex items-center">
        {/* The elbow: a stub out of the parent's rail into this card. */}
        <span class="h-px w-3 shrink-0 bg-v2-border-border-muted" />

        <div
          draggable
          onDragStart={() => props.onDragStart(a().id)}
          onDragEnd={() => props.onDragStart(null)}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isDragging()) props.onDropTarget(a().id);
          }}
          onDragLeave={() => props.onDropTarget(null)}
          onDrop={() => {
            if (props.dragging && props.dragging !== a().id) {
              props.onDrop(props.dragging, a().id);
            }
          }}
          onClick={() => props.onOpen(a())}
          class="my-1 flex w-[230px] cursor-grab items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors active:cursor-grabbing"
          classList={{
            "border-v2-border-border-focus bg-v2-overlay-simple-overlay-pressed":
              isTarget(),
            "border-v2-border-border-muted bg-v2-background-bg-layer-01 hover:bg-v2-overlay-simple-overlay-hover":
              !isTarget(),
            "opacity-40": isDragging(),
          }}
        >
          <Avatar name={a().name} size={24} />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-[12px] leading-4 text-v2-text-text-base">
              {a().name}
            </span>
            <span class="truncate text-[10px] leading-3 text-v2-text-text-weak">
              {a().role.replace(/_/g, " ")}
            </span>
          </span>
          <Show when={kids().length}>
            <span
              title={`${kids().length} direct reports`}
              class="shrink-0 rounded-full bg-v2-background-bg-layer-03 px-1.5 py-0.5 text-[9.5px] tabular-nums text-v2-text-text-muted"
            >
              {kids().length}
            </span>
          </Show>
        </div>
      </div>

      {/* Children hang off a vertical rail drawn under this card's avatar, so
          the tree reads as a tree instead of a stack of indented rows. */}
      <Show when={kids().length}>
        <div class="ml-[24px] flex flex-col border-l border-v2-border-border-muted pl-0">
          <For each={kids()}>
            {(kid) => (
              <Node
                agent={kid}
                depth={props.depth + 1}
                childrenOf={props.childrenOf}
                dragging={props.dragging}
                dropTarget={props.dropTarget}
                onDragStart={props.onDragStart}
                onDropTarget={props.onDropTarget}
                onDrop={props.onDrop}
                onOpen={props.onOpen}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

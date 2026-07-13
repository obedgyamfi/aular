import { children, createMemo, createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";

import { AgentInfoModal } from "~/components/agent-info-modal";
import { Avatar } from "~/components/avatar";
import { UserAvatar, userName } from "~/components/user-avatar";
import { actions, agentWorking, state } from "~/lib/store";
import type { Agent } from "~/lib/types";

/**
 * The org chart — ported from the prototype's chart tab.
 *
 * A real org chart: top-down, centered, siblings joined by a bus. Not an
 * indented file tree — the shape is the message. You (the CEO) sit at the top,
 * the AULAR system agent hangs off you, and your staff hang under whoever they
 * report to.
 *
 * Drag an agent onto another to re-parent it; drop it on empty canvas to bring
 * it back to the top level. This isn't decoration: the org engine reads exactly
 * this structure to build each agent's team roster and decide who may delegate
 * to whom.
 */
export function OrgChart() {
  const [dragging, setDragging] = createSignal<string | null>(null);
  const [dropTarget, setDropTarget] = createSignal<string | null>(null);
  const [editing, setEditing] = createSignal<Agent | null>(null);
  const [error, setError] = createSignal("");

  const staff = createMemo(() => state.agents.filter((a) => a.role !== "system"));
  const system = createMemo(() => state.agents.find((a) => a.role === "system"));

  const childrenOf = (id: string | null) =>
    staff().filter((a) => (a.reports_to || null) === id);

  const reparent = async (agentId: string, managerId: string | null) => {
    setDropTarget(null);
    setDragging(null);

    const agent = staff().find((a) => a.id === agentId);
    if (!agent || managerId === agentId) return;
    if ((agent.reports_to || null) === managerId) return;

    setError("");
    try {
      await actions.updateAgent(agentId, { reports_to: managerId ?? "" });
    } catch (e) {
      // The backend rejects cycles and self-reports; say so plainly.
      setError((e as Error).message);
    }
  };

  const dropOnCanvas = (e: DragEvent) => {
    e.preventDefault();
    const id = dragging();
    if (id) void reparent(id, null);
  };

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-6 py-5">
      <div class="flex shrink-0 flex-col gap-0.5">
        <h2 class="text-[13px] font-medium text-v2-text-text-base">Reporting</h2>
        <p class="text-[11.5px] text-v2-text-text-muted">
          Drag an agent onto another to change who they report to; drop one on
          empty space to bring it back to you. Agents can only delegate to the
          team this defines.
        </p>
      </div>

      <Show when={error()}>
        <p class="text-[11.5px] text-v2-state-fg-danger">{error()}</p>
      </Show>

      {/* The canvas scrolls both ways, so a wide org stays a tree instead of
          collapsing into a list. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropTarget("__top__");
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={dropOnCanvas}
        class="min-h-0 flex-1 overflow-auto rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 transition-colors"
        classList={{
          "border-dashed border-v2-border-border-focus": dropTarget() === "__top__",
        }}
      >
        <div class="flex min-w-max flex-col items-center px-10 py-6">
          {/* You. */}
          <div class="flex w-36 flex-col items-center rounded-xl border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 py-2.5 text-center">
            <UserAvatar size={34} />
            <div class="mt-1.5 w-full truncate text-[12.5px] font-medium text-v2-text-text-base">
              {userName()}
            </div>
            <div class="text-[10.5px] text-v2-text-text-weak">CEO</div>
          </div>

          <Show when={system()}>
            {(sys) => (
              <>
                <Trunk />
                <NodeCard
                  agent={sys()}
                  subtitle="System · Chief of Platform"
                  dropTarget={false}
                  dragging={false}
                  onOpen={setEditing}
                />
              </>
            )}
          </Show>

          <Show when={childrenOf(null).length}>
            <Trunk />
            <ChildRow>
              <For each={childrenOf(null)}>
                {(a) => (
                  <Subtree
                    agent={a}
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
            </ChildRow>
          </Show>

          <Show when={!staff().length}>
            <p class="mt-10 text-[11.5px] text-v2-text-text-weak">
              No staff yet. Hire an agent and it appears here.
            </p>
          </Show>
        </div>
      </div>

      <Show when={editing()}>
        {(a) => <AgentInfoModal agent={a()} onClose={() => setEditing(null)} />}
      </Show>
    </div>
  );
}

/** The vertical drop from a card to the bus below it. */
function Trunk() {
  return <div class="h-5 w-px bg-v2-border-border-muted" />;
}

/**
 * A row of sibling subtrees with the connecting bus.
 *
 * Each child carries a center stub plus left/right half-bus segments (hidden on
 * the outer edges), so the bus meets every child's center no matter how wide
 * that child's own subtree grows.
 */
function ChildRow(props: { children: JSX.Element }) {
  // Solid's resolver: a <For> child is a memo, not an array, until you resolve
  // it. Iterating props.children directly would index into nothing.
  const resolved = children(() => props.children);
  const items = () => resolved.toArray();

  return (
    <div class="flex items-start">
      <For each={items()}>
        {(child, i) => (
          <div class="relative flex flex-col items-center px-2.5 pt-5">
            <Show when={i() > 0}>
              <div class="absolute left-0 right-1/2 top-0 h-px bg-v2-border-border-muted" />
            </Show>
            <Show when={i() < items().length - 1}>
              <div class="absolute left-1/2 right-0 top-0 h-px bg-v2-border-border-muted" />
            </Show>
            <div class="absolute left-1/2 top-0 h-5 w-px bg-v2-border-border-muted" />
            {child}
          </div>
        )}
      </For>
    </div>
  );
}

function Subtree(props: {
  agent: Agent;
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

  return (
    <div class="flex flex-col items-center">
      <div
        draggable
        onDragStart={() => props.onDragStart(a().id)}
        onDragEnd={() => props.onDragStart(null)}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation(); // don't let the canvas claim this as "top level"
          if (props.dragging !== a().id) props.onDropTarget(a().id);
        }}
        onDragLeave={() => props.onDropTarget(null)}
        onDrop={(e) => {
          e.stopPropagation();
          if (props.dragging && props.dragging !== a().id) {
            props.onDrop(props.dragging, a().id);
          }
        }}
      >
        <NodeCard
          agent={a()}
          subtitle={prettyRole(a().role)}
          dropTarget={props.dropTarget === a().id}
          dragging={props.dragging === a().id}
          onOpen={props.onOpen}
        />
      </div>

      <Show when={kids().length}>
        <Trunk />
        <ChildRow>
          <For each={kids()}>
            {(kid) => (
              <Subtree
                agent={kid}
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
        </ChildRow>
      </Show>
    </div>
  );
}

function NodeCard(props: {
  agent: Agent;
  subtitle: string;
  dropTarget: boolean;
  dragging: boolean;
  onOpen: (a: Agent) => void;
}) {
  const a = () => props.agent;
  const working = () => agentWorking(a().id);

  return (
    <button
      type="button"
      onClick={() => props.onOpen(a())}
      class="flex w-36 cursor-grab flex-col items-center rounded-xl border px-3 py-2.5 text-center transition-colors active:cursor-grabbing"
      classList={{
        "border-v2-border-border-focus bg-v2-overlay-simple-overlay-pressed":
          props.dropTarget,
        "border-v2-border-border-muted bg-v2-background-bg-layer-02 hover:bg-v2-overlay-simple-overlay-hover":
          !props.dropTarget,
        "opacity-40": props.dragging,
      }}
    >
      <div class="relative">
        <Avatar name={a().name} size={34} />
        {/* Working now, or idle — the same dot the chat list uses. */}
        <span
          class="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-v2-background-bg-layer-02"
          classList={{
            "bg-v2-icon-icon-accent": working(),
            "bg-v2-background-bg-layer-04": !working(),
          }}
        />
      </div>
      <div class="mt-1.5 w-full truncate text-[12.5px] font-medium text-v2-text-text-base">
        {a().name}
      </div>
      <div class="w-full truncate text-[10.5px] text-v2-text-text-weak">
        {props.subtitle}
      </div>
    </button>
  );
}

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

import { createEffect, createMemo, createResource, createSignal, Show } from "solid-js";

import { Avatar } from "~/components/avatar";
import { NodeInspector } from "~/components/node-inspector";
import { OrgBuilderChat } from "~/components/org-builder-chat";
import { OrgGraph } from "~/components/org-graph";
import { OrgDocs } from "~/components/org-docs";
import { WorkflowCanvas } from "~/components/workflow-orchestration";
import type { Proposal } from "~/lib/intent";
import { loadScheduleEntries, type ScheduleEntry } from "~/lib/schedules";
import { actions, activeProject, atHome, state } from "~/lib/store";
import { focusComposer } from "~/lib/window";

type Tab = "overview" | "docs";

/**
 * The Organization surface: the working view on the left, the AULAR system
 * agent's chat on the right.
 *
 * Which view you get is the *sidebar's* choice, not a tab bar's — Org chart and
 * Knowledge bank are two rows in the column, so the register is the only thing
 * that decides. The in-panel tabs that used to do this job were a second
 * switcher for the same pair, and the two could disagree.
 * (Usage & tokens moved to Settings → Usage & limits.)
 */
const CHAT_W_KEY = "aular-org-chat-width";
// The default IS the widest comfortable width; dragging gives a little room on
// either side — up to +5%, down to −15%.
const CHAT_W_DEFAULT = 640;
const CHAT_W_MIN = Math.round(CHAT_W_DEFAULT * 0.85); // 544
const CHAT_W_MAX = Math.round(CHAT_W_DEFAULT * 1.05); // 672
const readChatWidth = () => {
  const n = Number(localStorage.getItem(CHAT_W_KEY));
  return Number.isFinite(n) && n >= CHAT_W_MIN && n <= CHAT_W_MAX ? n : CHAT_W_DEFAULT;
};

export function OrgPanel() {
  const tab = (): Tab => (state.register === "knowledge" ? "docs" : "overview");

  // The same canvas is the company's chart at home and a project's Team inside
  // one — so it has to say which, or the header contradicts the row you clicked.
  const heading = () => {
    if (tab() === "docs") {
      return { title: "Knowledge bank", sub: "What the whole company works from" };
    }
    if (atHome()) {
      return { title: "Org chart", sub: "Reporting lines, roles, and live status" };
    }
    return { title: "Team", sub: `Who's on ${activeProject().name}, and what they're doing` };
  };

  // The builder chat is drag-resizable; its width persists per device.
  const [chatWidth, setChatWidth] = createSignal(readChatWidth());
  const startResize = (e: PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = chatWidth();
    const move = (ev: PointerEvent) => {
      // The aside is on the right; dragging its edge LEFT widens the chat.
      const w = Math.min(CHAT_W_MAX, Math.max(CHAT_W_MIN, startW - (ev.clientX - startX)));
      setChatWidth(w);
    };
    const up = () => {
      localStorage.setItem(CHAT_W_KEY, String(chatWidth()));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Lifted here so the builder chat can be a full-height sibling of the header:
  // the selected node, the draft proposal (previewed as ghosts on the board),
  // and the schedule join that both the trigger nodes and the inspector read.
  // The open workflow is store state — its minimap lives in messages, which
  // can be read from any register — and it displaces the node inspector.
  const [selected, setSelected] = createSignal<string | null>(null);
  const [proposal, setProposal] = createSignal<Proposal | null>(null);
  createEffect(() => {
    if (state.workflowView) setSelected(null);
  });
  // Clicking a node asks for its inspector, and the inspector lives in the
  // aside — a collapsed aside would swallow the click without this.
  createEffect(() => {
    if (selected()) actions.setOrgChatOpen(true);
  });
  const [schedule, { refetch }] = createResource(
    () => state.agents.length,
    () => loadScheduleEntries(),
  );
  const triggersOf = createMemo(() => {
    const by = new Map<string, ScheduleEntry[]>();
    for (const e of schedule() ?? []) {
      if (!e.agentId) continue;
      (by.get(e.agentId) ?? by.set(e.agentId, []).get(e.agentId)!).push(e);
    }
    return by;
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── TOP: one header across the whole surface, so the AULAR button sits
          ABOVE the chat panel rather than beside its top edge. ── */}
      <header class="flex h-[58px] shrink-0 items-center gap-3 border-b border-[var(--line)] px-[22px]">
          <div>
            <div class="text-[18px] font-semibold leading-tight text-[var(--text)]" style={{ "font-family": "var(--serif)" }}>
              {heading().title}
            </div>
            <div class="text-[11.5px] text-[var(--muted)]">{heading().sub}</div>
          </div>
          {/* The rail's identity and its switch, in one control: the agent's
              own face with what talking to it here is for — creating agents on
              the org chart, teaching them in the Knowledge bank. Closed,
              clicking opens the rail with the cursor in its composer (both are
              sentences, not forms) and stays on the tab you're reading; open,
              it puts the rail away. Quiet on purpose — a hairline border and a
              slightly darkened ground that lifts on hover (and stays lifted
              while the rail is open); the black overlay reads correctly on
              light and dark themes alike. */}
          <button
            type="button"
            aria-pressed={state.orgChatOpen}
            aria-label={state.orgChatOpen ? "Hide Build with AULAR" : "Build with AULAR"}
            onClick={() => {
              if (state.orgChatOpen) {
                actions.setOrgChatOpen(false);
                return;
              }
              // Not actions.hireAgent(): that navigates to the org chart, and
              // from the Knowledge bank the rail should open right here.
              actions.setOrgChatOpen(true);
              queueMicrotask(focusComposer);
            }}
            class="ml-auto flex items-center gap-2.5 rounded-[var(--r3)] border border-[var(--line)] px-3 py-[5px] transition-colors"
            classList={{
              // Arbitrary values, not bg-black/N: the theme replaces Tailwind's
              // palette wholesale, so palette utilities compile to nothing.
              "bg-[rgba(0,0,0,.10)]": state.orgChatOpen,
              "bg-[rgba(0,0,0,.25)] hover:bg-[rgba(0,0,0,.10)]": !state.orgChatOpen,
            }}
          >
            <Avatar name={state.agents.find((a) => a.role === "system")?.name ?? "AULAR"} size={26} circle />
            <span class="flex flex-col items-start">
              <span class="text-[12px] font-bold leading-[15px] text-[var(--text)]">AULAR</span>
              <span class="text-[10.5px] leading-[13px] text-[var(--muted)]">
                {tab() === "docs" ? "Teach an agent" : "Create an agent"}
              </span>
            </span>
          </button>
      </header>

      <div class="flex min-h-0 min-w-0 flex-1">
        {/* ── LEFT: the tab's content ── */}
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* p-3, not p-6: the canvas card and the chat panel share one 12px
              gutter, so their tops, bottoms and the seam between them align. */}
          <Show when={tab() === "overview"}>
            <div class="min-h-0 flex-1 p-3">
              <Show
                when={state.workflowView}
                fallback={<OrgGraph selected={selected()} onSelect={setSelected} schedules={schedule()} />}
              >
                {(artifact) => (
                  <WorkflowCanvas workflow={artifact()} onBack={() => actions.closeWorkflow()} />
                )}
              </Show>
            </div>
          </Show>
          <Show when={tab() === "docs"}>
            <OrgDocs />
          </Show>
        </div>

        {/* ── RIGHT: the builder chat (or a node's inspector), under the header
            the AULAR button lives in. Shared by both tabs so Overview and
            Knowledge bank read as one layout. A rounded panel floating beside
            the canvas rather than a welded column — and when it's away it's
            gone entirely: the AULAR button is the way back, so no strip has to
            hold its place. ── */}
        <Show when={state.orgChatOpen}>
          <aside
            class="relative my-3 mr-3 flex flex-none flex-col overflow-hidden rounded-[16px] border border-[var(--line)]"
            style={{ width: `${chatWidth()}px` }}
          >
          {/* drag to resize */}
          <div
            onPointerDown={startResize}
            title="Drag to resize"
            class="group absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize"
          >
            <div class="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-[var(--accent)]" />
          </div>

          {/* A selected node's inspector only exists on the canvas; the
              Knowledge bank always shows the builder chat. */}
          <Show
            when={tab() === "overview" && selected()}
            fallback={
              <OrgBuilderChat
                onProposal={setProposal}
                onApplied={() => {
                  setProposal(null);
                  void refetch();
                }}
              />
            }
          >
            {(id) => (
              <div class="flex min-h-0 flex-1 flex-col px-3.5 pt-3.5">
                <NodeInspector
                  agentId={id()}
                  triggers={triggersOf().get(id()) ?? []}
                  onClose={() => setSelected(null)}
                />
              </div>
            )}
          </Show>
          </aside>
        </Show>
      </div>
    </div>
  );
}


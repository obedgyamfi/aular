import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { ArrowUp, Sparkles, X } from "lucide-solid";

import { Avatar } from "~/components/avatar";
import { Markdown } from "~/components/markdown";
import { Thinking } from "~/components/thinking";
import { WorkflowPreview } from "~/components/workflow-orchestration";
import { describeProposal, parseIntent, type Proposal } from "~/lib/intent";
import { applyProposal } from "~/lib/proposals";
import {
  actions,
  activeMessages,
  activeWorking,
  state,
} from "~/lib/store";
import type { Message } from "~/lib/types";
import { parseWorkflowArtifact, type WorkflowArtifact } from "~/lib/workflow";

/**
 * Build the org by talking — the CrewAI-Studio pattern, on AULAR's spine.
 *
 * The AULAR system agent's conversation lives here beside the canvas: describe
 * the organization you want and it makes the edits, which the graph reflects
 * live. Quick, recognizable changes (a schedule, a reporting line, a hire) are
 * previewed as a draft with ghosts on the canvas and applied in one click;
 * anything richer is a real turn with the system agent, who builds it.
 */
export function OrgBuilderChat(props: {
  onProposal: (p: Proposal | null) => void;
  onApplied?: () => void;
  onWorkflow: (workflow: WorkflowArtifact) => void;
  /**
   * Where a recognized draft is shown. "chat" (default) draws the draft card in
   * the rail — the Organization page, where the canvas also ghosts it. "section"
   * hands project drafts to the section they land in (a ghost card with its own
   * Apply), so the rail stays a conversation.
   */
  draftHost?: "chat" | "section";
}) {
  const sys = () => state.agents.find((a) => a.role === "system");

  // The system agent's thread is the org-builder thread — make it active so
  // its conversation shows here (and stays in sync with the main chat).
  onMount(() => {
    const s = sys();
    if (s && state.activeAgentId !== s.id) void actions.openAgent(s.id);
  });

  const messages = () => activeMessages();

  const [text, setText] = createSignal("");
  const [draft, setDraft] = createSignal<Proposal | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal("");

  let scroller: HTMLDivElement | undefined;
  createEffect(() => {
    messages().length;
    activeWorking();
    draft();
    queueMicrotask(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
  });

  // A workflow the agent posts stays a minimap inside its message (see Bubble);
  // it must NOT auto-take-over the Overview — visiting Organization should always
  // land on the org chart, and workflows belong as a layer on it, not a separate
  // full-screen view. (This effect used to hijack the canvas on every mount.)

  const dismiss = () => {
    setDraft(null);
    props.onProposal(null);
    setNote("");
  };

  const toAgent = (t: string) => {
    dismiss();
    setText("");
    void actions.send(t);
  };

  const onSend = () => {
    const t = text().trim();
    if (!t || busy()) return;
    const p = parseIntent(t, state.agents, state.projects);
    if (p.kind === "delegate") {
      toAgent(t);
      return;
    }
    setNote("");
    // In section mode the draft is owned by the section it lands in (a ghost
    // there with its own Apply), so we don't also draw a card in the rail. Only
    // kinds that HAVE a section home divert; the rest keep the rail draft card.
    if (props.draftHost === "section" && (p.kind === "project" || p.kind === "routine")) {
      props.onProposal(p);
      setText("");
      return;
    }
    // Otherwise preview it in the rail (draft card) + wherever onProposal points.
    setDraft(p);
    props.onProposal(p);
    setText("");
  };

  const applyDraft = async () => {
    const p = draft();
    if (!p || busy()) return;
    setBusy(true);
    const res = await applyProposal(p);
    setBusy(false);
    if (res.delegate) {
      // Fell through to the agent — send the original ask as a turn.
      const s = sys();
      if (s) void actions.send(describeToPrompt(p));
      dismiss();
      return;
    }
    if (res.note) setNote(res.note);
    if (res.applied) {
      dismiss();
      props.onApplied?.();
    } else if (res.note) {
      dismiss();
    }
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      {/* header — matches the OrgPanel header height so the two align */}
      <div class="flex h-[58px] shrink-0 items-center gap-2.5 border-b border-[var(--line)] px-4">
        <span class="grid size-[28px] flex-none place-items-center rounded-[8px] bg-[var(--accent-soft)] text-[var(--accent-text)]">
          <Sparkles size={15} stroke-width={1.9} />
        </span>
        <div class="min-w-0">
          <div class="text-[13.5px] font-bold text-[var(--text)]">Build with AULAR</div>
          <div class="truncate text-[11px] text-[var(--muted)]">
            Describe the org — it makes the edits
          </div>
        </div>
      </div>

      {/* conversation */}
      <div ref={scroller} class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Show
          when={messages().length}
          fallback={
            <div class="flex flex-col gap-2 px-1 pt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">
              <p>Try:</p>
              <For each={SEEDS}>
                {(s) => (
                  <button
                    type="button"
                    onClick={() => setText(s)}
                    class="rounded-[var(--r2)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-left transition-colors hover:border-[var(--accent)]"
                  >
                    “{s}”
                  </button>
                )}
              </For>
            </div>
          }
        >
          <div class="flex flex-col gap-2.5">
            <For each={messages()}>
              {(m) => (
                <Bubble
                  message={m}
                  agentName={sys()?.name ?? "AULAR"}
                  onWorkflow={props.onWorkflow}
                />
              )}
            </For>
            <Show when={activeWorking()}>
              <Thinking agentName={sys()?.name ?? "AULAR"} />
            </Show>
          </div>
        </Show>
      </div>

      {/* draft + note */}
      <div class="px-3">
        <Show when={draft()}>
          {(p) => (
            <div
              class="aular-pop mb-2 rounded-[var(--r3)] border border-[var(--accent)] bg-[var(--accent-soft)] p-2.5"
            >
              <div class="flex items-start gap-2">
                <span class="text-[11px] font-bold text-[var(--accent-text)]">✦</span>
                <div class="min-w-0 flex-1">
                  <div class="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--accent-text)]">
                    Draft — nothing applied yet
                  </div>
                  <div class="mt-0.5 text-[12.5px] font-[650] text-[var(--text)]">
                    {describeProposal(p())}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={dismiss}
                  class="grid size-5 flex-none place-items-center rounded text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <X size={12} stroke-width={2} />
                </button>
              </div>
              <div class="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy()}
                  onClick={() => void applyDraft()}
                  class="rounded-[var(--r2)] bg-[var(--accent)] px-3 py-[6px] text-[11.5px] font-[650] text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {busy() ? "Applying…" : "Apply"}
                </button>
                <button
                  type="button"
                  disabled={busy()}
                  onClick={() => toAgent(describeToPrompt(p()))}
                  class="rounded-[var(--r2)] px-2.5 py-[6px] text-[11.5px] font-[650] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
                >
                  Ask AULAR
                </button>
              </div>
            </div>
          )}
        </Show>
        <Show when={note()}>
          <div class="mb-2 rounded-[var(--r2)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] text-[var(--muted)]">
            {note()}
          </div>
        </Show>
      </div>

      {/* input */}
      <div class="px-3 pb-3">
        <div class="flex items-end gap-1.5 rounded-[var(--r4)] border border-[var(--line-strong)] bg-[var(--surface)] py-1.5 pl-3 pr-1.5 transition-colors focus-within:border-[var(--accent)]">
          <textarea
            rows={1}
            value={text()}
            onInput={(e) => {
              setText(e.currentTarget.value);
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Add a role, wire a report, set a schedule…"
            class="max-h-[120px] min-h-[22px] w-full resize-none bg-transparent py-0.5 text-[12.5px] leading-normal text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
          />
          <button
            type="button"
            aria-label="Send"
            disabled={!text().trim() || busy()}
            onClick={onSend}
            class="grid size-7 flex-none place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:bg-[var(--element)] disabled:text-[var(--faint)]"
          >
            <ArrowUp size={14} stroke-width={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
}

const SEEDS = [
  "Hire a QA engineer",
  "Every weekday at 9, have AULAR brief me on overnight activity",
  "Design a 3-person research pod reporting to a lead",
];

/** A compact conversation bubble for the narrow builder rail. */
function Bubble(props: {
  message: Message;
  agentName: string;
  onWorkflow: (workflow: WorkflowArtifact) => void;
}) {
  const m = () => props.message;
  const isUser = () => m().sender_type === "user";
  const isSystem = () => m().sender_type === "system";
  const parsed = createMemo(() =>
    parseWorkflowArtifact(m().content.replace(/<<<AULAR_CHUNK>>>/g, "\n\n")),
  );
  const content = () => parsed().text;

  return (
    <Show
      when={!isSystem()}
      fallback={
        <div class="rounded-[var(--r2)] border border-[var(--line)] bg-[var(--element)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--muted)]">
          <Markdown content={content()} sans />
        </div>
      }
    >
      <Show
        when={isUser()}
        fallback={
          <div class="flex gap-2">
            <Avatar name={props.agentName} size={22} circle />
            <div class="min-w-0 flex-1 pt-0.5 text-[12.5px] leading-relaxed text-[var(--text)]">
              <Show when={content()}>
                <Markdown content={content()} sans />
              </Show>
              <Show when={parsed().workflow}>
                {(workflow) => <WorkflowPreview workflow={workflow()} onOpen={props.onWorkflow} />}
              </Show>
            </div>
          </div>
        }
      >
        <div class="flex justify-end">
          <div class="max-w-[85%] whitespace-pre-wrap break-words rounded-[14px] rounded-br-[4px] bg-[var(--element)] px-3 py-1.5 text-[12.5px] leading-relaxed text-[var(--text-2)]">
            {content()}
          </div>
        </div>
      </Show>
    </Show>
  );
}

/** Turn a resolved proposal back into a natural instruction for the agent. */
function describeToPrompt(p: Proposal): string {
  switch (p.kind) {
    case "routine":
      return `Set up a routine: ${p.agentName} should "${p.behavior}" on schedule "${p.rule}".`;
    case "reparent":
      return `Make ${p.agentName} report to ${p.managerName}.`;
    case "hire":
      return `Hire ${p.name ? `${p.name}, ` : ""}a ${p.role}, and set up their persona and tools.`;
    case "staff":
      return `${p.add ? "Add" : "Remove"} ${p.agentName} ${p.add ? "to" : "from"} the ${p.projectName} project.`;
    case "project":
      return `Create a project "${p.name}"${p.leadName ? ` led by ${p.leadName}` : ""}.`;
    case "delegate":
      return p.text;
  }
}

import { createSignal, onMount, Show } from "solid-js";
import Sparkles from "lucide-solid/icons/sparkles";
import X from "lucide-solid/icons/x";

import { Composer } from "~/components/composer";
import { MessageList } from "~/components/message-list";
import { describeProposal, parseIntent, type Proposal } from "~/lib/intent";
import { applyProposal } from "~/lib/proposals";
import { actions, state } from "~/lib/store";

/**
 * Build the org by talking — the CrewAI-Studio pattern, on AULAR's spine.
 *
 * The AULAR system agent's conversation lives here beside the canvas: describe
 * the organization you want and it makes the edits, which the graph reflects
 * live. Quick, recognizable changes (a schedule, a reporting line, a hire) are
 * previewed as a draft with ghosts on the canvas and applied in one click;
 * anything richer is a real turn with the system agent, who builds it.
 *
 * The conversation itself is the SAME surface as a direct message — the
 * channel timeline and the full composer, not a compact copy of them. This is
 * the #aular thread, so what you read here is exactly what the chat register
 * shows; the only thing this rail adds is the draft card, and the only thing
 * it intercepts is a send the intent parser recognizes.
 */
export function OrgBuilderChat(props: {
  onProposal: (p: Proposal | null) => void;
  onApplied?: () => void;
}) {
  const sys = () => state.agents.find((a) => a.role === "system");

  // The system agent's thread is the org-builder thread — make it active so
  // its conversation shows here (and stays in sync with the main chat).
  onMount(() => {
    const s = sys();
    if (s && state.activeAgentId !== s.id) void actions.openAgent(s.id);
  });

  const [draft, setDraft] = createSignal<Proposal | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal("");

  const dismiss = () => {
    setDraft(null);
    props.onProposal(null);
    setNote("");
  };

  /** Claim a send the intent parser recognizes; let real turns through. */
  const intercept = (t: string): boolean => {
    const p = parseIntent(t, state.agents, state.projects);
    if (p.kind === "delegate") return false;
    setNote("");
    setDraft(p);
    props.onProposal(p);
    return true;
  };

  const toAgent = (t: string) => {
    dismiss();
    void actions.send(t);
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

      {/* The channel timeline — the same component the chat register renders,
          bound to the same active conversation. */}
      <MessageList />

      {/* draft + note, pinned between the timeline and the composer the way
          the chat register pins its task strip */}
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

      {/* The full composer — attachments, slash commands, model menu — with
          one difference from the chat register's: the intent parser gets the
          first look at what you send. */}
      <Composer intercept={intercept} />
    </div>
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

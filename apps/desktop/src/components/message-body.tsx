import { createSignal, Show } from "solid-js";

import { Markdown } from "~/components/markdown";
import { MediaAttachments } from "~/components/media-attachments";
import { actions } from "~/lib/store";
import type { Message } from "~/lib/types";

/**
 * A message's CONTENTS, with no chrome of its own.
 *
 * Split out from the old bubble so the timeline row owns the frame (gutter,
 * author line, hover rail) and this owns the words: the quoted reply, media,
 * prose, the streaming caret, and the approval control. Both the channel
 * timeline and any compact aside can render the same body.
 */
export function MessageBody(props: {
  message: Message;
  /** When a long reply arrives split into chunks, this is one chunk. */
  contentOverride?: string;
  repliedTo?: Message;
  agentName: string;
  streaming?: boolean;
  showReplyQuote?: boolean;
  showMedia?: boolean;
  /** The thread's newest message — the only place an approval is still live. */
  actionable?: boolean;
}) {
  const m = () => props.message;
  const content = () => props.contentOverride ?? m().content;
  const isUser = () => m().sender_type === "user";

  // Hermes announces a dangerous command as a plain-text prompt (its adapters
  // without button support get the fallback form). Recognize it and draw a real
  // control instead of asking the user to type /approve.
  const approval = () => (!isUser() ? parseApproval(content()) : null);

  return (
    <Show
      when={!approval()}
      fallback={<ApprovalCard {...approval()!} actionable={props.actionable} />}
    >
      <div class="min-w-0">
        <Show when={props.showReplyQuote && props.repliedTo}>
          {(quoted) => (
            <div class="mb-1.5 border-l-2 border-[var(--line-strong)] pl-2">
              <div class="text-[10.5px] font-medium text-[var(--muted)]">
                {quoted().sender_type === "user" ? "You" : props.agentName}
              </div>
              <div class="truncate text-[11px] text-[var(--faint)]">
                {snippet(quoted().content) || "attachment"}
              </div>
            </div>
          )}
        </Show>

        {/* Media above the words, as every chat app draws it. */}
        <Show when={props.showMedia}>
          <MediaAttachments message={m()} />
        </Show>

        <Show
          when={!isUser()}
          fallback={
            <div class="whitespace-pre-wrap break-words text-[14px] leading-[1.6] text-[var(--text)]">
              {content()}
            </div>
          }
        >
          {/* break-words is load-bearing: agents quote absolute paths, URLs and
              stack traces, and one unbreakable token would otherwise widen the
              row and drag a scrollbar under the whole conversation. */}
          <div class="min-w-0 break-words [overflow-wrap:anywhere]">
            <Markdown content={content()} sans />
            <Show when={props.streaming}>
              <span class="aular-caret ml-0.5 inline-block h-3.5 w-[2px] bg-[var(--accent)] align-middle" />
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}

/**
 * A platform note — a dispatch landing, a report relayed, a doc saved.
 *
 * Not a pill: a dispatch can run to several hundred words, and `rounded-full`
 * on a paragraph draws a giant lozenge with the text swimming inside it. A
 * bordered card that wraps like prose is the right shape. Only genuine
 * failures get the danger treatment, and they stay centered and loud.
 */
export function SystemNote(props: { content: string }) {
  const failed = () => isFailure(props.content);
  return (
    <div class="flex justify-center py-1.5">
      <div
        class="max-w-[86%] whitespace-pre-wrap break-words rounded-[var(--r3)] px-3.5 py-2 text-[12px] leading-relaxed"
        classList={{
          "border border-[var(--line)] bg-[var(--element)] text-left text-[var(--muted)]":
            !failed(),
          "border border-v2-state-border-danger bg-v2-state-bg-danger text-center text-v2-state-fg-danger":
            failed(),
        }}
      >
        {props.content}
      </div>
    </div>
  );
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function snippet(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_~`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Only a genuine failure gets the danger color — the prototype's rule. */
function isFailure(text: string): boolean {
  return /^(agent unavailable|could not reach)/i.test(text.trim());
}

// ── exec approvals ───────────────────────────────────────────────────────────

/** The gateway's text-fallback approval prompt, recognized and structured. */
export function parseApproval(text: string): { command: string; reason: string } | null {
  if (!/dangerous command requires approval/i.test(text)) return null;
  const command = /```[a-z]*\n?([\s\S]*?)```/.exec(text)?.[1]?.trim() ?? "";
  const reason = /Reason:\s*([^\n]+)/.exec(text)?.[1]?.trim() ?? "";
  return { command, reason };
}

/**
 * The human-in-the-loop moment, as a control instead of a chore.
 *
 * Hermes blocks the agent's thread until the user answers; the buttons send the
 * same zero-token gateway commands the prompt asks you to type. Only the
 * thread's newest message is actionable — an old approval was already resolved,
 * and offering buttons on it would just earn a "no pending approval" reply.
 */
function ApprovalCard(props: { command: string; reason: string; actionable?: boolean }) {
  const [sent, setSent] = createSignal("");
  const act = (cmd: string, label: string) => {
    if (sent()) return;
    setSent(label);
    void actions.send(cmd);
  };

  return (
    <div class="w-full max-w-[560px] overflow-hidden rounded-[var(--r3)] border border-v2-state-border-warning bg-v2-state-bg-warning">
      <div class="px-3.5 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-v2-state-fg-warning">
        Approval required
      </div>
      <p class="px-3.5 pt-1 text-[12px] leading-relaxed text-v2-text-text-base">
        The agent wants to run a command it may not run on its own
        {props.reason ? <> — {props.reason}</> : null}.
      </p>
      <Show when={props.command}>
        <pre
          data-selectable
          class="mx-3.5 mt-2 overflow-x-auto rounded-[var(--r2)] bg-v2-background-bg-layer-01 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-v2-text-text-base"
        >
          {props.command}
        </pre>
      </Show>

      <Show
        when={props.actionable}
        fallback={
          <p class="px-3.5 pb-2.5 pt-2 text-[11px] text-v2-text-text-faint">
            Resolved — the outcome follows in the thread.
          </p>
        }
      >
        <div class="flex flex-wrap items-center gap-1.5 px-3.5 pb-3 pt-2.5">
          <button
            type="button"
            disabled={!!sent()}
            onClick={() => act("/approve", "Approved")}
            class="rounded-[var(--r2)] bg-v2-background-bg-accent px-3 py-1.5 text-[12px] font-medium text-v2-text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={!!sent()}
            onClick={() => act("/approve session", "Approved for session")}
            title="Also allow this command pattern for the rest of the session"
            class="rounded-[var(--r2)] border border-v2-border-border-base px-3 py-1.5 text-[12px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-50"
          >
            Approve for session
          </button>
          <button
            type="button"
            disabled={!!sent()}
            onClick={() => act("/deny", "Denied")}
            class="rounded-[var(--r2)] px-3 py-1.5 text-[12px] font-medium text-v2-state-fg-danger transition-colors hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-50"
          >
            Deny
          </button>
          <Show when={sent()}>
            <span class="pl-1 text-[11px] text-v2-text-text-faint">{sent()}…</span>
          </Show>
        </div>
      </Show>
    </div>
  );
}

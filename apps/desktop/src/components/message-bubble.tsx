import { createSignal, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { confirmDialog } from "~/components/confirm";
import { Markdown } from "~/components/markdown";
import { MediaAttachments } from "~/components/media-attachments";
import { actions } from "~/lib/store";
import type { Message } from "~/lib/types";

/**
 * One bubble — ported from the prototype's MessageBubble.
 *
 * Your turns are accent bubbles on the right, the agent's are surface bubbles on
 * the left, and platform notes are neutral chips in the middle. Hovering reveals
 * reply / copy / delete; the timestamp shows on the group's last bubble, so a
 * run of messages reads as one utterance rather than a stack of receipts.
 */
export function MessageBubble(props: {
  message: Message;
  /** When a long reply is split into several bubbles, this is one chunk. */
  contentOverride?: string;
  repliedTo?: Message;
  agentName: string;
  streaming?: boolean;
  showReplyQuote?: boolean;
  showMedia?: boolean;
  showMeta?: boolean;
  first?: boolean;
  last?: boolean;
  /** The thread's newest bubble — the only place an approval is still live. */
  actionable?: boolean;
}) {
  const m = () => props.message;
  const content = () => props.contentOverride ?? m().content;
  const isUser = () => m().sender_type === "user";
  const isSystem = () => m().sender_type === "system";

  // Hermes announces a dangerous command with a plain-text prompt (its
  // adapters without button support get the fallback form). Recognize it and
  // draw a real approval control instead of asking the user to type /approve.
  const approval = () => (!isUser() && !isSystem() ? parseApproval(content()) : null);

  const [copied, setCopied] = createSignal(false);

  const remove = async () => {
    const ok = await confirmDialog({
      title: "Delete this message?",
      message: "It disappears from the thread for good.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) void actions.deleteMessage(m());
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content());
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  // Platform notes — a dispatch landing, a report relayed, a doc saved. Neutral
  // by default; only genuine failures get the danger treatment.
  //
  // These are *not* pills. A dispatch can run to several hundred words, and
  // `rounded-full` on a paragraph draws a giant lozenge with the text swimming
  // inside it. The prototype's shape is right: a bordered card, left-aligned,
  // wrapping like prose. Errors are the one thing that stays centered and loud.
  return (
    <Show
      when={!isSystem()}
      fallback={
        <div class="flex justify-center py-1.5">
          <div
            class="max-w-[86%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2 text-[12px] leading-relaxed"
            classList={{
              "border border-v2-border-border-muted bg-v2-background-bg-layer-01 text-left text-v2-text-text-muted":
                !isFailure(content()),
              "border border-v2-state-border-danger bg-v2-state-bg-danger text-center text-v2-state-fg-danger":
                isFailure(content()),
            }}
          >
            {content()}
          </div>
        </div>
      }
    >
      <div
        class="group flex flex-col"
        classList={{ "items-end": isUser(), "items-start": !isUser() }}
      >
        <Show when={approval()}>
          {(a) => <ApprovalCard {...a()} actionable={props.actionable} />}
        </Show>

        <div class="flex max-w-[80%] items-end gap-1" classList={{ hidden: !!approval() }}>
          {/* Actions sit outside the bubble, on the side you'd reach from. */}
          <Show when={isUser()}>
            <Actions
              onReply={() => actions.setReplyTo(m())}
              onCopy={copy}
              onDelete={remove}
              copied={copied()}
            />
          </Show>

          <div
            title={timeLabel(m().created_at)}
            class="min-w-0 rounded-lg px-3 py-2"
            classList={{
              "bg-v2-background-bg-accent text-v2-text-text-inverse": isUser(),
              "rounded-br-sm": isUser() && !!props.last,
              "bg-v2-background-bg-layer-02 text-v2-text-text-base": !isUser(),
              "rounded-bl-sm": !isUser() && !!props.last,
            }}
          >
            <Show when={props.showReplyQuote && props.repliedTo}>
              {(quoted) => (
                <div
                  class="mb-1.5 border-l-2 pl-2"
                  classList={{
                    "border-[rgba(255,255,255,0.45)]": isUser(),
                    "border-v2-border-border-base": !isUser(),
                  }}
                >
                  <div class="text-[10.5px] font-medium opacity-80">
                    {quoted().sender_type === "user" ? "You" : props.agentName}
                  </div>
                  <div class="truncate text-[11px] opacity-70">
                    {snippet(quoted().content) || "attachment"}
                  </div>
                </div>
              )}
            </Show>

            <Show
              when={!isUser()}
              fallback={
                <div class="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                  {content()}
                </div>
              }
            >
              <div class="text-[13px] leading-relaxed">
                <Markdown content={content()} />
                <Show when={props.streaming}>
                  <span class="aular-caret ml-0.5 inline-block h-3.5 w-[2px] bg-v2-icon-icon-accent align-middle" />
                </Show>
              </div>
            </Show>

            <Show when={props.showMedia}>
              <MediaAttachments message={m()} />
            </Show>
          </div>

          <Show when={!isUser()}>
            <Actions
              onReply={() => actions.setReplyTo(m())}
              onCopy={copy}
              onDelete={remove}
              copied={copied()}
            />
          </Show>
        </div>

        {/* Time on the group's *last* bubble only: a run of messages reads as
            one utterance with one clock, not a stack of receipts. Every bubble
            still carries the exact time in its hover title. */}
        <Show when={props.showMeta}>
          <span class="px-1 pt-1 text-[10px] tabular-nums text-v2-text-text-faint">
            {timeLabel(m().created_at)}
          </span>
        </Show>
      </div>
    </Show>
  );
}

function Actions(props: {
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
  copied: boolean;
}) {
  return (
    <div class="flex shrink-0 items-center gap-0.5 pb-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <ActionButton label="Reply" onClick={props.onReply}>
        <Icon name="arrow-undo-down" size="small" />
      </ActionButton>
      <ActionButton label={props.copied ? "Copied" : "Copy"} onClick={props.onCopy}>
        <Icon name={props.copied ? "check-small" : "copy"} size="small" />
      </ActionButton>
      <ActionButton label="Delete" danger onClick={props.onDelete}>
        <Icon name="trash" size="small" />
      </ActionButton>
    </div>
  );
}

function ActionButton(props: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: any;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      class="flex size-6 items-center justify-center rounded transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      classList={{
        "text-v2-icon-icon-muted hover:text-v2-icon-icon-base": !props.danger,
        "text-v2-icon-icon-muted hover:text-v2-state-fg-danger": props.danger,
      }}
    >
      {props.children}
    </button>
  );
}

function timeLabel(iso: string): string {
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
function parseApproval(text: string): { command: string; reason: string } | null {
  if (!/dangerous command requires approval/i.test(text)) return null;
  const command = /```[a-z]*\n?([\s\S]*?)```/.exec(text)?.[1]?.trim() ?? "";
  const reason = /Reason:\s*([^\n]+)/.exec(text)?.[1]?.trim() ?? "";
  return { command, reason };
}

/**
 * The human-in-the-loop moment, as a control instead of a chore.
 *
 * Hermes blocks the agent's thread until the user answers; the buttons send
 * the same zero-token gateway commands the prompt asks you to type. Only the
 * thread's newest bubble is actionable — an old approval was already resolved,
 * and offering buttons on it would just earn a "no pending approval" reply.
 */
function ApprovalCard(props: {
  command: string;
  reason: string;
  actionable?: boolean;
}) {
  const [sent, setSent] = createSignal("");
  const act = (cmd: string, label: string) => {
    if (sent()) return;
    setSent(label);
    void actions.send(cmd);
  };

  return (
    <div class="w-full max-w-[560px] overflow-hidden rounded-lg border border-v2-state-border-warning bg-v2-state-bg-warning">
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
          class="mx-3.5 mt-2 overflow-x-auto rounded-md bg-v2-background-bg-layer-01 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-v2-text-text-base"
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
            class="rounded-md bg-v2-background-bg-accent px-3 py-1.5 text-[12px] font-medium text-v2-text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={!!sent()}
            onClick={() => act("/approve session", "Approved for session")}
            title="Also allow this command pattern for the rest of the session"
            class="rounded-md border border-v2-border-border-base px-3 py-1.5 text-[12px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-50"
          >
            Approve for session
          </button>
          <button
            type="button"
            disabled={!!sent()}
            onClick={() => act("/deny", "Denied")}
            class="rounded-md px-3 py-1.5 text-[12px] font-medium text-v2-state-fg-danger transition-colors hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-50"
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

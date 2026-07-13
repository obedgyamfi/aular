import { createSignal, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

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
}) {
  const m = () => props.message;
  const content = () => props.contentOverride ?? m().content;
  const isUser = () => m().sender_type === "user";
  const isSystem = () => m().sender_type === "system";

  const [copied, setCopied] = createSignal(false);

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
  return (
    <Show
      when={!isSystem()}
      fallback={
        <div class="flex justify-center py-1.5">
          <span
            class="max-w-[80%] rounded-full px-3 py-1 text-center text-[11px] leading-relaxed"
            classList={{
              "bg-v2-background-bg-layer-02 text-v2-text-text-muted":
                !isFailure(content()),
              "bg-v2-background-bg-layer-02 text-v2-text-text-danger":
                isFailure(content()),
            }}
          >
            {content()}
          </span>
        </div>
      }
    >
      <div
        class="group flex flex-col"
        classList={{ "items-end": isUser(), "items-start": !isUser() }}
      >
        <div class="flex max-w-[80%] items-end gap-1">
          {/* Actions sit outside the bubble, on the side you'd reach from. */}
          <Show when={isUser()}>
            <Actions
              onReply={() => actions.setReplyTo(m())}
              onCopy={copy}
              onDelete={() => void actions.deleteMessage(m())}
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
                    "border-white/40": isUser(),
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
                  <span class="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-v2-icon-icon-accent align-middle" />
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
              onDelete={() => void actions.deleteMessage(m())}
              copied={copied()}
            />
          </Show>
        </div>

        {/* The prototype's rule, and it's the right one: bubbles stay clean.
            Time lives in the feed's day dividers and in the bubble's tooltip;
            a clock under every line turns a conversation into a ledger — and a
            reserved hover row leaves a gap you can see but can't explain. This
            span costs no layout, and screen readers still get the time. */}
        <Show when={props.showMeta}>
          <span class="sr-only">{timeLabel(m().created_at)}</span>
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
        "text-v2-icon-icon-muted hover:text-v2-text-text-danger": props.danger,
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

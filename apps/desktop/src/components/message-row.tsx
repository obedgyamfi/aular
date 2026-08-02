import { createSignal, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Avatar } from "~/components/avatar";
import { confirmDialog } from "~/components/confirm";
import { MessageBody, timeLabel } from "~/components/message-body";
import { actions } from "~/lib/store";
import type { Message } from "~/lib/types";

/**
 * One row of the channel timeline — the Slack/Discord shape.
 *
 * Every turn, yours and the agent's alike, is a left-aligned row: a 40px
 * portrait gutter, an author line, then the words. No side-switching bubbles — in a
 * channel the author is named, not implied by which wall the message leans on.
 *
 * A run from the same author collapses into a continuation: the avatar and
 * author line are dropped, and the gutter holds the timestamp, revealed only on
 * hover. That's what makes a channel read as conversation instead of a stack of
 * receipts. The action rail floats over the row's top-right on hover.
 *
 * Geometry is Discord's: a 40px circular portrait, a 40px gutter that holds the
 * hover timestamp on continuation rows, and a hover tint that is deliberately a
 * half-step off the conversation (--row-hover) rather than a button-style fill.
 */
export function MessageRow(props: {
  message: Message;
  /** When a long reply arrives split into chunks, this is one chunk. */
  contentOverride?: string;
  repliedTo?: Message;
  authorName: string;
  /** First of an author's run — draws the avatar and author line. */
  first?: boolean;
  streaming?: boolean;
  showReplyQuote?: boolean;
  showMedia?: boolean;
  /** The thread's newest row — the only place an approval is still live. */
  actionable?: boolean;
  /** Agent is mid-turn: a live dot on the portrait. */
  working?: boolean;
  /** Selection mode is on: the row becomes a checkbox, not a message. */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (additive: boolean) => void;
  /** Rail action that turns selection mode on with this row already picked. */
  onStartSelect?: () => void;
}) {
  const m = () => props.message;
  const isUser = () => m().sender_type === "user";
  const author = () => (isUser() ? "You" : props.authorName);
  const [copied, setCopied] = createSignal(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.contentOverride ?? m().content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: "Delete this message?",
      message: "It disappears from the thread for good.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) void actions.deleteMessage(m());
  };

  return (
    <div
      // min-w-0 matters: without it the row sizes to its widest child's
      // min-content (a long code block, an unbroken URL) and drags a horizontal
      // scrollbar onto the whole timeline.
      class="group/message relative z-10 mx-1 flex min-w-0 gap-2.5 rounded-[var(--r4)] px-2 py-1 transition-colors"
      classList={{
        "hover:bg-[var(--row-hover)] focus-within:bg-[var(--row-hover)]": !props.selecting,
        "cursor-pointer": !!props.selecting,
        // Selected rows carry the accent at a wash — enough to scan a selection
        // down a long thread, not enough to fight the words inside it.
        "bg-[color-mix(in_srgb,var(--accent)_11%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]":
          !!props.selecting && !!props.selected,
        "hover:bg-[var(--row-hover)]": !!props.selecting && !props.selected,
      }}
      // Selection is the whole row's job while it's on: a checkbox you have to
      // hit precisely turns "clear these twelve" into twelve careful clicks.
      // Shift extends from the last pick, as every list does.
      onClick={(e) => props.selecting && props.onToggleSelect?.(e.shiftKey)}
      aria-selected={props.selecting ? !!props.selected : undefined}
      data-testid="message-row"
    >
      <Show when={props.selecting}>
        <div class="flex w-[18px] shrink-0 items-start justify-center pt-2.5">
          <span
            aria-hidden="true"
            class="grid size-[16px] place-items-center rounded-[4px] border transition-colors"
            classList={{
              "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]":
                !!props.selected,
              "border-[var(--line-strong)]": !props.selected,
            }}
          >
            <Show when={props.selected}>
              <Icon name="check-small" size="small" />
            </Show>
          </span>
        </div>
      </Show>

      {/* The gutter: portrait on the first of a run, hover-timestamp after. */}
      <Show
        when={props.first}
        fallback={
          <div
            aria-hidden="true"
            class="flex w-10 shrink-0 select-none items-start justify-end self-stretch pt-1"
          >
            <span class="text-[10px] tabular-nums text-[var(--faint)] opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
              {timeLabel(m().created_at)}
            </span>
          </div>
        }
      >
        <div class="relative shrink-0">
          <Avatar name={author()} size={40} circle />
          <Show when={props.working}>
            <span
              aria-hidden="true"
              class="absolute -bottom-0.5 -right-0.5 grid size-3 place-items-center rounded-full bg-[var(--bg)]"
            >
              <span class="size-2 rounded-full bg-[var(--green)]" />
            </span>
          </Show>
        </div>
      </Show>

      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <Show when={props.first}>
          <div class="flex min-w-0 flex-wrap items-center gap-x-1.5 leading-4">
            <span class="truncate text-[14px] font-semibold leading-4 tracking-tight text-[var(--text)]">
              {author()}
            </span>
            {/* Discord's APP chip, and it earns its place for the same reason:
                in a room where most of the voices aren't human, the ones that
                aren't should say so. */}
            <Show when={!isUser()}>
              <span class="rounded-[3px] bg-[var(--accent)] px-1 py-px text-[10px] font-bold uppercase leading-[13px] tracking-[0.02em] text-[var(--on-accent)]">
                Agent
              </span>
            </Show>
            <span class="text-[11px] tabular-nums text-[var(--faint)]">
              {timeLabel(m().created_at)}
            </span>
          </div>
        </Show>

        <MessageBody
          message={m()}
          contentOverride={props.contentOverride}
          repliedTo={props.repliedTo}
          agentName={props.authorName}
          streaming={props.streaming}
          showReplyQuote={props.showReplyQuote}
          showMedia={props.showMedia}
          actionable={props.actionable}
        />
      </div>

      {/* The floating rail — Discord's hover affordance, over the row's corner.
          Gone while selecting: its buttons act on one message, and offering
          them mid-selection just puts three small targets over a row whose
          entire job is now to be clicked. */}
      <Show when={!props.selecting}>
        <div class="absolute -top-3 right-3 z-20 flex items-center gap-0.5 rounded-[var(--pill)] border border-[var(--line)] bg-[var(--surface)] px-1 py-0.5 opacity-0 shadow-[var(--shadow-1)] transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
          <RailButton label="Reply" onClick={() => actions.setReplyTo(m())}>
            <Icon name="arrow-undo-down" size="small" />
          </RailButton>
          <RailButton label={copied() ? "Copied" : "Copy"} onClick={() => void copy()}>
            <Icon name={copied() ? "check-small" : "copy"} size="small" />
          </RailButton>
          <Show when={props.onStartSelect}>
            <RailButton label="Select" onClick={() => props.onStartSelect?.()}>
              <Icon name="circle-check" size="small" />
            </RailButton>
          </Show>
          <RailButton label="Delete" danger onClick={() => void remove()}>
            <Icon name="trash" size="small" />
          </RailButton>
        </div>
      </Show>
    </div>
  );
}

function RailButton(props: {
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
      // The event must not reach the row. Select turns selection mode on, and
      // the row's own handler — reading the signal that press just set — would
      // catch the same bubbling click and immediately toggle the pick back off.
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
      class="grid size-6 place-items-center rounded-full transition-colors hover:bg-[var(--element-hover)]"
      classList={{
        "text-[var(--muted)] hover:text-[var(--text)]": !props.danger,
        "text-[var(--muted)] hover:text-v2-state-fg-danger": props.danger,
      }}
    >
      {props.children}
    </button>
  );
}

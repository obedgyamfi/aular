import { createMemo, createSignal, Show } from "solid-js";
import ChevronRight from "lucide-solid/icons/chevron-right";
import CircleSlash from "lucide-solid/icons/circle-slash";
import CornerDownRight from "lucide-solid/icons/corner-down-right";
import Inbox from "lucide-solid/icons/inbox";
import PauseCircle from "lucide-solid/icons/pause-circle";

import { Avatar } from "~/components/avatar";
import { Markdown } from "~/components/markdown";
import { previewText } from "~/lib/store";
import type { Message } from "~/lib/types";

/**
 * The spine talking — dispatches landing, reports coming back, work canceled.
 *
 * These arrive as `system` messages carrying a small protocol in their first
 * line: an emoji, an actor, sometimes a task id, then the payload. Rendering
 * them as one generic grey card meant a teammate's report — the actual result
 * of delegated work — looked identical to "task canceled", and the markdown in
 * them printed its own asterisks.
 *
 * So the shape follows the payload. A report is the mirror of a delegation
 * card and gets the same weight: whose it is, and what they said. Bookkeeping
 * (dispatched, canceled) is a quiet line, because the delegation group above
 * already says the same thing with more detail.
 */
type Note =
  | { kind: "report"; who: string; body: string }
  | { kind: "task"; who: string; id?: string; body: string }
  | { kind: "input"; who: string; id?: string; body: string }
  | { kind: "quiet"; icon: "dispatch" | "cancel"; body: string }
  | { kind: "plain"; body: string };

/** The protocol lives in the first line; everything after it is the payload. */
export function parseSystemNote(content: string): Note {
  const s = content.trim();
  const after = (m: RegExpMatchArray) => s.slice(m[0].length).trim();

  let m = s.match(/^📬\s*(.+?)\s+reports:\s*/);
  if (m) return { kind: "report", who: m[1]!, body: after(m) };

  m = s.match(/^📨\s*Task from\s+(.+?)\s*(?:`([^`]+)`)?:\s*/);
  if (m) return { kind: "task", who: m[1]!, id: m[2], body: after(m) };

  m = s.match(/^⏸\s*(.+?)\s+needs input on a task you assigned\s*\(`([^`]+)`\):\s*/);
  if (m) return { kind: "input", who: m[1]!, id: m[2], body: after(m) };

  if (/^→/.test(s)) return { kind: "quiet", icon: "dispatch", body: s.replace(/^→\s*/, "") };
  if (/^⨯/.test(s)) return { kind: "quiet", icon: "cancel", body: s.replace(/^⨯\s*/, "") };

  return { kind: "plain", body: s };
}

export function SystemNote(props: { content: string }) {
  const note = createMemo(() => parseSystemNote(props.content));

  return (
    <Show
      when={note().kind === "report" || note().kind === "task" || note().kind === "input"}
      fallback={<Bookkeeping note={note()} />}
    >
      <ActorNote note={note() as Extract<Note, { who: string }>} />
    </Show>
  );
}

/**
 * A report, an assignment, or a question — something a teammate said.
 *
 * Left-aligned to the prose column rather than centred: this is content, not a
 * divider, and centring it made a two-paragraph report read as a banner.
 */
function ActorNote(props: { note: Extract<Note, { who: string }> }) {
  const n = () => props.note;
  const [open, setOpen] = createSignal(false);

  const label = () =>
    n().kind === "report" ? "reports" : n().kind === "task" ? "assigned work" : "needs input";
  const long = () => n().body.length > 240;

  return (
    <section
      class="not-prose my-1 w-full max-w-[560px] overflow-hidden rounded-[var(--r3)] border bg-[var(--surface)]"
      classList={{
        "border-v2-state-border-warning": n().kind === "input",
        "border-[var(--line)]": n().kind !== "input",
      }}
    >
      <div class="flex items-center gap-2 px-3 py-2">
        <span class="shrink-0 text-[var(--faint)]">
          <Show when={n().kind === "input"} fallback={<Inbox size={13} stroke-width={2} />}>
            <PauseCircle size={13} stroke-width={2} />
          </Show>
        </span>
        <Avatar name={n().who} size={16} circle />
        <span class="truncate text-[12px] font-semibold text-[var(--text-2)]">{n().who}</span>
        <span class="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
          {label()}
        </span>
      </div>

      {/* Short payloads read in place; a long one folds, the same way a
          delegation's brief does. */}
      <Show
        when={long()}
        fallback={
          <div class="min-w-0 break-words border-t border-[var(--line)] px-3 py-2 text-[12.5px] leading-[18px] [overflow-wrap:anywhere]">
            <Markdown content={n().body} sans />
          </div>
        }
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open()}
          class="flex w-full items-start gap-1.5 border-t border-[var(--line)] px-3 py-2 text-left transition-colors hover:bg-[var(--element-hover)]"
        >
          <span
            class="mt-0.5 shrink-0 text-[var(--faint)] transition-transform"
            classList={{ "rotate-90": open() }}
          >
            <ChevronRight size={13} stroke-width={2} />
          </span>
          <span
            class="min-w-0 flex-1 break-words text-[12.5px] leading-[18px] text-[var(--text-2)]"
            classList={{ truncate: !open() }}
          >
            <Show when={open()} fallback={previewText(n().body)}>
              <Markdown content={n().body} sans />
            </Show>
          </span>
        </button>
      </Show>
    </section>
  );
}

/**
 * Bookkeeping — "dispatched to X", "task canceled".
 *
 * One muted line in the tool-row idiom, because the delegation group directly
 * above already says who got what and where it got to. Kept rather than hidden:
 * the platform said it, and silently dropping platform messages would make the
 * transcript a worse record than the database.
 */
function Bookkeeping(props: { note: Note }) {
  const n = () => props.note;
  const failed = () => n().kind === "plain" && isFailure(n().body);

  return (
    <Show
      when={!failed()}
      fallback={
        <div class="flex justify-center py-1.5">
          <div class="max-w-[86%] whitespace-pre-wrap break-words rounded-[var(--r3)] border border-v2-state-border-danger bg-v2-state-bg-danger px-3.5 py-2 text-center text-[12px] leading-relaxed text-v2-state-fg-danger">
            {n().body}
          </div>
        </div>
      }
    >
      <div class="flex min-h-6 items-center gap-1.5 py-0.5 text-[12px] text-[var(--faint)]">
        <span class="grid size-4 shrink-0 place-items-center">
          <Show
            when={n().kind === "quiet" && (n() as Extract<Note, { kind: "quiet" }>).icon === "cancel"}
            fallback={<CornerDownRight size={12} stroke-width={2} />}
          >
            <CircleSlash size={12} stroke-width={2} />
          </Show>
        </span>
        <span class="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
          <Markdown content={n().body} sans />
        </span>
      </div>
    </Show>
  );
}

/** Only a genuine failure gets the danger colour — the prototype's rule. */
function isFailure(text: string): boolean {
  return /^(agent unavailable|could not reach)/i.test(text.trim());
}

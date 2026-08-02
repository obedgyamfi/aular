import { createMemo, createSignal, Show } from "solid-js";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Terminal from "lucide-solid/icons/terminal";

import { Markdown } from "~/components/markdown";
import { timeLabel } from "~/components/message-body";
import { SLASH_COMMANDS } from "~/lib/slash-commands";
import { previewText } from "~/lib/store";
import type { Message } from "~/lib/types";

/**
 * A slash command and what came back, as one thing.
 *
 * These are not conversation. `/status` is an instruction to the gateway, and
 * its answer is machinery reporting on itself — but the timeline drew both as
 * ordinary messages, so asking the runtime its token count produced a portrait,
 * an author line and an APP badge, sitting in the thread with the same weight as
 * something an agent actually said.
 *
 * So: one compact block in the tool-row idiom, the command in mono where a
 * command belongs, its reply attached beneath and folded when long. It reads as
 * an aside rather than a turn, which is what it is.
 */
export function CommandCard(props: { ask: Message; reply?: Message }) {
  const [open, setOpen] = createSignal(false);

  /**
   * Gateway replies are prefixed with an emoji the app forbids everywhere else.
   * It comes from the runtime rather than a model, so it is not a prompt problem
   * to fix — but the command name above already says what this is, so the glyph
   * is carrying no information the block does not.
   */
  const body = createMemo(() =>
    (props.reply?.content ?? "")
      .replace(/^\s*[\p{Extended_Pictographic}←-⇿☀-➿️‍]+\s*/gu, "")
      .trim(),
  );
  const long = () => body().length > 220;

  return (
    <section class="not-prose w-full max-w-[560px] overflow-hidden rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)]">
      <div class="flex items-center gap-2 px-3 py-1.5">
        <span class="shrink-0 text-[var(--faint)]">
          <Terminal size={13} stroke-width={2} />
        </span>
        <code class="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-2)]">
          {props.ask.content.trim()}
        </code>
        <span class="shrink-0 text-[10.5px] tabular-nums text-[var(--faint)]">
          {timeLabel(props.ask.created_at)}
        </span>
      </div>

      <Show when={body()}>
        <Show
          when={long()}
          fallback={
            <div class="min-w-0 break-words border-t border-[var(--line)] px-3 py-2 text-[12px] leading-[17px] text-[var(--text-2)] [overflow-wrap:anywhere]">
              <Markdown content={body()} sans />
            </div>
          }
        >
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open()}
            class="flex w-full items-start gap-1.5 border-t border-[var(--line)] px-3 py-1.5 text-left transition-colors hover:bg-[var(--element-hover)]"
          >
            <span
              class="mt-0.5 shrink-0 text-[var(--faint)] transition-transform"
              classList={{ "rotate-90": open() }}
            >
              <ChevronRight size={12} stroke-width={2} />
            </span>
            <span
              class="min-w-0 flex-1 break-words text-[12px] leading-[17px] text-[var(--text-2)]"
              classList={{ truncate: !open() }}
            >
              <Show when={open()} fallback={previewText(body())}>
                <Markdown content={body()} sans />
              </Show>
            </span>
          </button>
        </Show>
      </Show>
    </section>
  );
}

/**
 * Is this message a slash command?
 *
 * Matched against the registry rather than just a leading slash: an absolute
 * path pasted into the composer starts the same way, and rendering "/home/..."
 * as a gateway command would be worse than leaving it a message.
 */
export function isSlashCommand(m: Message): boolean {
  if (m.sender_type !== "user") return false;
  const first = m.content.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first || !first.startsWith("/")) return false;
  return SLASH_COMMANDS.some((c) => c.cmd.toLowerCase() === first);
}

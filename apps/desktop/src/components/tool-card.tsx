import { createMemo, createSignal, Show } from "solid-js";
import { ChevronDown } from "lucide-solid";

import type { ToolCall } from "~/lib/types";

/**
 * A tool call, as Buzz draws it: NOT a card.
 *
 * One borderless 24px line in the flow of the conversation — a past-tense verb,
 * the thing it acted on, and a chevron. Muted until you hover or open it, so a
 * turn that reached for nine tools reads as nine quiet lines instead of nine
 * boxes shouting over the prose. Expanding reveals the exact call and whatever
 * the runtime captured back.
 *
 * Status is honest to what Hermes reports: `running` while the turn is in
 * flight, `settled` once its reply finalized. We never fake per-call success —
 * the verb just moves from present to past tense.
 */
export function ToolCard(props: { tool: ToolCall }) {
  const [open, setOpen] = createSignal(false);
  const running = () => props.tool.status === "running";

  const command = () => props.tool.request_payload?.preview;
  const snippet = () => props.tool.response_payload?.snippet;
  const canExpand = () => !!command() || !!snippet();

  /** The salient argument — what the tool actually touched. */
  const object = createMemo(() => {
    const p = props.tool.request_payload;
    const args = p?.args;
    if (args && typeof args === "object") {
      const a = args as Record<string, unknown>;
      for (const key of ["command", "path", "file", "file_path", "url", "query", "question", "name"]) {
        const v = a[key];
        if (typeof v === "string" && v.trim()) return clip(v.trim());
      }
    }
    if (typeof args === "string" && args.trim()) return clip(args.trim());
    if (p?.preview) return clip(String(p.preview));
    return "";
  });

  return (
    <div class="not-prose w-full">
      <button
        type="button"
        disabled={!canExpand()}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={canExpand() ? open() : undefined}
        class="group/row flex min-h-6 w-full max-w-full items-center gap-1.5 text-left transition-colors enabled:cursor-pointer"
        classList={{
          "text-[var(--text)]": open(),
          "text-[var(--muted)]": !open(),
        }}
      >
        {/* A live dot while it runs; nothing once it's settled — a finished
            command needs no decoration, and a checkmark on every line is noise. */}
        <Show when={running()}>
          <span class="aular-breathe size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
        </Show>

        <span
          class="shrink-0 text-[13px] font-semibold transition-colors group-hover/row:text-[var(--text)]"
          classList={{ "text-[var(--text)]": open(), "text-[var(--muted)]": !open() }}
        >
          {verb(props.tool.tool_name, running())}
        </span>

        <Show when={object()}>
          <span
            class="min-w-0 truncate font-mono text-[12.5px] font-normal transition-colors group-hover/row:text-[var(--text-2)]"
            classList={{ "text-[var(--text-2)]": open(), "text-[var(--faint)]": !open() }}
          >
            {object()}
          </span>
        </Show>

        <Show when={canExpand()}>
          <ChevronDown
            size={14}
            stroke-width={2}
            class="shrink-0 text-[var(--faint)] transition-transform group-hover/row:text-[var(--text)]"
            style={{ transform: open() ? "rotate(180deg)" : "none" }}
          />
        </Show>
      </button>

      <Show when={open() && canExpand()}>
        <div class="mt-1.5 flex flex-col gap-2 pb-1">
          <Show when={command()}>
            <pre class="overflow-x-auto whitespace-pre-wrap rounded-[var(--r2)] border border-[var(--line)] bg-[var(--surface)] p-2.5 font-mono text-[11.5px] leading-relaxed text-[var(--text-2)]">
              {command()}
            </pre>
          </Show>
          <Show when={snippet()}>
            <pre
              data-selectable
              class="max-h-[280px] overflow-auto whitespace-pre-wrap rounded-[var(--r2)] border border-[var(--line)] bg-[var(--surface)] p-2.5 font-mono text-[11.5px] leading-relaxed text-[var(--text-2)]"
            >
              {snippet()}
            </pre>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/**
 * A human verb for a tool, tensed by state — Buzz's "Editing file" → "Edited
 * file". Reading "Searched" beside a path says more than the raw tool id.
 */
function verb(tool: string, running: boolean): string {
  const t = tool.toLowerCase();
  const pick = (present: string, past: string) => (running ? present : past);

  if (/(^|_)(terminal|bash|shell|exec|run)/.test(t)) return pick("Running", "Ran");
  if (/(^|_)(read|view|cat|open)/.test(t)) return pick("Reading", "Read");
  if (/(^|_)(write|edit|patch|apply)/.test(t)) return pick("Editing", "Edited");
  if (/(^|_)(search|grep|find|glob)/.test(t)) return pick("Searching", "Searched");
  if (/^browser/.test(t)) return pick("Browsing", "Browsed");
  if (/(^|_)memory/.test(t)) return pick("Recalling", "Recalled");
  if (/(^|_)(todo|task)/.test(t)) return pick("Updating", "Updated");
  if (/^skill/.test(t)) return pick("Using skill", "Used skill");
  if (/(^|_)(clarify|ask)/.test(t)) return pick("Asking", "Asked");
  return pick("Using " + tool, "Used " + tool);
}

function clip(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 96 ? flat.slice(0, 93) + "…" : flat;
}

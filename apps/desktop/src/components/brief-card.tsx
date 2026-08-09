import { createSignal, For, Show } from "solid-js";
import ChevronDown from "lucide-solid/icons/chevron-down";
import CircleCheck from "lucide-solid/icons/circle-check";
import Lightbulb from "lucide-solid/icons/lightbulb";
import TriangleAlert from "lucide-solid/icons/triangle-alert";

import { Markdown } from "~/components/markdown";
import { age } from "~/components/task-state";
import { actions } from "~/lib/store";
import type { Brief } from "~/lib/types";

/**
 * A brief — an agent's typed report, in the flow of the channel.
 *
 * Drawn as an activity row like a tool call, not a panel: a verb, what it was
 * about, and a chevron. A run of reports then reads as a few quiet lines instead
 * of a stack of cards competing with the conversation.
 *
 * The ONE exception is a decision still waiting on you. It keeps the row shape
 * but opens by default and tints to the accent — a blocker you have to click
 * twice to find is a blocker that gets missed. Answered decisions collapse back
 * down and keep the record: what was asked, and what you chose.
 */
const META = {
  decision: { icon: TriangleAlert, pending: "Needs your call", done: "Decided" },
  result: { icon: CircleCheck, pending: "Reported", done: "Reported" },
  insight: { icon: Lightbulb, pending: "Noted", done: "Noted" },
} as const;

export function BriefCard(props: { brief: Brief; compact?: boolean }) {
  const [busy, setBusy] = createSignal("");
  const b = () => props.brief;
  const meta = () => META[b().kind];
  const decision = () => b().kind === "decision";
  const answered = () => !!b().answered_at;

  /** A live decision: the only brief that demands attention by default. */
  const live = () => decision() && !answered();
  const [open, setOpen] = createSignal(false);
  const expanded = () => live() || open();
  const hasDetail = () => !!b().body || decision();

  const answer = async (option: string) => {
    if (busy() || answered()) return;
    setBusy(option);
    try {
      await actions.answerBrief(b().id, option);
    } finally {
      setBusy("");
    }
  };

  return (
    <div class="not-prose w-full">
      <button
        type="button"
        disabled={!hasDetail() || live()}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={hasDetail() ? expanded() : undefined}
        class="group/row flex min-h-6 w-full max-w-full items-center gap-1.5 text-left transition-colors enabled:cursor-pointer"
      >
        {(() => {
          const I = meta().icon;
          return (
            <I size={13} class="shrink-0" color={live() ? "var(--accent-text)" : "var(--muted)"} />
          );
        })()}

        <span
          class="shrink-0 text-[13px] font-semibold transition-colors group-hover/row:text-[var(--text)]"
          style={{ color: live() ? "var(--accent-text)" : "var(--muted)" }}
        >
          {answered() || !decision() ? meta().done : meta().pending}
        </span>

        <span
          class="min-w-0 flex-1 truncate text-[13px] transition-colors group-hover/row:text-[var(--text)]"
          classList={{
            "text-[var(--text)]": expanded(),
            "text-[var(--text-2)]": !expanded(),
          }}
        >
          {b().title}
        </span>

        <span class="shrink-0 text-[10.5px] text-[var(--faint)]">
          {b().agent_name} · {age(b().created_at)}
        </span>

        <Show when={hasDetail() && !live()}>
          <ChevronDown
            size={14}
            stroke-width={2}
            class="shrink-0 text-[var(--faint)] transition-transform group-hover/row:text-[var(--text)]"
            style={{ transform: open() ? "rotate(180deg)" : "none" }}
          />
        </Show>
      </button>

      {/* The detail hangs off a quote rule rather than sitting in a box, so an
          open brief still belongs to the timeline instead of interrupting it. */}
      <Show when={expanded()}>
        <div
          class="mt-1.5 border-l-2 pl-3"
          style={{ "border-color": live() ? "var(--accent)" : "var(--line)" }}
        >
          <Show when={b().body && !props.compact}>
            <div class="text-[12.5px] leading-relaxed text-[var(--text-2)]">
              <Markdown content={b().body} sans />
            </div>
          </Show>

          <Show when={decision()}>
            <Show
              when={!answered()}
              fallback={
                <div class="flex items-center gap-1.5 pt-1 text-[11.5px] text-[var(--muted)]">
                  <CircleCheck size={13} color="var(--green)" />
                  You chose <span class="font-[650] text-[var(--text)]">{b().answer}</span>.
                </div>
              }
            >
              <div class="flex flex-wrap items-center gap-2 pt-2">
                <For each={b().options}>
                  {(o, i) => (
                    <button
                      type="button"
                      disabled={!!busy()}
                      onClick={() => void answer(o)}
                      class="rounded-[var(--r2)] px-3 py-[7px] text-[12.5px] font-[650] transition-colors disabled:opacity-50"
                      style={
                        i() === 0
                          ? { background: "var(--text)", color: "var(--bg)" }
                          : {
                              border: "1px solid var(--line-strong)",
                              background: "var(--surface)",
                              color: "var(--text-2)",
                            }
                      }
                    >
                      {busy() === o ? "Sending…" : o}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
}

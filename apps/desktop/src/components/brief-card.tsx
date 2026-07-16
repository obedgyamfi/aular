import { createSignal, For, Show } from "solid-js";
import { CircleCheck, GitBranch, Lightbulb } from "lucide-solid";

import { Avatar } from "~/components/avatar";
import { Markdown } from "~/components/markdown";
import { age } from "~/components/task-state";
import { actions } from "~/lib/store";
import type { Brief } from "~/lib/types";

/**
 * A brief — an agent's typed report, instead of an outcome buried in prose.
 *
 * A `decision` is the only kind that owes you anything: it carries the actual
 * options the agent can act on, so answering is a click, not a paragraph. A
 * `result` says a deliverable landed; an `insight` is something the agent
 * thought you should know. Once answered, the card keeps the record — what was
 * asked, and what you decided.
 */
const META = {
  decision: {
    label: "Decision needed",
    color: "var(--v2-state-fg-warning)",
    border: "border-v2-state-border-warning",
    bg: "bg-v2-state-bg-warning",
    icon: GitBranch,
  },
  result: {
    label: "Result",
    color: "var(--v2-state-fg-success)",
    border: "border-v2-border-border-muted",
    bg: "bg-v2-background-bg-layer-01",
    icon: CircleCheck,
  },
  insight: {
    label: "Insight",
    color: "var(--v2-text-text-accent)",
    border: "border-v2-border-border-muted",
    bg: "bg-v2-background-bg-layer-01",
    icon: Lightbulb,
  },
} as const;

export function BriefCard(props: { brief: Brief; compact?: boolean }) {
  const [busy, setBusy] = createSignal("");
  const b = () => props.brief;
  const meta = () => META[b().kind];
  const answered = () => !!b().answered_at;

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
    <div
      class="w-full max-w-[560px] overflow-hidden rounded-lg border"
      classList={{
        [meta().border]: true,
        [meta().bg]: true,
        "opacity-90": answered(),
      }}
    >
      <div class="flex items-center gap-2 px-3.5 pt-2.5">
        {(() => {
          const I = meta().icon;
          return <I size={13} color={meta().color} />;
        })()}
        <span
          class="text-[10.5px] font-semibold uppercase tracking-[0.07em]"
          style={{ color: meta().color }}
        >
          {meta().label}
        </span>
        <span class="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-[10px] text-v2-text-text-faint">
          <Avatar name={b().agent_name} size={14} />
          {b().agent_name} · {age(b().created_at)}
        </span>
      </div>

      <p class="px-3.5 pt-1.5 text-[13px] font-medium leading-snug text-v2-text-text-base">
        {b().title}
      </p>

      <Show when={b().body && !props.compact}>
        <div class="px-3.5 pt-1 text-[12px] leading-relaxed text-v2-text-text-muted">
          <Markdown content={b().body} />
        </div>
      </Show>

      <Show when={b().kind === "decision"}>
        <Show
          when={!answered()}
          fallback={
            <p class="px-3.5 pb-3 pt-2 text-[11.5px] text-v2-text-text-muted">
              You chose{" "}
              <span class="font-medium text-v2-text-text-base">{b().answer}</span>.
            </p>
          }
        >
          <div class="flex flex-wrap items-center gap-1.5 px-3.5 pb-3 pt-2.5">
            <For each={b().options}>
              {(o, i) => (
                <button
                  type="button"
                  disabled={!!busy()}
                  onClick={() => void answer(o)}
                  class="rounded-md px-3 py-1.5 text-[12px] font-medium transition-opacity disabled:opacity-50"
                  classList={{
                    "bg-v2-background-bg-accent text-v2-text-text-inverse hover:opacity-90":
                      i() === 0,
                    "border border-v2-border-border-base text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover":
                      i() > 0,
                  }}
                >
                  {busy() === o ? "Sending…" : o}
                </button>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={b().kind !== "decision"}>
        <div class="pb-2.5" />
      </Show>
    </div>
  );
}

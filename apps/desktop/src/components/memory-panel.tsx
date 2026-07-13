import { createResource, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { api } from "~/lib/api";
import type { MemoryNode } from "~/lib/types";

/**
 * Memory — ported from the prototype's MemoryPanel.
 *
 * A read-only window into the Hermes memory graph: what your agents have
 * remembered about you, and the skills they picked up along the way. Read live,
 * not cached, because the graph is the source of truth and a stale copy of
 * someone's memory is worse than no copy.
 */
export function MemoryPanel() {
  const [graph] = createResource(() => api.getMemory().catch(() => null));

  return (
    <div class="flex flex-col gap-5">
      <Show
        when={!graph.loading}
        fallback={
          <p class="py-6 text-[11.5px] text-v2-text-text-weak">Reading memory…</p>
        }
      >
        <Section
          label="Remembered about you"
          count={graph()?.memories.length ?? 0}
          empty="Nothing yet — your agents learn as you work with them."
        >
          <For each={graph()?.memories ?? []}>
            {(m) => (
              <div class="flex items-start gap-2 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 py-2">
                <Show when={m.pinned}>
                  <span class="mt-px shrink-0 text-v2-icon-icon-accent" title="Pinned">
                    <Icon name="status" size="small" />
                  </span>
                </Show>
                <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="text-[12px] leading-relaxed text-v2-text-text-base">
                    {m.label}
                  </span>
                  <Show when={m.source}>
                    <span class="text-[10px] uppercase tracking-[0.08em] text-v2-text-text-weak">
                      {m.source}
                    </span>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </Section>

        <Section
          label="Learned skills"
          count={graph()?.skills.length ?? 0}
          empty="No learned skills yet."
        >
          <For each={graph()?.skills ?? []}>{(s) => <SkillRow skill={s} />}</For>
        </Section>
      </Show>
    </div>
  );
}

function SkillRow(props: { skill: MemoryNode }) {
  const s = () => props.skill;
  return (
    <div class="flex items-center gap-2.5 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 py-2">
      <span class="min-w-0 flex-1 truncate text-[12px] text-v2-text-text-base">
        {s().label}
      </span>
      <Show when={s().category}>
        <span class="shrink-0 rounded-full bg-v2-background-bg-layer-03 px-2 py-0.5 text-[10px] text-v2-text-text-muted">
          {s().category}
        </span>
      </Show>
      <span class="shrink-0 text-[10.5px] tabular-nums text-v2-text-text-weak">
        {s().use_count === 1 ? "1 use" : `${s().use_count} uses`}
      </span>
    </div>
  );
}

function Section(props: {
  label: string;
  count: number;
  empty: string;
  children: any;
}) {
  return (
    <div class="flex flex-col gap-1.5">
      <span class="text-[10px] font-medium uppercase tracking-[0.08em] text-v2-text-text-weak">
        {props.label}
        {props.count > 0 ? ` · ${props.count}` : ""}
      </span>
      <Show
        when={props.count > 0}
        fallback={
          <p class="text-[11.5px] text-v2-text-text-weak">{props.empty}</p>
        }
      >
        <div class="flex flex-col gap-1">{props.children}</div>
      </Show>
    </div>
  );
}

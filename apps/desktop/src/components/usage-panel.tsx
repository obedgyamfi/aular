import { createResource, createSignal, For, Show } from "solid-js";

import { api } from "~/lib/api";

/**
 * Usage — ported from the prototype's UsagePanel.
 *
 * Backed by silent metering: the beta measures but never enforces, and the copy
 * says so, because a number next to a bar reads as a limit unless you tell
 * people it isn't.
 */
const WINDOWS = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

export function UsagePanel() {
  const [window, setWindow] = createSignal("30d");
  const [resetting, setResetting] = createSignal(false);
  const [summary, { refetch }] = createResource(window, (w) =>
    api.getUsageSummary(w).catch(() => null),
  );

  const totals = () => summary()?.totals;
  const perAgent = () => summary()?.per_agent ?? [];
  const max = () => Math.max(1, ...perAgent().map((a) => a.messages));

  const reset = async () => {
    if (resetting()) return;
    setResetting(true);
    try {
      await api.resetUsage();
      await refetch();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex gap-1">
          <For each={WINDOWS}>
            {(w) => {
              const on = () => window() === w.id;
              return (
                <button
                  type="button"
                  onClick={() => setWindow(w.id)}
                  class="rounded-full border px-2.5 py-1 text-[11.5px] transition-colors"
                  classList={{
                    "border-v2-border-border-focus bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base":
                      on(),
                    "border-v2-border-border-muted text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover":
                      !on(),
                  }}
                >
                  {w.label}
                </button>
              );
            }}
          </For>
        </div>

        <button
          type="button"
          onClick={reset}
          disabled={resetting()}
          title="Start counting from now. History is filtered, not deleted."
          class="rounded-md px-2 py-1 text-[11.5px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-50"
        >
          {resetting() ? "Resetting…" : "Reset counters"}
        </button>
      </div>

      <div class="flex items-end gap-2">
        <span class="text-[28px] font-medium leading-none tabular-nums text-v2-text-text-base">
          {(totals()?.messages ?? 0).toLocaleString()}
        </span>
        <span class="pb-0.5 text-[12px] text-v2-text-text-muted">
          messages exchanged
        </span>
      </div>

      <p class="text-[11.5px] text-v2-text-text-muted">
        You:{" "}
        <span class="tabular-nums text-v2-text-text-base">
          {(totals()?.user_messages ?? 0).toLocaleString()}
        </span>
        {" · "}
        Agents:{" "}
        <span class="tabular-nums text-v2-text-text-base">
          {(totals()?.agent_messages ?? 0).toLocaleString()}
        </span>
        {" · "}≈{(totals()?.chars ?? 0).toLocaleString()} chars
      </p>

      <Show when={perAgent().length}>
        <div class="flex flex-col gap-2 pt-1">
          <For each={perAgent().slice(0, 8)}>
            {(a) => (
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between text-[11.5px]">
                  <span class="truncate text-v2-text-text-base">
                    {a.agent_name || "Removed agent"}
                  </span>
                  <span class="shrink-0 tabular-nums text-v2-text-text-muted">
                    {a.messages.toLocaleString()}
                  </span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-v2-background-bg-layer-03">
                  <div
                    class="h-full rounded-full bg-v2-icon-icon-accent"
                    style={{ width: `${(a.messages / max()) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={!summary.loading && !totals()?.messages}>
        <p class="text-[11.5px] text-v2-text-text-faint">
          No activity in this window yet.
        </p>
      </Show>

      <p class="pt-1 text-[10.5px] text-v2-text-text-faint">
        Beta — usage is measured, never limited.
      </p>
    </div>
  );
}

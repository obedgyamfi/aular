import { createMemo, createResource, For, Show } from "solid-js";

import { Avatar } from "~/components/avatar";
import { compact, DualAreaChart, type ChartPoint } from "~/components/charts";
import { api } from "~/lib/api";
import { state } from "~/lib/store";
import type { AgentTokenUsage } from "~/lib/types";

/**
 * Usage & tokens — the real cost of the work.
 *
 * Numbers come from the same endpoints as always: Hermes' session store and the
 * metering log. Lives in Settings → Usage & limits (it used to be an
 * Organization tab). Stat cards, two 14-day area charts, and a per-agent
 * consumption list, all on the design's surface cards.
 */
export function UsageReport() {
  const [tokens] = createResource(() => api.getTokenUsage().catch(() => null));
  const [daily] = createResource(() => api.getAnalyticsDaily(14).catch(() => null));

  const totals = () => tokens()?.totals;
  const cost = () => (daily()?.tokens ?? []).reduce((s, d) => s + (d.cost_usd || 0), 0);

  const tokenDays = createMemo<ChartPoint[]>(() =>
    padDays(14, daily()?.tokens ?? [], (d) => ({ a: d.input_tokens, b: d.output_tokens })),
  );
  const messageDays = createMemo<ChartPoint[]>(() =>
    padDays(14, daily()?.messages ?? [], (d) => ({ a: d.user, b: d.agent })),
  );

  return (
    <div class="flex flex-col gap-[18px]">
      {/* the stat cards — serif 26px figures on surface cards */}
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Total tokens"
          value={compact((totals()?.input_tokens ?? 0) + (totals()?.output_tokens ?? 0))}
        />
        <Stat label="Estimated cost" value={`$${cost().toFixed(2)}`} />
        <Stat label="Tool calls" value={compact(totals()?.tool_calls ?? 0)} />
        <Stat
          label="Agents on staff"
          value={String(state.agents.filter((a) => a.role !== "system").length)}
        />
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UsageCard title="Tokens per day">
          <Show
            when={(daily()?.tokens ?? []).length}
            fallback={<Empty note="No sessions recorded yet." />}
          >
            <DualAreaChart points={tokenDays()} aLabel="Tokens in" bLabel="Tokens out" stacked />
          </Show>
        </UsageCard>
        <UsageCard title="Messages per day">
          <Show
            when={(daily()?.messages ?? []).length}
            fallback={<Empty note="No messages yet." />}
          >
            <DualAreaChart points={messageDays()} aLabel="You" bLabel="Agents" />
          </Show>
        </UsageCard>
      </div>

      <ConsumptionByAgent rows={tokens()?.per_agent ?? []} />
    </div>
  );
}

/** Fill a trailing window of days, zeroing the quiet ones. */
function padDays<T extends { date: string }>(
  window: number,
  days: T[],
  pick: (d: T) => { a: number; b: number },
): ChartPoint[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: ChartPoint[] = [];
  for (let i = window - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hit = byDate.get(key);
    out.push({ date: key, ...(hit ? pick(hit) : { a: 0, b: 0 }) });
  }
  return out;
}

/** A design stat card: 11px muted label over a serif 26px figure. */
function Stat(props: { label: string; value: string }) {
  return (
    <div
      class="rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5"
      style={{ "box-shadow": "var(--shadow-1)" }}
    >
      <div class="text-[11px] font-semibold text-[var(--muted)]">{props.label}</div>
      <div
        class="mt-1 text-[26px] leading-[1.1] text-[var(--text)]"
        style={{ "font-family": "var(--serif)" }}
      >
        {props.value}
      </div>
    </div>
  );
}

/**
 * The design's consumption list: avatar, name, an accent bar against the
 * element track, and the exact figures beside it.
 */
function ConsumptionByAgent(props: { rows: AgentTokenUsage[] }) {
  const total = (r: AgentTokenUsage) => r.input_tokens + r.output_tokens;
  const sorted = createMemo(() => [...props.rows].sort((x, y) => total(y) - total(x)));
  const max = () => Math.max(1, ...props.rows.map(total));

  return (
    <UsageCard title="Consumption by agent">
      <Show when={props.rows.length} fallback={<Empty note="No agent activity yet." />}>
        <div>
          <For each={sorted()}>
            {(r) => (
              <div class="grid grid-cols-[22px_120px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[var(--line)] py-[9px] last:border-b-0">
                <Avatar name={r.agent_name || "?"} size={22} />
                <span class="min-w-0 truncate text-[12px] font-semibold text-[var(--text)]">
                  {r.agent_name || "—"}
                </span>
                <span class="h-2 rounded-[4px] bg-[var(--element)]">
                  <span
                    class="block h-full rounded-[4px] bg-[var(--accent)]"
                    style={{ width: `${Math.max(2, (total(r) / max()) * 100)}%` }}
                  />
                </span>
                <span class="whitespace-nowrap text-[11px] tabular-nums text-[var(--text-2)]">
                  {compact(total(r))} · {r.sessions} session{r.sessions === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </UsageCard>
  );
}

/** A design surface card with the uppercase 11px tracked title. */
function UsageCard(props: { title: string; children: any }) {
  return (
    <section
      class="rounded-[var(--r4)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5"
      style={{ "box-shadow": "var(--shadow-1)" }}
    >
      <div class="mb-2 text-[11px] font-[650] uppercase tracking-[0.05em] text-[var(--muted)]">
        {props.title}
      </div>
      {props.children}
    </section>
  );
}

function Empty(props: { note: string }) {
  return <p class="py-6 text-center text-[11px] text-[var(--faint)]">{props.note}</p>;
}

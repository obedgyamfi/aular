import { createMemo, createResource, createSignal, For, Show } from "solid-js";

import { Avatar } from "~/components/avatar";
import { compact, DualAreaChart, type ChartPoint } from "~/components/charts";
import { OrgBuild } from "~/components/org-build";
import { OrgChart } from "~/components/org-chart";
import { OrgDocs } from "~/components/org-docs";
import { api } from "~/lib/api";
import { state } from "~/lib/store";
import type { AgentTokenUsage } from "~/lib/types";

type Tab = "overview" | "chart" | "docs" | "build";

/**
 * The Organization register — ported from the prototype's OrgOverview.
 *
 * The system dashboard: headline KPI tiles, a daily token chart, tokens by
 * agent, and a per-agent performance table. Numbers come from the same
 * endpoints the prototype reads (Hermes' session store via /usage/tokens, the
 * metering log via /analytics/daily), so the figures here are the real cost of
 * the work — not an estimate.
 */
export function OrgPanel() {
  const [tab, setTab] = createSignal<Tab>("overview");

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-v2-background-bg-base">
      <div class="flex h-11 shrink-0 items-center gap-1 border-b border-v2-border-border-muted px-4">
        <TabBtn active={tab() === "overview"} onClick={() => setTab("overview")}>
          Overview
        </TabBtn>
        <TabBtn active={tab() === "chart"} onClick={() => setTab("chart")}>
          Org chart
        </TabBtn>
        <TabBtn active={tab() === "docs"} onClick={() => setTab("docs")}>
          Knowledge bank
        </TabBtn>
        <TabBtn active={tab() === "build"} onClick={() => setTab("build")}>
          Hire
        </TabBtn>
      </div>

      {/* The chart and the bank are workspaces: they take the whole pane and
          manage their own scrolling. Overview and Hire are reading — a measured
          column, centered. */}
      <Show when={tab() === "chart"}>
        <OrgChart />
      </Show>
      <Show when={tab() === "docs"}>
        <OrgDocs />
      </Show>

      <Show when={tab() === "overview" || tab() === "build"}>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div class="mx-auto w-full max-w-[1000px] px-6 py-6">
            <Show when={tab() === "overview"}>
              <Overview />
            </Show>
            <Show when={tab() === "build"}>
              <OrgBuild />
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}

function TabBtn(props: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="relative px-3 py-1.5 text-[12px] transition-colors"
      classList={{
        "text-v2-text-text-base": props.active,
        "text-v2-text-text-muted hover:text-v2-text-text-base": !props.active,
      }}
    >
      {props.children}
      <Show when={props.active}>
        <span class="absolute inset-x-2 -bottom-[1px] h-[2px] rounded-full bg-v2-icon-icon-accent" />
      </Show>
    </button>
  );
}

function Overview() {
  const [tokens] = createResource(() => api.getTokenUsage().catch(() => null));
  const [daily] = createResource(() => api.getAnalyticsDaily(14).catch(() => null));

  const totals = () => tokens()?.totals;

  // The API returns only days that had activity; pad the window out to its
  // full span or three busy days stretch and the shape of the work lies.
  const tokenDays = createMemo<ChartPoint[]>(() =>
    padDays(14, daily()?.tokens ?? [], (d) => ({
      a: d.input_tokens,
      b: d.output_tokens,
    })),
  );
  const messageDays = createMemo<ChartPoint[]>(() =>
    padDays(14, daily()?.messages ?? [], (d) => ({
      a: d.user,
      b: d.agent,
    })),
  );

  /** The gateway prices turns only when the model config carries rates, so
   *  cost earns a tile the moment it's real and stays out of the way at $0. */
  const cost = () =>
    (daily()?.tokens ?? []).reduce((s, d) => s + (d.cost_usd || 0), 0);

  return (
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-0.5">
        <h2 class="text-[13px] font-medium text-v2-text-text-base">Overview</h2>
        <p class="text-[11.5px] text-v2-text-text-muted">
          All-time totals; the charts cover the last 14 days.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Tokens in" value={compact(totals()?.input_tokens ?? 0)} />
        <Tile label="Tokens out" value={compact(totals()?.output_tokens ?? 0)} />
        <Tile label="Tool calls" value={compact(totals()?.tool_calls ?? 0)} />
        <Tile label="Sessions" value={compact(totals()?.sessions ?? 0)} />
        <Show
          when={cost() > 0}
          fallback={<Tile label="Agents" value={String(state.agents.length)} sub="on staff" />}
        >
          <Tile label="Model cost" value={`$${cost().toFixed(2)}`} sub="last 14 days" />
        </Show>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Tokens per day">
          <Show
            when={(daily()?.tokens ?? []).length}
            fallback={<Empty note="No sessions recorded yet." />}
          >
            <DualAreaChart
              points={tokenDays()}
              aLabel="Tokens in"
              bLabel="Tokens out"
              stacked
            />
          </Show>
        </Card>
        <Card title="Messages per day">
          <Show
            when={(daily()?.messages ?? []).length}
            fallback={<Empty note="No messages yet." />}
          >
            <DualAreaChart points={messageDays()} aLabel="You" bLabel="Agents" />
          </Show>
        </Card>
      </div>

      <AgentTable rows={tokens()?.per_agent ?? []} />
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

function Tile(props: { label: string; value: string; sub?: string }) {
  return (
    <div class="flex flex-col gap-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-2.5">
      <span class="text-[10.5px] text-v2-text-text-faint">{props.label}</span>
      <span class="text-[19px] font-semibold leading-none tracking-[-0.01em] text-v2-text-text-base">
        {props.value}
      </span>
      <Show when={props.sub}>
        <span class="text-[10px] text-v2-text-text-faint">{props.sub}</span>
      </Show>
    </div>
  );
}

/**
 * The full data view: every agent, their token split drawn in the same two
 * series colors as the charts, and the exact numbers beside it.
 */
function AgentTable(props: { rows: AgentTokenUsage[] }) {
  const total = (r: AgentTokenUsage) => r.input_tokens + r.output_tokens;
  const sorted = createMemo(() => [...props.rows].sort((x, y) => total(y) - total(x)));
  const max = () => Math.max(1, ...props.rows.map(total));

  return (
    <Card title="By agent" subtitle="all-time">
      <Show when={props.rows.length} fallback={<Empty note="No agent activity yet." />}>
        <div class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead>
              <tr class="text-left text-[10px] uppercase tracking-[0.08em] text-v2-text-text-faint">
                <th class="pb-2 pr-3 font-medium">Agent</th>
                <th class="w-[30%] pb-2 pr-3 font-medium">Tokens</th>
                <th class="pb-2 pr-3 text-right font-medium">In</th>
                <th class="pb-2 pr-3 text-right font-medium">Out</th>
                <th class="pb-2 pr-3 text-right font-medium">Tools</th>
                <th class="pb-2 text-right font-medium">Sessions</th>
              </tr>
            </thead>
            <tbody class="tabular-nums text-v2-text-text-muted">
              <For each={sorted()}>
                {(r) => (
                  <tr class="border-t border-v2-border-border-muted">
                    <td class="py-2 pr-3">
                      <span class="flex items-center gap-2 text-v2-text-text-base">
                        <Avatar name={r.agent_name || "?"} size={18} />
                        {r.agent_name || "—"}
                      </span>
                    </td>
                    <td class="py-2 pr-3">
                      <SplitBar
                        a={r.input_tokens}
                        b={r.output_tokens}
                        max={max()}
                        title={`${compact(r.input_tokens)} in · ${compact(r.output_tokens)} out`}
                      />
                    </td>
                    <td class="py-2 pr-3 text-right">{compact(r.input_tokens)}</td>
                    <td class="py-2 pr-3 text-right">{compact(r.output_tokens)}</td>
                    <td class="py-2 pr-3 text-right">{compact(r.tool_calls)}</td>
                    <td class="py-2 text-right">{r.sessions}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </Card>
  );
}

/** An in/out split bar in the chart's series colors, with a 2px surface gap. */
function SplitBar(props: { a: number; b: number; max: number; title: string }) {
  const pct = (v: number) => (v / props.max) * 100;
  return (
    <span class="flex h-[6px] w-full items-center gap-[2px]" title={props.title}>
      <span
        class="h-full rounded-l-full"
        classList={{ "rounded-r-full": props.b === 0 }}
        style={{
          width: `${Math.max(pct(props.a), props.a > 0 ? 1 : 0)}%`,
          background: "var(--viz-1)",
          opacity: 0.85,
        }}
      />
      <span
        class="h-full rounded-r-full"
        classList={{ "rounded-l-full": props.a === 0 }}
        style={{
          width: `${Math.max(pct(props.b), props.b > 0 ? 1 : 0)}%`,
          background: "var(--viz-2)",
          opacity: 0.85,
        }}
      />
    </span>
  );
}

function Card(props: { title: string; subtitle?: string; children: any }) {
  return (
    <section class="flex flex-col gap-3 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
      <div class="flex items-baseline gap-2">
        <h2 class="text-[12.5px] font-medium text-v2-text-text-base">{props.title}</h2>
        <Show when={props.subtitle}>
          <span class="text-[11px] text-v2-text-text-faint">{props.subtitle}</span>
        </Show>
      </div>
      {props.children}
    </section>
  );
}

function Empty(props: { note: string }) {
  return (
    <p class="py-6 text-center text-[11px] text-v2-text-text-faint">{props.note}</p>
  );
}

import { createMemo, createResource, createSignal, For, Show } from "solid-js";

import { AddAgentModal } from "~/components/add-agent-modal";
import { OrgChart } from "~/components/org-chart";
import { OrgDocs } from "~/components/org-docs";
import { TokenChart } from "~/components/token-chart";
import { api } from "~/lib/api";
import { state } from "~/lib/store";
import type { AgentTokenUsage, DailyTokens } from "~/lib/types";

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
          Build
        </TabBtn>
      </div>

      {/* The chart and the bank are workspaces: they take the whole pane and
          manage their own scrolling. Overview and Build are reading — a measured
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
              <Build />
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

/** Grow the team. The same three routes as the hire dialog, given room. */
function Build() {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-0.5">
        <h2 class="text-[13px] font-medium text-v2-text-text-base">Build your org</h2>
        <p class="text-[11.5px] text-v2-text-text-muted">
          Hire from a role, describe what you need to AULAR, or write an agent
          yourself.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        class="w-fit rounded-md bg-v2-background-bg-accent px-3 py-2 text-[12px] font-medium text-v2-text-text-inverse"
      >
        Hire an agent
      </button>
      <Show when={open()}>
        <AddAgentModal onClose={() => setOpen(false)} />
      </Show>
    </div>
  );
}

function Overview() {
  const [tokens] = createResource(() => api.getTokenUsage().catch(() => null));
  const [daily] = createResource(() => api.getAnalyticsDaily(14).catch(() => null));

  const totals = () => tokens()?.totals;

  return (
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-0.5">
        <h2 class="text-[13px] font-medium text-v2-text-text-base">Overview</h2>
        <p class="text-[11.5px] text-v2-text-text-muted">
          What your agents have actually done, and what it cost.
        </p>
      </div>

      {/* KPI row — the prototype's tiles, same units. */}
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Tokens in" value={fmt(totals()?.input_tokens)} sub="all-time" />
        <Tile label="Tokens out" value={fmt(totals()?.output_tokens)} sub="all-time" />
        <Tile label="Tool calls" value={fmt(totals()?.tool_calls)} sub="all-time" />
        <Tile label="Sessions" value={fmt(totals()?.sessions)} sub="all-time" />
        <Tile label="Agents" value={String(state.agents.length)} sub="on staff" />
      </div>

      <TokensPerDay days={daily()?.tokens ?? []} />

      <TokensByAgent rows={tokens()?.per_agent ?? []} />

      <AgentTable rows={tokens()?.per_agent ?? []} />
    </div>
  );
}

function fmt(n?: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function Tile(props: { label: string; value: string; sub: string }) {
  return (
    <div class="flex flex-col gap-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-2.5">
      <span class="text-[10px] font-medium uppercase tracking-[0.08em] text-v2-text-text-faint">
        {props.label}
      </span>
      <span class="font-mono text-[18px] leading-none text-v2-text-text-base">
        {props.value}
      </span>
      <span class="text-[10px] text-v2-text-text-faint">{props.sub}</span>
    </div>
  );
}

/** Stacked daily bars — input and output tokens, as in the prototype. */
function TokensPerDay(props: { days: DailyTokens[] }) {
  // The API returns only days that had activity. Pad the window out to its full
  // span, or three busy days stretch into three fat bars and the chart lies
  // about the shape of the work.
  const series = createMemo<DailyTokens[]>(() => {
    const WINDOW = 14;
    const byDate = new Map(props.days.map((d) => [d.date, d]));
    const out: DailyTokens[] = [];
    for (let i = WINDOW - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push(
        byDate.get(key) ?? {
          date: key,
          input_tokens: 0,
          output_tokens: 0,
          tool_calls: 0,
          sessions: 0,
          cost_usd: 0,
        },
      );
    }
    return out;
  });

  return (
    <Card title="Tokens per day" subtitle="last 14 days">
      <Show
        when={props.days.length}
        fallback={<Empty note="No sessions recorded yet." />}
      >
        <TokenChart days={series()} />
      </Show>
    </Card>
  );
}

/** Horizontal bars — who is spending the tokens. */
function TokensByAgent(props: { rows: AgentTokenUsage[] }) {
  const total = (r: AgentTokenUsage) => r.input_tokens + r.output_tokens;
  const max = () => Math.max(1, ...props.rows.map(total));

  return (
    <Card title="Tokens by agent" subtitle="all-time">
      <Show when={props.rows.length} fallback={<Empty note="No agent activity yet." />}>
        <div class="flex flex-col gap-2">
          <For each={props.rows}>
            {(r) => (
              <div class="flex items-center gap-3">
                <span class="w-[90px] shrink-0 truncate text-[12px] text-v2-text-text-base">
                  {r.agent_name || "—"}
                </span>
                <span class="h-2 flex-1 overflow-hidden rounded-full bg-v2-background-bg-layer-02">
                  <span
                    class="block h-full rounded-full bg-v2-icon-icon-accent"
                    style={{ width: `${(total(r) / max()) * 100}%` }}
                  />
                </span>
                <span class="w-[60px] shrink-0 text-right font-mono text-[11px] text-v2-text-text-muted">
                  {fmt(total(r))}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Card>
  );
}

function AgentTable(props: { rows: AgentTokenUsage[] }) {
  return (
    <Card title="Per-agent performance" subtitle="tokens, tool calls, sessions">
      <Show when={props.rows.length} fallback={<Empty note="Nothing to report yet." />}>
        <div class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead>
              <tr class="text-left text-[10px] uppercase tracking-[0.08em] text-v2-text-text-faint">
                <th class="pb-2 pr-3 font-medium">Agent</th>
                <th class="pb-2 pr-3 text-right font-medium">In</th>
                <th class="pb-2 pr-3 text-right font-medium">Out</th>
                <th class="pb-2 pr-3 text-right font-medium">Tools</th>
                <th class="pb-2 text-right font-medium">Sessions</th>
              </tr>
            </thead>
            <tbody class="font-mono text-v2-text-text-muted">
              <For each={props.rows}>
                {(r) => (
                  <tr class="border-t border-v2-border-border-muted">
                    <td class="py-1.5 pr-3 font-sans text-v2-text-text-base">
                      {r.agent_name || "—"}
                    </td>
                    <td class="py-1.5 pr-3 text-right">{fmt(r.input_tokens)}</td>
                    <td class="py-1.5 pr-3 text-right">{fmt(r.output_tokens)}</td>
                    <td class="py-1.5 pr-3 text-right">{fmt(r.tool_calls)}</td>
                    <td class="py-1.5 text-right">{r.sessions}</td>
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

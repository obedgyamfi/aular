import { createMemo, createSignal, For, Show } from "solid-js";
import autoAnimate from "@formkit/auto-animate";
import { ArrowRight, CircleCheck, Lightbulb } from "lucide-solid";

import { AddAgentModal } from "~/components/add-agent-modal";
import { Avatar } from "~/components/avatar";
import { BriefCard } from "~/components/brief-card";
import { Onboarding } from "~/components/onboarding";
import { age, StateDot, STATE_META } from "~/components/task-state";
import {
  actions,
  agentWorking,
  inputRequiredTasks,
  liveTasks,
  pendingBriefs,
  state,
} from "~/lib/store";
import type { Agent, Brief, Task } from "~/lib/types";
import { TERMINAL_TASK_STATES } from "~/lib/types";

/**
 * Home — the org at a glance. This is what AULAR is, so it's what opens.
 *
 * A chat window says "another assistant." This says what's actually going on:
 * who's working right now, what's in flight, what the org is waiting on YOU
 * for, and what got done while you were away. Chat is one click from here;
 * here is never more than zero clicks from anywhere.
 *
 * Everything on this page is a live read of the store — no endpoint of its
 * own, which is the point: the org's state already exists, Home just refuses
 * to hide it behind a conversation.
 */
export function Home() {
  const [hiring, setHiring] = createSignal(false);

  const staff = createMemo(() =>
    state.agents
      .filter((a) => a.role !== "system")
      .slice()
      .sort((a, b) => {
        // Working agents first, then by recent activity — the same instinct
        // as glancing across a real office.
        const aw = agentWorking(a.id) ? 1 : 0;
        const bw = agentWorking(b.id) ? 1 : 0;
        if (aw !== bw) return bw - aw;
        const at = state.preview[a.id]?.at ?? a.updated_at ?? "";
        const bt = state.preview[b.id]?.at ?? b.updated_at ?? "";
        return bt.localeCompare(at);
      }),
  );
  const system = () => state.agents.find((a) => a.role === "system");

  const workingCount = () => staff().filter((a) => agentWorking(a.id)).length;
  const live = createMemo(() => liveTasks());
  const needsYou = () => pendingBriefs().length + inputRequiredTasks().length;

  const recent = createMemo<RecentItem[]>(() => {
    const items: RecentItem[] = [];
    for (const t of Object.values(state.tasks)) {
      if (TERMINAL_TASK_STATES.has(t.state)) {
        items.push({ at: t.state_updated_at ?? t.created_at, kind: "task", task: t });
      }
    }
    for (const b of Object.values(state.briefs)) {
      if (b.kind !== "decision" || b.answered_at) {
        items.push({ at: b.answered_at ?? b.created_at, kind: "brief", brief: b });
      }
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  });

  const openChat = (agentId: string) => {
    actions.setRegister("chat");
    void actions.openAgent(agentId);
  };
  const openTask = (t: Task) => {
    if (t.to_agent_profile_id) openChat(t.to_agent_profile_id);
    else actions.setRegister("work");
  };

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-v2-background-bg-base">
      <Show when={staff().length || live().length} fallback={<Onboarding />}>
        <div class="mx-auto w-full max-w-[1020px] px-8 py-8">
          {/* ── the morning line ─────────────────────────────────────────── */}
          <div class="flex items-end justify-between gap-4">
            <div class="min-w-0">
              <h1 class="text-[20px] font-semibold tracking-[-0.01em] text-v2-text-text-base">
                {greeting()}
                {firstName() ? `, ${firstName()}` : ""}.
              </h1>
              <p class="pt-1 text-[12.5px] text-v2-text-text-muted">
                <Pulse
                  working={workingCount()}
                  inFlight={live().length}
                  needsYou={needsYou()}
                />
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHiring(true)}
              class="shrink-0 rounded-md bg-v2-background-bg-accent px-3.5 py-2 text-[12.5px] font-medium text-v2-text-text-inverse transition-opacity hover:opacity-90"
            >
              Hire an agent
            </button>
          </div>

          {/* ── what the org is waiting on you for ───────────────────────── */}
          <Show when={needsYou() > 0}>
            <SectionLabel warning>Needs you</SectionLabel>
            <div
              ref={(el) => autoAnimate(el, { duration: 180, easing: "cubic-bezier(0,0,.2,1)" })}
              class="flex flex-col gap-2"
            >
              <For each={pendingBriefs()}>{(b) => <BriefCard brief={b} />}</For>
              <For each={inputRequiredTasks()}>
                {(t) => <NeedsInputCard task={t} onOpen={() => openTask(t)} />}
              </For>
            </div>
          </Show>

          {/* ── the office: who, and what's moving ───────────────────────── */}
          <div class="grid grid-cols-1 gap-4 pt-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <section>
              <SectionLabel
                action={{ label: "Org chart", onClick: () => actions.setRegister("org") }}
              >
                The team
              </SectionLabel>
              <div class="overflow-hidden rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-01">
                <For
                  each={staff()}
                  fallback={
                    <p class="px-4 py-6 text-center text-[11.5px] text-v2-text-text-faint">
                      No staff yet — hire your first agent.
                    </p>
                  }
                >
                  {(a) => <TeamRow agent={a} onClick={() => openChat(a.id)} />}
                </For>
                <Show when={system()}>
                  {(sys) => (
                    <div class="border-t border-v2-border-border-muted">
                      <TeamRow agent={sys()} onClick={() => openChat(sys().id)} system />
                    </div>
                  )}
                </Show>
              </div>
            </section>

            <section>
              <SectionLabel
                action={{ label: "Mission control", onClick: () => actions.setRegister("work") }}
              >
                In flight
              </SectionLabel>
              <div
                ref={(el) => autoAnimate(el, { duration: 180, easing: "cubic-bezier(0,0,.2,1)" })}
                class="overflow-hidden rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-01"
              >
                <For
                  each={live().slice(0, 8)}
                  fallback={
                    <p class="px-4 py-6 text-center text-[11.5px] leading-relaxed text-v2-text-text-faint">
                      Nothing in flight. Give a lead a goal in chat and watch the
                      work land here.
                    </p>
                  }
                >
                  {(t) => <TaskRow task={t} onClick={() => openTask(t)} />}
                </For>
                <Show when={live().length > 8}>
                  <button
                    type="button"
                    onClick={() => actions.setRegister("work")}
                    class="w-full border-t border-v2-border-border-muted px-4 py-2 text-left text-[11px] text-v2-text-text-faint transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                  >
                    +{live().length - 8} more on the board
                  </button>
                </Show>
              </div>
            </section>
          </div>

          {/* ── while you were away ──────────────────────────────────────── */}
          <Show when={recent().length}>
            <SectionLabel>Recent</SectionLabel>
            <div class="overflow-hidden rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-01">
              <For each={recent()}>{(r) => <RecentRow item={r} />}</For>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={hiring()}>
        <AddAgentModal onClose={() => setHiring(false)} />
      </Show>
    </div>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

type RecentItem =
  | { at: string; kind: "task"; task: Task }
  | { at: string; kind: "brief"; brief: Brief };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(): string {
  return (state.user?.display_name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** One quiet sentence about the org's pulse — only what's nonzero speaks. */
function Pulse(props: { working: number; inFlight: number; needsYou: number }) {
  const parts = () => {
    const out: { text: string; tone?: string }[] = [];
    if (props.working > 0)
      out.push({
        text: `${props.working} agent${props.working === 1 ? "" : "s"} working now`,
        tone: "var(--viz-2)",
      });
    if (props.inFlight > 0)
      out.push({ text: `${props.inFlight} task${props.inFlight === 1 ? "" : "s"} in flight` });
    if (props.needsYou > 0)
      out.push({
        text: `${props.needsYou} waiting on you`,
        tone: "var(--v2-state-fg-warning)",
      });
    if (!out.length) out.push({ text: "All quiet — the org is caught up." });
    return out;
  };
  return (
    <For each={parts()}>
      {(p, i) => (
        <>
          <Show when={i() > 0}>
            <span class="px-1.5 text-v2-text-text-faint">·</span>
          </Show>
          <span style={p.tone ? { color: p.tone } : undefined}>{p.text}</span>
        </>
      )}
    </For>
  );
}

function SectionLabel(props: {
  children: any;
  warning?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div class="flex items-baseline justify-between pb-2 pt-6">
      <h2
        class="text-[10.5px] font-semibold uppercase tracking-[0.09em]"
        classList={{
          "text-v2-state-fg-warning": !!props.warning,
          "text-v2-text-text-faint": !props.warning,
        }}
      >
        {props.children}
      </h2>
      <Show when={props.action}>
        {(a) => (
          <button
            type="button"
            onClick={a().onClick}
            class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-v2-text-text-faint transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
          >
            {a().label}
            <ArrowRight size={11} />
          </button>
        )}
      </Show>
    </div>
  );
}

function TeamRow(props: { agent: Agent; onClick: () => void; system?: boolean }) {
  const a = () => props.agent;
  const working = () => agentWorking(a().id);
  const unread = () => state.unread[a().id] ?? 0;
  const preview = () => state.preview[a().id]?.text ?? "";

  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-v2-overlay-simple-overlay-hover"
    >
      <Avatar name={a().name} size={30} />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="flex items-center gap-2">
          <span class="truncate text-[12.5px] font-medium text-v2-text-text-base">
            {a().name}
          </span>
          <Show when={props.system}>
            <span class="rounded-full bg-v2-background-bg-layer-02 px-1.5 text-[9px] font-medium uppercase text-v2-text-text-faint">
              System
            </span>
          </Show>
        </span>
        <Show
          when={working()}
          fallback={
            <span class="truncate text-[10.5px] text-v2-text-text-faint">
              {preview() || prettyRole(a().role)}
            </span>
          }
        >
          <span class="aular-shimmer text-[10.5px] font-medium">working…</span>
        </Show>
      </span>
      <Show when={working()}>
        <span
          class="aular-breathe size-1.5 shrink-0 rounded-full"
          style={{ background: "var(--viz-2)" }}
        />
      </Show>
      <Show when={unread() > 0}>
        <span class="flex h-[16px] min-w-[16px] shrink-0 items-center justify-center rounded-full bg-v2-background-bg-accent px-1 text-[9.5px] font-semibold text-v2-text-text-inverse">
          {unread()}
        </span>
      </Show>
    </button>
  );
}

function TaskRow(props: { task: Task; onClick: () => void }) {
  const t = () => props.task;
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      title={t().task}
    >
      <StateDot state={t().state} size={11} />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-[12px] text-v2-text-text-base">{t().task}</span>
        <span class="truncate text-[10.5px] text-v2-text-text-faint">
          <span style={{ color: STATE_META[t().state].color }}>
            {STATE_META[t().state].label}
          </span>
          {" · "}
          {t().to_agent_name} · from {t().from_agent_name}
        </span>
      </span>
      <span class="shrink-0 text-[10px] tabular-nums text-v2-text-text-faint">
        {age(t().state_updated_at ?? t().created_at)}
      </span>
    </button>
  );
}

/** A paused task, answerable right here — the same seam as the bell. */
function NeedsInputCard(props: { task: Task; onOpen: () => void }) {
  const [answer, setAnswer] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const t = () => props.task;

  const send = async () => {
    if (!answer().trim() || busy()) return;
    setBusy(true);
    try {
      await actions.answerTask(t().id, answer().trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="w-full max-w-[560px] rounded-lg border border-v2-state-border-warning bg-v2-state-bg-warning px-3.5 py-2.5">
      <div class="flex items-center gap-1.5">
        <StateDot state="input-required" size={11} />
        <button
          type="button"
          onClick={props.onOpen}
          class="min-w-0 flex-1 truncate text-left text-[11.5px] font-medium text-v2-text-text-base hover:underline"
          title={t().task}
        >
          {t().to_agent_name} — {t().task}
        </button>
        <span class="shrink-0 text-[10px] text-v2-text-text-faint">
          {age(t().state_updated_at ?? t().created_at)}
        </span>
      </div>
      <p class="pt-1 text-[12px] leading-relaxed text-v2-text-text-base">
        {t().state_message}
      </p>
      <div class="flex items-center gap-1.5 pt-1.5">
        <input
          value={answer()}
          onInput={(e) => setAnswer(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          placeholder="Answer and resume…"
          class="min-w-0 flex-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-2.5 py-1.5 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus"
        />
        <button
          type="button"
          disabled={!answer().trim() || busy()}
          onClick={() => void send()}
          class="shrink-0 rounded-md bg-v2-background-bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function RecentRow(props: { item: RecentItem }) {
  const i = () => props.item;
  return (
    <div class="flex items-center gap-2.5 px-3.5 py-2 text-[11.5px]">
      <Show
        when={i().kind === "task"}
        fallback={
          <Show
            when={(i() as { brief: Brief }).brief.kind === "insight"}
            fallback={<CircleCheck size={12} color="var(--v2-state-fg-success)" />}
          >
            <Lightbulb size={12} color="var(--v2-text-text-accent)" />
          </Show>
        }
      >
        <StateDot state={(i() as { task: Task }).task.state} size={11} />
      </Show>

      <span class="min-w-0 flex-1 truncate text-v2-text-text-muted">
        <Show
          when={i().kind === "task"}
          fallback={
            <>
              <span class="font-medium text-v2-text-text-base">
                {(i() as { brief: Brief }).brief.title}
              </span>
              <Show when={(i() as { brief: Brief }).brief.answer}>
                {" — "}you chose {(i() as { brief: Brief }).brief.answer}
              </Show>
            </>
          }
        >
          {(i() as { task: Task }).task.task}
        </Show>
      </span>

      <span class="shrink-0 text-[10.5px] text-v2-text-text-faint">
        {i().kind === "task"
          ? (i() as { task: Task }).task.to_agent_name
          : (i() as { brief: Brief }).brief.agent_name}
        {" · "}
        {age(i().at)}
      </span>
    </div>
  );
}

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

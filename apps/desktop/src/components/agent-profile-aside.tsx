import { createMemo, createResource, For, Show } from "solid-js";
import BookOpen from "lucide-solid/icons/book-open";
import MessageCircle from "lucide-solid/icons/message-circle";
import Sparkles from "lucide-solid/icons/sparkles";
import Wrench from "lucide-solid/icons/wrench";
import X from "lucide-solid/icons/x";

import { defaultSkillsForRole } from "~/components/agent-capabilities";
import { Avatar, avatarColor } from "~/components/avatar";
import { Backdrop } from "~/components/backdrop";
import { api } from "~/lib/api";
import { settings } from "~/lib/settings";
import { actions, agentWorking, agentById, liveTasks, state } from "~/lib/store";
import type { Agent } from "~/lib/types";

/**
 * The profile panel — Discord's third column, in a DM.
 *
 * Discord swaps this column by context: a member list in a channel, the other
 * person's profile in a direct message. We follow that exactly, because it's
 * the right answer for the same reason — in a one-to-one thread there is no
 * "who else is here" question to answer, and the useful thing to show is who
 * you're talking to.
 *
 * Everything here is read off state that already exists. There is no "member
 * since": an agent record carries no hire date, so the panel says what it can
 * actually stand behind (`updated_at`, labelled as the last change) rather than
 * dressing a different timestamp up as one.
 */
export function AgentProfileAside(props: {
  agent: Agent;
  onClose: () => void;
  /**
   * Where the card is docked. Beside a conversation ("chat", the default) it
   * shows your thread history; beside the org chart ("org") that would repeat
   * the chat register's job, so instead it leads with a Chat doorway and the
   * at-a-glance numbers — tools, skills, knowledge.
   */
  variant?: "chat" | "org";
}) {
  const agent = () => props.agent;
  const onOrg = () => props.variant === "org";

  /**
   * What this card's constellation and gradient are tinted with.
   *
   * With dynamic accenting on, it's THIS agent's own colour — read from the
   * agent, not from `--blurple`. The global accent only tracks the agent whose
   * chat is open, so beside the org chart it would paint whoever you last
   * talked to over whoever you just clicked. With the toggle off, the one
   * fixed accent applies here as it does everywhere else.
   */
  const tint = () =>
    settings.dynamicAccent ? avatarColor(agent().name) : "var(--blurple)";
  const working = () => agentWorking(agent().id);
  const handle = () => `@${agent().name.toLowerCase().replace(/\s+/g, "")}`;
  const manager = () => agentById(agent().reports_to);

  /** What this agent is doing right now — Discord's "Playing" card, earned. */
  const now = createMemo(() =>
    liveTasks().filter((t) => t.to_agent_profile_id === agent().id),
  );

  // Where they sit in the organization — who they answer to, who answers to
  // them, and which project teams they're on. Read straight off the store, so
  // the same card is correct beside a conversation and beside the org chart.
  const reports = createMemo(() =>
    state.agents.filter((a) => a.reports_to === agent().id),
  );
  const teams = createMemo(() =>
    state.projects.filter((p) => !p.allAgents && p.team.includes(agent().id)),
  );

  // Every thread you've had with them. Keyed on the agent so switching DMs
  // refetches rather than showing the last one's history. The org card never
  // shows these, so it never pays for the fetch.
  const [threads] = createResource(
    () => (onOrg() ? null : agent().id),
    (id) => api.listConversations(id).catch(() => null),
  );

  // The at-a-glance numbers the org card leads with. Skills fall back to the
  // role defaults exactly as the Capabilities tab does, so the two never
  // disagree; knowledge counts the agent's own role documents.
  const skills = createMemo(
    () => state.agentSkills[agent().id] ?? defaultSkillsForRole(agent().role),
  );
  const [docCount] = createResource(
    () => (onOrg() ? agent().id : null),
    (id) =>
      api
        .listDocuments()
        .then((d) => (d ?? []).filter((doc) => doc.agent_profile_id === id).length)
        .catch(() => 0),
  );

  return (
    // A card, inset and rounded, matching the identity card in the full-profile
    // modal — the docked panel and the modal show the same thing, so they read
    // the same way.
    <aside class="flex w-[316px] shrink-0 flex-col p-2">
      <div
        class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r4)] bg-[var(--sidebar)]"
        style={{
          "background-image": `linear-gradient(180deg, color-mix(in srgb, ${tint()} 38%, transparent) 0%, transparent 26%, transparent 62%, color-mix(in srgb, ${tint()} 16%, transparent) 100%)`,
        }}
      >
      {/* The agent's own constellation, in the agent's own colour — the same
          field the accent themes use, dialled down. It's what makes seventeen
          profiles feel like seventeen people rather than one template with the
          name swapped. Held at a third strength: a panel sits closer to the eye
          than a full screen does, and wants correspondingly less. */}
      <Backdrop strength={0.34} breathe tint={tint()} />

      <div class="aular-no-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto">
        {/* Banner + the portrait hanging off it, Discord's signature header.
            A gradient rather than a flat block, so it hands off into the field
            below instead of stopping at a hard edge. */}
        <div class="relative">
          <div class="h-[60px]" />
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Hide profile"
            title="Hide profile"
            class="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[var(--rail)]/60 text-white transition-colors hover:bg-[var(--rail)]"
          >
            <X size={14} stroke-width={2.4} />
          </button>
          <div class="px-4">
            <span class="relative -mt-8 inline-block rounded-full ring-[6px] ring-[var(--sidebar)]">
              <Avatar name={agent().name} size={72} circle />
              <span
                class="absolute bottom-0.5 right-0.5 size-[18px] rounded-full border-[4px] border-[var(--sidebar)]"
                style={{ background: working() ? "var(--green)" : "var(--faint)" }}
              />
            </span>
          </div>
        </div>

        <div class="flex flex-col gap-3 px-4 pb-4 pt-2">
          <div>
            <h2 class="truncate text-[19px] font-bold leading-6 text-[var(--text)]">
              {agent().name}
            </h2>
            <p class="truncate text-[12.5px] text-[var(--text-2)]">
              {handle()} · {prettyRole(agent().role)}
            </p>
          </div>

          {/* The org card's doorway and its dashboard: one press into the
              conversation, and the three numbers that size an agent up —
              beside a chat both would be redundant. */}
          <Show when={onOrg()}>
            <button
              type="button"
              onClick={() => actions.openChat(agent().id)}
              class="flex w-full items-center justify-center gap-2 rounded-[var(--r2)] bg-[var(--accent)] bg-[image:var(--accent-grad)] py-2 text-[12.5px] font-semibold text-[var(--on-accent)] transition-all hover:brightness-110"
            >
              <MessageCircle size={15} stroke-width={2} />
              Chat
            </button>
            <div class="grid grid-cols-3 gap-2">
              <StatTile icon={<Wrench size={14} stroke-width={1.9} />} value={agent().default_tools?.length ?? 0} label="Tools" />
              <StatTile icon={<Sparkles size={14} stroke-width={1.9} />} value={skills().length} label="Skills" />
              <StatTile icon={<BookOpen size={14} stroke-width={1.9} />} value={docCount() ?? 0} label="Knowledge" />
            </div>
          </Show>

          <Show when={agent().persona?.trim()}>
            <Section label="About">
              <p class="whitespace-pre-wrap text-[12.5px] leading-[18px] text-[var(--text-2)]">
                {agent().persona.trim()}
              </p>
            </Section>
          </Show>

          {/* Discord's "Playing" card: what they're on, right now. */}
          <Show when={now().length}>
            <Section label={working() ? "Working on" : "Assigned"}>
              <div class="flex flex-col gap-1.5">
                <For each={now().slice(0, 4)}>
                  {(t) => (
                    <button
                      type="button"
                      onClick={() => actions.openChat(agent().id)}
                      class="rounded-[var(--r2)] bg-[var(--element)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--element-hover)]"
                    >
                      <span class="line-clamp-2 block text-[12px] leading-4 text-[var(--text)]">
                        {t.task}
                      </span>
                      <span class="mt-1 flex items-center gap-1.5 text-[10.5px] text-[var(--muted)]">
                        <span
                          class="size-[6px] rounded-full"
                          style={{ background: working() ? "var(--green)" : "var(--amber)" }}
                        />
                        {t.state.replace(/-/g, " ")} · from {t.from_agent_name}
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </Section>
          </Show>

          {/* Their place in the structure — the org chart's questions, answered
              on the card: who they answer to, who answers to them, and which
              teams they serve on. People are faces, not strings. */}
          <Show when={manager() || reports().length || teams().length}>
            <Section label="Organization">
              <div class="flex flex-col gap-2">
                <Show when={manager()}>
                  {(m) => <PeopleRow label="Reports to" agents={[m()]} />}
                </Show>
                <Show when={reports().length}>
                  <PeopleRow
                    label={reports().length === 1 ? "Direct report" : "Direct reports"}
                    agents={reports()}
                  />
                </Show>
                <Show when={teams().length}>
                  <Fact
                    label={teams().length === 1 ? "Team" : "Teams"}
                    value={teams().map((p) => p.name).join(", ")}
                  />
                </Show>
              </div>
            </Section>
          </Show>

          <Section label="Details">
            <dl class="flex flex-col gap-1.5">
              {/* "Runtime", not "Model": model_backend holds the backend that
                  runs the agent (hermes_agent), and the actual model is chosen
                  per-conversation in the composer. Calling this the model would
                  have the panel contradicting the composer two columns over. */}
              <Show when={agent().model_backend}>
                {(v) => <Fact label="Runtime" value={v()} mono />}
              </Show>
              {/* The org card already says this in its Tools tile. */}
              <Show when={!onOrg()}>
                <Fact
                  label="Tools"
                  value={String(agent().default_tools?.length ?? 0)}
                />
              </Show>
              <Show when={agent().permission_profile}>
                {(v) => <Fact label="Permissions" value={v()} />}
              </Show>
              <Show when={agent().updated_at}>
                {(v) => <Fact label="Last updated" value={shortDate(v())} />}
              </Show>
            </dl>
          </Section>

          {/* Your history with them — the one thing Discord's panel doesn't
              have, and the one an org actually needs. Chat card only: beside
              the org chart the Chat button IS the doorway, and listing threads
              would just duplicate the register behind it. */}
          <Show when={!onOrg()}>
          <Section label="Conversations">
            <Show
              when={threads()?.length}
              fallback={
                <p class="text-[11.5px] text-[var(--faint)]">
                  {threads.loading ? "Loading…" : "No threads yet."}
                </p>
              }
            >
              <div class="flex flex-col gap-px">
                <For each={threads()!.slice(0, 8)}>
                  {(c) => (
                    <button
                      type="button"
                      onClick={() => actions.openChat(agent().id)}
                      class="group/thread flex flex-col rounded-[var(--r2)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--element-hover)]"
                    >
                      <span class="flex items-center gap-1.5">
                        <span class="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--text-2)] transition-colors group-hover/thread:text-[var(--text)]">
                          {c.title?.trim() || "Untitled thread"}
                        </span>
                        <Show when={c.unread_count > 0}>
                          <span class="grid h-4 min-w-4 flex-none place-items-center rounded-[var(--pill)] bg-[var(--red)] px-1.5 text-[10.5px] font-bold text-white">
                            {c.unread_count > 99 ? "99+" : c.unread_count}
                          </span>
                        </Show>
                      </span>
                      <Show when={c.last_message?.trim() || c.last_message_at}>
                        <span class="mt-0.5 truncate text-[11px] leading-4 text-[var(--faint)]">
                          {c.last_message_at ? shortDate(c.last_message_at) : ""}
                          {c.last_message?.trim()
                            ? ` · ${c.last_message.replace(/\s+/g, " ").trim()}`
                            : ""}
                        </span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Section>
          </Show>
        </div>
      </div>

      {/* Sticky, exactly where Discord puts it. */}
      <div class="relative z-10 shrink-0 p-3">
        <button
          type="button"
          onClick={() => actions.openProfile(agent().id)}
          class="w-full rounded-[var(--r2)] bg-[var(--element)] py-2 text-[12.5px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--element-hover)]"
        >
          View Full Profile
        </button>
      </div>
      </div>
    </aside>
  );
}

/** One of the org card's three at-a-glance numbers. */
function StatTile(props: { icon: any; value: number | string; label: string }) {
  return (
    <div class="flex flex-col items-center gap-0.5 rounded-[var(--r3)] bg-[var(--element)]/70 py-2">
      <span class="text-[var(--muted)]">{props.icon}</span>
      <span class="text-[17px] font-bold leading-5 text-[var(--text)]">{props.value}</span>
      <span class="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
        {props.label}
      </span>
    </div>
  );
}

/** A relationship row where the people are faces — avatar chips, not names. */
function PeopleRow(props: { label: string; agents: Agent[] }) {
  return (
    <div class="flex items-center justify-between gap-2">
      <span class="shrink-0 text-[11.5px] text-[var(--muted)]">{props.label}</span>
      <span class="flex min-w-0 flex-wrap justify-end gap-1">
        <For each={props.agents}>
          {(a) => (
            <span class="inline-flex max-w-full items-center gap-1.5 rounded-[var(--pill)] bg-[var(--element)] py-0.5 pl-0.5 pr-2">
              <Avatar name={a.name} size={16} circle />
              <span class="truncate text-[11.5px] text-[var(--text-2)]">{a.name}</span>
            </span>
          )}
        </For>
      </span>
    </div>
  );
}

function Section(props: { label: string; children: any }) {
  return (
    <section class="flex flex-col gap-1.5">
      <h3 class="text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
        {props.label}
      </h3>
      {props.children}
    </section>
  );
}

function Fact(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div class="flex items-baseline justify-between gap-2">
      <dt class="shrink-0 text-[11.5px] text-[var(--muted)]">{props.label}</dt>
      <dd
        class="min-w-0 truncate text-[11.5px] text-[var(--text-2)]"
        classList={{ "font-mono text-[11px]": props.mono }}
      >
        {props.value}
      </dd>
    </div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function prettyRole(role: string): string {
  if (role === "system") return "System";
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

import { createSignal, For, Show } from "solid-js";

import { CapabilitiesTab } from "~/components/agent-capabilities";
import {
  KnowledgeTab,
  RoutinesTab,
  SoulTab,
  WorkTab,
} from "~/components/agent-profile";
import { Avatar, avatarColor } from "~/components/avatar";
import { confirmDialog } from "~/components/confirm";
import { Modal } from "~/components/modal";
import { RoutinesModal } from "~/components/routines-modal";
import { settings } from "~/lib/settings";
import { actions, agentById, agentWorking } from "~/lib/store";
import type { Agent } from "~/lib/types";

/**
 * The full profile — Discord's two-pane modal.
 *
 * Identity on the left, everything that shapes the agent on the right. It's a
 * dialog rather than a page because a profile is something you glance at
 * mid-conversation: the thread stays behind it, and closing puts you back where
 * you were instead of somewhere you have to navigate out of.
 *
 * The tabs are Discord's slots pointed at what an agent actually has. One
 * deliberate merge: Discord would give Skills and Tools a tab each, but
 * `CapabilitiesTab` draws them as ONE graph — skills wiring in from the left,
 * tools from the right, the agent in the middle — so splitting it would mean
 * rendering half a picture twice.
 */
type Tab = "overview" | "capabilities" | "knowledge" | "activity" | "routines";

const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["capabilities", "Capabilities"],
  ["knowledge", "Knowledge"],
  ["activity", "Activity"],
  ["routines", "Routines"],
];

export function AgentProfileModal(props: { agent: Agent; onClose: () => void }) {
  const [tab, setTab] = createSignal<Tab>("overview");
  const [routines, setRoutines] = createSignal(false);

  const agent = () => props.agent;
  /** This agent's own colour when accenting is dynamic; the fixed accent
   *  otherwise. The same rule the docked profile card follows. */
  const tint = () =>
    settings.dynamicAccent ? avatarColor(agent().name) : "var(--blurple)";
  const isSystem = () => agent().role === "system";
  const working = () => agentWorking(agent().id);
  const handle = () => `@${agent().name.toLowerCase().replace(/\s+/g, "")}`;
  const manager = () => agentById(agent().reports_to);

  const message = () => {
    props.onClose();
    void actions.openAgent(agent().id);
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Remove ${agent().name}?`,
      message:
        "This deletes the agent and everything it has said. Work it already did — documents, reports — stays in the knowledge bank. This can't be undone.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    await actions.deleteAgent(agent().id).catch(() => {});
    props.onClose();
  };

  return (
    <>
      {/* Wider than Discord's ~890: the Capabilities tab is a three-column
          graph (skills → agent → tools) plus a catalog rail, and at 920 the
          agent node fell off the edge. Modal caps at the viewport anyway, so
          small windows just get the scroll fallback below. */}
      <Modal bare width={1160} onClose={props.onClose}>
        <div class="flex h-[74vh] min-h-0 w-full">
          {/* ── identity ──
              A card, not a column: inset and rounded, with the agent's colour
              running down it as a gradient rather than sitting in a flat band
              at the top. Deliberately milder than Discord's, which saturates
              the lower half — at that strength the details stop being readable
              against it. */}
          <div class="shrink-0 p-2 pr-0">
            <div
              class="aular-no-scrollbar flex h-full w-[310px] flex-col overflow-y-auto rounded-[var(--r4)] bg-[var(--sidebar)]"
              style={{
                "background-image": `linear-gradient(180deg, color-mix(in srgb, ${tint()} 38%, transparent) 0%, transparent 26%, transparent 62%, color-mix(in srgb, ${tint()} 16%, transparent) 100%)`,
              }}
            >
            <div class="h-[68px] shrink-0" />

            <div class="flex flex-col gap-3 px-5 pb-5">
              <span class="relative -mt-10 inline-block w-fit rounded-full ring-[6px] ring-[var(--sidebar)]">
                <Avatar name={agent().name} size={80} circle />
                <span
                  class="absolute bottom-1 right-1 size-[20px] rounded-full border-[5px] border-[var(--sidebar)]"
                  style={{ background: working() ? "var(--green)" : "var(--faint)" }}
                />
              </span>

              <div>
                <h2 class="truncate text-[21px] font-bold leading-7 text-[var(--text)]">
                  {agent().name}
                </h2>
                <p class="truncate text-[12.5px] text-[var(--text-2)]">
                  {handle()} · {prettyRole(agent().role)}
                </p>
                <Show when={working()}>
                  <p class="aular-shimmer mt-0.5 text-[11.5px] font-medium text-[var(--green)]">
                    working…
                  </p>
                </Show>
              </div>

              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={message}
                  class="flex-1 rounded-[var(--r2)] bg-[var(--accent)] bg-[image:var(--accent-grad)] py-[7px] text-[12.5px] font-semibold text-[var(--on-accent)] transition-all hover:brightness-110"
                >
                  Message
                </button>
                <Show when={!isSystem()}>
                  <button
                    type="button"
                    onClick={() => void remove()}
                    title={`Remove ${agent().name}`}
                    class="rounded-[var(--r2)] px-3 py-[7px] text-[12.5px] font-semibold text-[var(--red)] transition-colors hover:bg-[var(--element-hover)]"
                  >
                    Remove
                  </button>
                </Show>
              </div>

              <Show when={agent().persona?.trim()}>
                <Block label="About">
                  <p class="whitespace-pre-wrap text-[12.5px] leading-[18px] text-[var(--text-2)]">
                    {agent().persona.trim()}
                  </p>
                </Block>
              </Show>

              <Show when={manager()}>
                {(m) => (
                  <Block label="Reports to">
                    <button
                      type="button"
                      onClick={() => actions.openProfile(m().id)}
                      class="flex items-center gap-2 rounded-[var(--r2)] px-1 py-1 text-left transition-colors hover:bg-[var(--element-hover)]"
                    >
                      <Avatar name={m().name} size={22} circle />
                      <span class="min-w-0 truncate text-[12.5px] text-[var(--text-2)]">
                        {m().name}
                      </span>
                    </button>
                  </Block>
                )}
              </Show>

              <Show when={agent().model_backend}>
                {(v) => (
                  <Block label="Runtime">
                    <p class="truncate font-mono text-[11.5px] text-[var(--text-2)]">{v()}</p>
                  </Block>
                )}
              </Show>

              <AgentNote agentId={agent().id} />
            </div>
            </div>
          </div>

          {/* ── everything that shapes it ── */}
          <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg)]">
            <nav class="flex shrink-0 items-center gap-1 border-b border-[var(--line)] px-4 pr-12">
              <For each={TABS}>
                {([id, label]) => (
                  <button
                    type="button"
                    onClick={() => setTab(id)}
                    aria-current={tab() === id}
                    class="-mb-px px-3 py-[11px] text-[12.5px] font-[650] transition-colors"
                    style={{
                      color: tab() === id ? "var(--text)" : "var(--muted)",
                      "border-bottom":
                        tab() === id ? "2px solid var(--text)" : "2px solid transparent",
                    }}
                  >
                    {label}
                  </button>
                )}
              </For>
            </nav>

            <div class="aular-no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-auto px-5 py-4">
              <Show when={tab() === "overview"}>
                <SoulTab agent={agent()} />
              </Show>
              <Show when={tab() === "capabilities"}>
                {/* The graph doesn't wrap — below this it scrolls rather than
                    silently cropping the agent off its own canvas. */}
                <div class="min-w-[760px]">
                  <CapabilitiesTab agent={agent()} />
                </div>
              </Show>
              <Show when={tab() === "knowledge"}>
                <KnowledgeTab agent={agent()} />
              </Show>
              <Show when={tab() === "activity"}>
                <WorkTab agent={agent()} />
              </Show>
              <Show when={tab() === "routines"}>
                <RoutinesTab agent={agent()} onManage={() => setRoutines(true)} />
              </Show>
            </div>
          </div>
        </div>
      </Modal>

      <Show when={routines()}>
        <RoutinesModal agent={agent()} onClose={() => setRoutines(false)} />
      </Show>
    </>
  );
}

/**
 * A private note — Discord's "only visible to you", and worth keeping for an
 * org of agents: what this one is actually good at, what to never ask it, the
 * things you learn by working with it.
 *
 * Local to this machine on purpose. It's a note to yourself about an agent, not
 * something the agent should read back out of its own prompt.
 */
function AgentNote(props: { agentId: string }) {
  const key = () => `aular-agent-note-${props.agentId}`;
  const [note, setNote] = createSignal(read(key()));

  const save = (v: string) => {
    setNote(v);
    try {
      if (v.trim()) localStorage.setItem(key(), v);
      else localStorage.removeItem(key());
    } catch {
      /* private mode */
    }
  };

  return (
    <Block label="Note (only visible to you)">
      <textarea
        value={note()}
        onInput={(e) => save(e.currentTarget.value)}
        rows={2}
        placeholder="Click to add a note"
        class="w-full resize-none rounded-[var(--r2)] bg-[var(--element)] px-2 py-1.5 text-[12px] leading-4 text-[var(--text-2)] outline-none placeholder:text-[var(--faint)] focus:bg-[var(--element-hover)]"
      />
    </Block>
  );
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function Block(props: { label: string; children: any }) {
  return (
    <section class="flex flex-col gap-1">
      <h3 class="text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
        {props.label}
      </h3>
      {props.children}
    </section>
  );
}

function prettyRole(role: string): string {
  if (role === "system") return "System";
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

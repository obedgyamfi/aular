import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Avatar } from "~/components/avatar";
import { settingsActions } from "~/lib/settings";
import { actions, state } from "~/lib/store";
import { resolvedScheme, setColorScheme } from "~/theme/theme";

/**
 * The command palette — ⌘K.
 *
 * One place to reach anything: jump to an agent, switch register, hire, change
 * the theme, sign out. Agents rank above commands because jumping to a person
 * is what you actually do all day.
 */
interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  keywords?: string;
  run: () => void;
}

type IconName =
  | "speech-bubble"
  | "terminal"
  | "subagent"
  | "settings-gear"
  | "plus-small"
  | "sliders"
  | "bubble-5"
  | "task"
  | "close";

export function CommandPalette(props: { onClose: () => void; onHire: () => void }) {
  const [query, setQuery] = createSignal("");
  const [cursor, setCursor] = createSignal(0);
  let input: HTMLInputElement | undefined;
  let listEl: HTMLDivElement | undefined;

  onMount(() => input?.focus());

  const commands = (): Command[] => [
    {
      id: "chat",
      label: "Go to Chat",
      icon: "speech-bubble",
      keywords: "messages threads",
      run: () => actions.setRegister("chat"),
    },
    {
      id: "work",
      label: "Go to Work",
      hint: "The tool register",
      icon: "terminal",
      keywords: "tools terminal session feed",
      run: () => actions.setRegister("work"),
    },
    {
      id: "org",
      label: "Go to Organization",
      hint: "Overview, chart, knowledge bank",
      icon: "subagent",
      keywords: "org chart docs dashboard metrics",
      run: () => actions.setRegister("org"),
    },
    {
      id: "calendar",
      label: "Go to Calendar",
      hint: "What's scheduled this week",
      icon: "task",
      keywords: "schedule routines cron reminders week agenda",
      run: () => actions.setRegister("calendar"),
    },
    {
      id: "settings",
      label: "Open Settings",
      icon: "settings-gear",
      keywords: "preferences model key byok usage memory account",
      run: () => actions.setRegister("settings"),
    },
    {
      id: "hire",
      label: "Hire an agent",
      hint: "From a role, a description, or scratch",
      icon: "plus-small",
      keywords: "add new agent staff team",
      run: props.onHire,
    },
    {
      id: "theme",
      // "System" resolves to whatever the OS is showing, so ask what's on
      // screen — not what's stored, or the label offers you the theme you're in.
      label:
        resolvedScheme() === "dark" ? "Switch to light theme" : "Switch to dark theme",
      icon: "sliders",
      keywords: "appearance dark light mode",
      run: () => setColorScheme(resolvedScheme() === "dark" ? "light" : "dark"),
    },
    {
      id: "mute",
      label: "Mute this agent",
      hint: state.activeAgentId ? undefined : "Open an agent first",
      icon: "bubble-5",
      keywords: "notifications silence",
      run: () => {
        const id = state.activeAgentId;
        if (id) settingsActions.toggleMute(id);
      },
    },
    {
      id: "signout",
      label: "Sign out",
      icon: "close",
      keywords: "log out account leave",
      run: () => void actions.signOut(),
    },
  ];

  const matches = (haystack: string) => {
    const q = query().trim().toLowerCase();
    return !q || haystack.toLowerCase().includes(q);
  };

  const agents = createMemo(() =>
    state.agents
      .filter((a) => matches(`${a.name} ${a.role}`))
      .slice(0, 6)
      .map(
        (a): Command => ({
          id: `agent:${a.id}`,
          label: a.name,
          hint: a.role.replace(/_/g, " "),
          icon: "speech-bubble",
          run: () => {
            actions.setRegister("chat");
            void actions.openAgent(a.id);
          },
        }),
      ),
  );

  const cmds = createMemo(() =>
    commands().filter((c) => matches(`${c.label} ${c.keywords ?? ""}`)),
  );

  /** One flat list, so ↑↓ crosses the section break without a special case. */
  const flat = createMemo(() => [...agents(), ...cmds()]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    props.onClose();
    c.run();
  };

  const move = (delta: number) => {
    const n = flat().length;
    if (!n) return;
    const next = (cursor() + delta + n) % n;
    setCursor(next);
    listEl
      ?.querySelector(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(flat()[cursor()]);
    }
  };

  document.addEventListener("keydown", onKeyDown);
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(0,0,0,0.45)] pt-[12vh]"
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        class="flex max-h-[60vh] w-[520px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 shadow-2xl"
      >
        <div class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-3 py-2.5">
          <span class="text-v2-icon-icon-muted">
            <Icon name="magnifying-glass" size="small" />
          </span>
          <input
            ref={input}
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setCursor(0);
            }}
            placeholder="Jump to an agent, or run a command"
            class="min-w-0 flex-1 bg-transparent text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-weak"
          />
          <kbd class="shrink-0 rounded border border-v2-border-border-muted px-1.5 py-0.5 font-mono text-[9.5px] text-v2-text-text-weak">
            ESC
          </kbd>
        </div>

        <div ref={listEl} class="min-h-0 flex-1 overflow-y-auto p-1.5">
          <Show when={agents().length}>
            <Label>Agents</Label>
            <For each={agents()}>
              {(c, i) => (
                <Item
                  cmd={c}
                  index={i()}
                  active={cursor() === i()}
                  onHover={setCursor}
                  onRun={run}
                  avatar
                />
              )}
            </For>
          </Show>

          <Show when={cmds().length}>
            <Label>Commands</Label>
            <For each={cmds()}>
              {(c, i) => {
                const index = () => agents().length + i();
                return (
                  <Item
                    cmd={c}
                    index={index()}
                    active={cursor() === index()}
                    onHover={setCursor}
                    onRun={run}
                  />
                );
              }}
            </For>
          </Show>

          <Show when={!flat().length}>
            <p class="px-2 py-6 text-center text-[11.5px] text-v2-text-text-weak">
              Nothing matches “{query()}”.
            </p>
          </Show>
        </div>
      </div>
    </div>
  );
}

function Label(props: { children: any }) {
  return (
    <div class="px-2 pb-1 pt-2 text-[9.5px] font-medium uppercase tracking-[0.08em] text-v2-text-text-weak">
      {props.children}
    </div>
  );
}

function Item(props: {
  cmd: Command;
  index: number;
  active: boolean;
  avatar?: boolean;
  onHover: (i: number) => void;
  onRun: (c: Command) => void;
}) {
  const c = () => props.cmd;
  return (
    <button
      type="button"
      data-index={props.index}
      aria-current={props.active}
      onMouseEnter={() => props.onHover(props.index)}
      onClick={() => props.onRun(c())}
      class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors aria-[current=true]:bg-v2-overlay-simple-overlay-pressed"
    >
      <Show
        when={props.avatar}
        fallback={
          <span class="shrink-0 text-v2-icon-icon-muted">
            <Icon name={c().icon} size="small" />
          </span>
        }
      >
        <Avatar name={c().label} size={20} />
      </Show>

      <span class="min-w-0 flex-1 truncate text-[12.5px] text-v2-text-text-base">
        {c().label}
      </span>
      <Show when={c().hint}>
        <span class="shrink-0 text-[10.5px] text-v2-text-text-weak">{c().hint}</span>
      </Show>
    </button>
  );
}

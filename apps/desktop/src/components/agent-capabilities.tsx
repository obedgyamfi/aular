import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import Sparkles from "lucide-solid/icons/sparkles";
import Wrench from "lucide-solid/icons/wrench";
import X from "lucide-solid/icons/x";

import { Avatar } from "~/components/avatar";
import { api } from "~/lib/api";
import { actions, state } from "~/lib/store";
import type { Agent } from "~/lib/types";

/**
 * The agent's capabilities — the design's n8n-style node graph.
 *
 * The agent sits in the center; skills wire in from the left, tools from the
 * right, each connector a measured SVG curve. The rail on the right is the
 * catalog: search it, click to wire a capability in, × on a card to cut it.
 *
 * Tools are real — `default_tools`, enforced by the runtime, saved per click.
 * Skills are the org's vocabulary for what an agent is *for*; they live in the
 * store until a backend model exists (the wiring is the same either way).
 */

const SKILL_CATALOG: { name: string; tag: "Marketplace" | "Directory" }[] = [
  { name: "Frontend engineering", tag: "Marketplace" },
  { name: "Backend engineering", tag: "Marketplace" },
  { name: "QA & testing", tag: "Marketplace" },
  { name: "Code review", tag: "Directory" },
  { name: "Technical writing", tag: "Directory" },
  { name: "Data analysis", tag: "Marketplace" },
  { name: "Product research", tag: "Directory" },
  { name: "UI design", tag: "Marketplace" },
  { name: "DevOps & infra", tag: "Directory" },
  { name: "Prompt engineering", tag: "Directory" },
];

/** A starting hand of skills, read off the role the way a person would. */
export function defaultSkillsForRole(role: string): string[] {
  const r = role.toLowerCase();
  if (r.includes("front")) return ["Frontend engineering", "UI design"];
  if (r.includes("back")) return ["Backend engineering", "DevOps & infra"];
  if (r.includes("qa") || r.includes("test")) return ["QA & testing", "Code review"];
  if (r.includes("design")) return ["UI design", "Product research"];
  if (r.includes("research") || r.includes("analy")) return ["Data analysis", "Product research"];
  if (r.includes("writ") || r.includes("doc")) return ["Technical writing"];
  if (r.includes("engineer") || r.includes("dev")) return ["Backend engineering", "Code review"];
  return ["Product research", "Technical writing"];
}

export function CapabilitiesTab(props: { agent: Agent }) {
  const agent = () => props.agent;
  const isSystem = () => agent().role === "system";

  const [tools] = createResource(() => api.listToolDefinitions().catch(() => []));

  // ── what's wired in ──────────────────────────────────────────────────────
  const skills = createMemo(
    () => state.agentSkills[agent().id] ?? defaultSkillsForRole(agent().role),
  );
  const enabledTools = createMemo(() => agent().default_tools ?? []);

  const toggleSkill = (name: string) => {
    if (isSystem()) return;
    const cur = skills();
    actions.setAgentSkills(
      agent().id,
      cur.includes(name) ? cur.filter((s) => s !== name) : [...cur, name],
    );
  };

  const [savingTool, setSavingTool] = createSignal("");
  const toggleTool = async (name: string) => {
    if (isSystem() || savingTool()) return;
    const cur = enabledTools();
    const next = cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name];
    setSavingTool(name);
    try {
      await actions.updateAgent(agent().id, { default_tools: next });
    } finally {
      setSavingTool("");
    }
  };

  // ── the measured connectors ──────────────────────────────────────────────
  let canvas: HTMLDivElement | undefined;
  let centerEl: HTMLDivElement | undefined;
  const cardEls = new Map<string, HTMLElement>();
  const [paths, setPaths] = createSignal<{ d: string; key: string }[]>([]);
  const [size, setSize] = createSignal({ w: 0, h: 0 });

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = Math.max(36, Math.abs(x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  const redraw = () => {
    if (!canvas || !centerEl) return;
    const box = canvas.getBoundingClientRect();
    setSize({ w: box.width, h: box.height });
    const c = centerEl.getBoundingClientRect();
    const cl = { x: c.left - box.left, y: c.top - box.top + c.height / 2 };
    const cr = { x: c.right - box.left, y: cl.y };

    const next: { d: string; key: string }[] = [];
    for (const name of skills()) {
      const el = cardEls.get(`s:${name}`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      next.push({
        key: `s:${name}`,
        d: curve(r.right - box.left, r.top - box.top + r.height / 2, cl.x, cl.y),
      });
    }
    for (const name of enabledTools()) {
      const el = cardEls.get(`t:${name}`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      next.push({
        key: `t:${name}`,
        d: curve(cr.x, cr.y, r.left - box.left, r.top - box.top + r.height / 2),
      });
    }
    setPaths(next);
  };

  onMount(() => {
    const ro = new ResizeObserver(() => redraw());
    if (canvas) ro.observe(canvas);
    onCleanup(() => ro.disconnect());
  });
  // Cards mount after data arrives; measure once the DOM has settled.
  createEffect(() => {
    skills();
    enabledTools();
    tools();
    requestAnimationFrame(redraw);
  });

  const card = (key: string) => (el: HTMLElement) => {
    cardEls.set(key, el);
    onCleanup(() => cardEls.delete(key));
  };

  return (
    <div class="flex min-h-0 gap-5">
      {/* ── the canvas ── */}
      <div
        ref={canvas}
        class="relative min-h-[420px] flex-1 overflow-hidden rounded-xl border border-v2-border-border-muted bg-v2-background-bg-deep"
        style={{
          "background-image": "radial-gradient(var(--v2-border-border-muted) 1px, transparent 1px)",
          "background-size": "18px 18px",
        }}
      >
        <svg
          class="pointer-events-none absolute inset-0"
          width={size().w}
          height={size().h}
          aria-hidden="true"
        >
          <For each={paths()}>
            {(p) => (
              <path
                d={p.d}
                fill="none"
                stroke="var(--v2-border-border-strong)"
                stroke-width="1.5"
              />
            )}
          </For>
        </svg>

        <div class="relative grid h-full grid-cols-[200px_minmax(0,1fr)_200px] gap-4 p-4">
          {/* skills, wired in from the left */}
          <div class="flex flex-col justify-center gap-2.5">
            <For
              each={skills()}
              fallback={
                <p class="text-center text-[11px] text-v2-text-text-faint">
                  No skills wired — add from the rail.
                </p>
              }
            >
              {(name) => (
                <NodeCard
                  ref={card(`s:${name}`)}
                  icon={<Sparkles size={13} stroke-width={1.8} />}
                  label={name}
                  onDisconnect={isSystem() ? undefined : () => toggleSkill(name)}
                />
              )}
            </For>
          </div>

          {/* the agent, center */}
          <div class="flex items-center justify-center">
            <div
              ref={centerEl}
              class="flex w-[168px] flex-col items-center gap-2 rounded-xl border border-v2-border-border-base bg-v2-background-bg-base px-4 py-4 shadow-lg"
            >
              <Avatar name={agent().name} size={44} />
              <div class="text-center">
                <div class="text-[13px] font-semibold text-v2-text-text-base">{agent().name}</div>
                <div class="text-[10.5px] text-v2-text-text-muted">{prettyRole(agent().role)}</div>
              </div>
            </div>
          </div>

          {/* tools, wired in from the right */}
          <div class="flex flex-col justify-center gap-2.5">
            <For
              each={enabledTools()}
              fallback={
                <p class="text-center text-[11px] text-v2-text-text-faint">
                  No tools connected — add from the rail.
                </p>
              }
            >
              {(name) => (
                <NodeCard
                  ref={card(`t:${name}`)}
                  icon={<Wrench size={13} stroke-width={1.8} />}
                  label={name}
                  mono
                  busy={savingTool() === name}
                  onDisconnect={isSystem() ? undefined : () => void toggleTool(name)}
                />
              )}
            </For>
          </div>
        </div>
      </div>

      {/* ── the capability rail ── */}
      <CapabilityRail
        agent={agent()}
        skills={skills()}
        enabledTools={enabledTools()}
        allTools={(tools() ?? []).map((t) => t.name)}
        savingTool={savingTool()}
        onToggleSkill={toggleSkill}
        onToggleTool={(n) => void toggleTool(n)}
      />
    </div>
  );
}

/** One node on the canvas: icon, label, and the disconnect ×. */
function NodeCard(props: {
  ref: (el: HTMLElement) => void;
  icon: any;
  label: string;
  mono?: boolean;
  busy?: boolean;
  onDisconnect?: () => void;
}) {
  return (
    <div
      ref={props.ref}
      class="group relative flex items-center gap-2 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-base px-2.5 py-2 shadow-sm"
      classList={{ "opacity-60": props.busy }}
    >
      <span class="grid size-6 shrink-0 place-items-center rounded-md bg-v2-background-bg-layer-01 text-v2-text-text-accent">
        {props.icon}
      </span>
      <span
        class="min-w-0 flex-1 truncate text-[11.5px] font-medium text-v2-text-text-base"
        classList={{ "font-mono text-[11px]": props.mono }}
        title={props.label}
      >
        {props.label}
      </span>
      <Show when={props.onDisconnect}>
        <button
          type="button"
          aria-label={`Disconnect ${props.label}`}
          onClick={props.onDisconnect}
          class="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full border border-v2-border-border-base bg-v2-background-bg-base text-v2-icon-icon-muted opacity-0 transition-opacity hover:text-v2-state-fg-danger group-hover:opacity-100"
        >
          <X size={9} stroke-width={2.4} />
        </button>
      </Show>
    </div>
  );
}

/** The catalog: search, Skills / Tools toggle, and one-click wiring. */
function CapabilityRail(props: {
  agent: Agent;
  skills: string[];
  enabledTools: string[];
  allTools: string[];
  savingTool: string;
  onToggleSkill: (name: string) => void;
  onToggleTool: (name: string) => void;
}) {
  const [mode, setMode] = createSignal<"skills" | "tools">("skills");
  const [query, setQuery] = createSignal("");
  const isSystem = () => props.agent.role === "system";

  const skillEntries = createMemo(() => [
    ...SKILL_CATALOG,
    ...state.customSkills.map((name) => ({ name, tag: "Custom" as const })),
  ]);

  const list = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (mode() === "skills") {
      return skillEntries()
        .filter((s) => !q || s.name.toLowerCase().includes(q))
        .map((s) => ({ name: s.name, tag: s.tag, on: props.skills.includes(s.name) }));
    }
    return props.allTools
      .filter((t) => !q || t.toLowerCase().includes(q))
      .map((t) => ({ name: t, tag: "Runtime" as const, on: props.enabledTools.includes(t) }));
  });

  const noMatch = () =>
    mode() === "skills" && query().trim().length > 1 && list().length === 0;

  return (
    <aside class="flex w-[280px] shrink-0 flex-col gap-3">
      <div class="flex items-center gap-1.5 rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-2 py-1.5 focus-within:border-v2-border-border-focus">
        <Search size={13} stroke-width={2} class="shrink-0 text-v2-icon-icon-muted" />
        <input
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder={mode() === "skills" ? "Search skills" : "Search tools"}
          class="min-w-0 flex-1 bg-transparent text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
        />
      </div>

      <div class="grid grid-cols-2 rounded-md border border-v2-border-border-muted bg-v2-background-bg-deep p-0.5">
        <RailToggle label="Skills" on={mode() === "skills"} onClick={() => setMode("skills")} />
        <RailToggle label="Tools · MCP" on={mode() === "tools"} onClick={() => setMode("tools")} />
      </div>

      <div class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2">
        <For each={list()}>
          {(item) => (
            <button
              type="button"
              disabled={isSystem() || props.savingTool === item.name}
              onClick={() =>
                mode() === "skills" ? props.onToggleSkill(item.name) : props.onToggleTool(item.name)
              }
              aria-pressed={item.on}
              class="group flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-50 aria-[pressed=true]:border-v2-border-border-focus aria-[pressed=true]:bg-v2-overlay-simple-overlay-pressed aria-[pressed=false]:border-v2-border-border-muted aria-[pressed=false]:bg-v2-background-bg-base aria-[pressed=false]:hover:border-v2-border-border-strong"
            >
              <span
                class="min-w-0 flex-1 truncate text-[12px] font-medium text-v2-text-text-base"
                classList={{ "font-mono text-[11.5px]": mode() === "tools" }}
              >
                {item.name}
              </span>
              <span class="shrink-0 rounded-full bg-v2-background-bg-layer-01 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-v2-text-text-faint">
                {item.tag}
              </span>
              <span
                class="shrink-0 text-[10.5px] font-semibold"
                classList={{
                  "text-v2-text-text-accent": item.on,
                  "text-v2-text-text-faint opacity-0 group-hover:opacity-100": !item.on,
                }}
              >
                {item.on ? "Wired" : "Add"}
              </span>
            </button>
          )}
        </For>

        <Show when={noMatch()}>
          <button
            type="button"
            disabled={isSystem()}
            onClick={() => {
              actions.addCustomSkill(props.agent.id, query(), props.skills);
              setQuery("");
            }}
            class="flex items-center gap-2 rounded-lg border border-dashed border-v2-border-border-strong px-2.5 py-2.5 text-left text-[12px] font-medium text-v2-text-text-accent transition-colors hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-50"
          >
            <Plus size={14} stroke-width={2} />
            Create “{query().trim()}” as a custom skill
          </button>
        </Show>
      </div>

      <p class="text-[10.5px] leading-relaxed text-v2-text-text-faint">
        Tools are enforced by the runtime and save on click. Skills shape how
        work is routed to this agent.
      </p>
    </aside>
  );
}

function RailToggle(props: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.on}
      class="rounded-[5px] px-2 py-1 text-[11.5px] font-semibold transition-colors aria-[pressed=true]:bg-v2-background-bg-base aria-[pressed=true]:text-v2-text-text-base aria-[pressed=true]:shadow-sm aria-[pressed=false]:text-v2-text-text-muted"
    >
      {props.label}
    </button>
  );
}

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

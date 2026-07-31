import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import {
  ArrowUp,
  FolderClock,
  Gauge,
  Paperclip,
  Plus,
  Slash,
  Sparkles,
  Square,
  X,
  Zap,
} from "lucide-solid";

import { CommandPane, type PaneItem } from "~/components/command-pane";
import { api } from "~/lib/api";
import { SLASH_COMMANDS } from "~/lib/slash-commands";
import {
  actions,
  activeAgent,
  activeConversationId,
  activeWorking,
  state,
} from "~/lib/store";
import { onComposerFocus } from "~/lib/window";
import type { ConversationContext } from "~/lib/types";

/**
 * The composer — Discord-shaped, Hermes-powered.
 *
 * One rounded slab on a single row, Discord's shape: a `+` menu on the left
 * (attach, slash commands, sessions), the input in the middle, and on the right
 * the controls that spend tokens — reasoning effort, the model, the context
 * gauge, and send. The flanks are pinned to the first line, so a long draft
 * grows the box downward past them instead of pushing them around.
 * Every control routes a REAL Hermes command (`/reasoning`, `/fast`, `/model`,
 * `/status`, `/new`, `/sessions`), which the gateway short-circuits for free,
 * so nothing here is cosmetic.
 */
export function Composer() {
  const [text, setText] = createSignal("");
  const [ctx, setCtx] = createSignal<ConversationContext | null>(null);
  const [refresh, setRefresh] = createSignal(0);

  let area: HTMLTextAreaElement | undefined;
  let fileInput: HTMLInputElement | undefined;

  const enabled = () => !!activeAgent();

  // The conversation's opening CTA hands the cursor over to us.
  onCleanup(onComposerFocus(() => area?.focus()));

  // ── the command pane: `/` commands and `@` mentions ───────────────────────
  const [dismissed, setDismissed] = createSignal(false);
  const [selected, setSelected] = createSignal(0);
  const [caret, setCaret] = createSignal(0);

  /** What the caret is sitting inside, if it's a completable token. */
  const trigger = createMemo(() => triggerAt(text(), caret()));

  const items = createMemo<PaneItem[]>(() => {
    const t = trigger();
    if (!t || dismissed()) return [];
    if (t.kind === "slash") {
      return SLASH_COMMANDS.filter((c) => c.cmd.slice(1).startsWith(t.q)).map((c) => ({
        id: c.cmd,
        label: c.cmd,
        args: c.args,
        desc: c.desc,
      }));
    }
    // Mentions: teammates you can pull into this turn, the system agent last —
    // you talk to AULAR in its own channel, not by summoning it here. Prefix
    // matches rank above mid-word ones, then alphabetical, so the list is
    // predictable instead of following the store's arrival order.
    return state.agents
      .filter((a) => a.name.toLowerCase().includes(t.q))
      .sort((a, b) => {
        const sys = Number(a.role === "system") - Number(b.role === "system");
        if (sys !== 0) return sys;
        const pa = Number(!a.name.toLowerCase().startsWith(t.q));
        const pb = Number(!b.name.toLowerCase().startsWith(t.q));
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map((a) => ({ id: a.id, label: `@${a.name}`, desc: prettyRole(a.role), avatar: a.name }));
  });

  // A fresh token restarts the selection at the top.
  createEffect(() => {
    const t = trigger();
    if (!t) setDismissed(false);
    setSelected(0);
  });

  /** Remember where the caret is so the pane knows which token to complete. */
  const syncCaret = () => setCaret(area?.selectionStart ?? text().length);

  const pick = (item: PaneItem) => {
    const t = trigger();
    if (!t) return;

    if (t.kind === "mention") {
      // Swap the half-typed handle for the full one and keep writing. Only add
      // the trailing space when the text doesn't already continue with one —
      // completing mid-sentence would otherwise leave "@Nova  please".
      const rest = text().slice(caret());
      const gap = /^\s/.test(rest) ? "" : " ";
      const next = `${text().slice(0, t.from)}${item.label}${gap}${rest}`;
      setText(next);
      const pos = t.from + item.label.length + gap.length;
      queueMicrotask(() => {
        area?.focus();
        area?.setSelectionRange(pos, pos);
        setCaret(pos);
      });
      return;
    }

    const cmd = SLASH_COMMANDS.find((c) => c.cmd === item.id);
    if (!cmd) return;
    if (cmd.needsArgs) {
      setText(cmd.cmd + " ");
      queueMicrotask(() => {
        area?.focus();
        syncCaret();
      });
      return;
    }
    setText("");
    void actions.send(cmd.cmd);
    setRefresh((n) => n + 1);
  };

  /** Fire a gateway command directly (from a toolbar control, not typed). */
  const fire = (cmd: string) => {
    if (!enabled()) return;
    void actions.send(cmd);
    setRefresh((n) => n + 1);
  };

  // ── the context meter ─────────────────────────────────────────────────────
  createEffect(() => {
    const id = activeConversationId();
    refresh();
    if (!id) {
      setCtx(null);
      return;
    }
    let alive = true;
    const load = () =>
      api
        .getContext(id)
        .then((c) => alive && setCtx(c))
        .catch(() => {});
    void load();
    const timer = setInterval(load, 45_000);
    onCleanup(() => {
      alive = false;
      clearInterval(timer);
    });
  });

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  };

  const submit = () => {
    const t = text().trim();
    if ((!t && !state.attachment) || !enabled()) return;
    setText("");
    if (area) area.style.height = "auto";
    void actions.send(t);
    setRefresh((n) => n + 1);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const list = items();
    if (list.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => (s + 1) % list.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => (s - 1 + list.length) % list.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        pick(list[selected()]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const hasDeckHeader = () => !!state.replyTo || !!state.attachment;

  return (
    // Full width, not a centered 760px column: in a channel the composer spans
    // the conversation the way Slack's and Buzz's do. A centred capsule reads as
    // a single-assistant chat app, which is the look we're moving away from.
    <div class="shrink-0 px-4 pb-4 pt-1.5">
      <div class="relative w-full">
        {/* The command pane floats over the deck — `/` commands, `@` mentions. */}
        <Show when={items().length}>
          <CommandPane
            title={trigger()?.kind === "mention" ? "Mention an agent" : "Gateway commands"}
            items={items()}
            selected={selected()}
            hint={
              trigger()?.kind === "mention"
                ? "↑↓ navigate · Tab or Enter to insert · Esc to dismiss"
                : "↑↓ navigate · Tab complete · Enter run · gateway commands cost 0 tokens"
            }
            onHover={setSelected}
            onPick={pick}
          />
        </Show>

        {/* ── the input — Discord's composer ─────────────────────────────────
            A solid, BORDERLESS slab one step lighter than the conversation
            (--element = #383a40 on dark), at the 8px workhorse radius. Discord
            draws no outline and no focus ring here; the tone change alone
            separates it from the timeline, which is why it reads as part of the
            channel rather than a widget floating over it. */}
        <div class="flex flex-col rounded-[var(--r2)] border border-[var(--line)] bg-[var(--element)]">
          {/* What this turn carries, before you've written it. */}
          <Show when={hasDeckHeader()}>
            <div class="flex flex-wrap items-center gap-1.5 px-3.5 pt-3">
              <Show when={state.replyTo}>
                {(m) => (
                  <span class="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border-l-2 border-[var(--accent)] bg-[var(--element)] py-1 pl-2 pr-1">
                    <span class="flex min-w-0 flex-col">
                      <span class="text-[10px] font-semibold text-[var(--accent-text)]">
                        Replying to {m().sender_type === "user" ? "yourself" : activeAgent()?.name}
                      </span>
                      <span class="max-w-[420px] truncate text-[11px] text-[var(--muted)]">
                        {m().content.replace(/\s+/g, " ").trim() || "attachment"}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label="Cancel reply"
                      onClick={() => actions.setReplyTo(null)}
                      class="grid size-5 shrink-0 place-items-center rounded text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
              </Show>

              <Show when={state.attachment}>
                {(a) => (
                  <span class="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--element)] py-1 pl-2 pr-1">
                    <Paperclip size={12} class="text-[var(--muted)]" />
                    <span class="max-w-[240px] truncate text-[11.5px] text-[var(--text)]">
                      {a().name ?? "attachment"}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={() => actions.clearAttachment()}
                      class="grid size-5 place-items-center rounded text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
              </Show>
            </div>
          </Show>

          {/* One row, Discord's shape: the + and the controls flank the input
              rather than sitting on a second deck below it. Both are pinned to
              the TOP of the row (items-start) and given the height of a single
              line, so they stay level with the first line while the box grows
              downward under them. */}
          <div class="flex items-start gap-1">
          <div class="flex h-[42px] shrink-0 items-center pl-2">
            <input
              ref={fileInput}
              type="file"
              class="hidden"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) void actions.attach(f);
                e.currentTarget.value = "";
              }}
            />
            <PlusMenu
              disabled={!enabled()}
              onAttach={() => fileInput?.click()}
              onSlash={() => {
                setText("/");
                setDismissed(false);
                area?.focus();
              }}
              onFire={fire}
            />
          </div>

          <textarea
            ref={area}
            rows={1}
            value={text()}
            disabled={!enabled()}
            onInput={(e) => {
              setText(e.currentTarget.value);
              grow(e.currentTarget);
              syncCaret();
            }}
            onKeyDown={onKeyDown}
            // The pane completes whatever token the caret is in, so it has to
            // follow arrow keys and clicks, not just typing.
            onKeyUp={syncCaret}
            onClick={syncCaret}
            onSelect={syncCaret}
            // Discord's exact phrasing: "Message #channel" for a channel,
            // "Message @name" for a DM — the placeholder names where you're
            // about to speak, which is orientation, not decoration.
            placeholder={
              enabled()
                ? activeAgent()?.role === "system"
                  ? `Message #${activeAgent()!.name.toLowerCase()}`
                  : `Message @${activeAgent()?.name ?? ""}`
                : "Select an agent first"
            }
            class="max-h-[260px] min-w-0 flex-1 resize-none self-center bg-transparent px-1 py-[11px] text-[14px] leading-5 text-[var(--text)] outline-none placeholder:text-[var(--faint)] disabled:opacity-60"
          />

          <div class="flex h-[42px] shrink-0 items-center gap-1 pr-2">
            <ContextGauge ctx={ctx()} draft={text()} onStatus={() => fire("/status")} />
            <ReasoningPill disabled={!enabled()} onFire={fire} />
            <ModelPill onFire={fire} />

            {/* Send — becomes Stop while a turn is in flight. Same seat, always. */}
            <Show
              when={!activeWorking()}
              fallback={
                <button
                  type="button"
                  onClick={() => void actions.send("/stop")}
                  aria-label="Stop the agent"
                  title="Stop (/stop)"
                  class="ml-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--red-soft)] text-[var(--red)] transition-opacity hover:opacity-90"
                >
                  <Square size={12} fill="currentColor" />
                </button>
              }
            >
              <button
                type="button"
                onClick={submit}
                disabled={(!text().trim() && !state.attachment) || !enabled()}
                aria-label="Send"
                title="Send — Enter"
                class="ml-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] bg-[image:var(--accent-grad)] text-[var(--on-accent)] transition-colors hover:brightness-110 disabled:bg-[var(--element)] disabled:bg-none disabled:text-[var(--faint)]"
              >
                <ArrowUp size={16} stroke-width={2.4} />
              </button>
            </Show>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── the + menu ───────────────────────────────────────────────────────────────

function PlusMenu(props: {
  disabled?: boolean;
  onAttach: () => void;
  onSlash: () => void;
  onFire: (cmd: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;
  const onDown = (e: PointerEvent) => {
    if (!root?.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDown));

  const act = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={root} class="relative">
      <button
        type="button"
        disabled={props.disabled}
        aria-label="Add"
        onClick={() => setOpen((o) => !o)}
        class="grid size-8 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)] disabled:opacity-40"
        classList={{ "bg-[var(--element)] text-[var(--text)]": open() }}
      >
        <Plus size={17} stroke-width={2} />
      </button>

      <Show when={open()}>
        <div class="aular-pop absolute bottom-full left-0 z-40 mb-2 w-[230px] rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-xl">
          <MenuItem icon={<Paperclip size={15} stroke-width={1.8} />} label="Add files or photos" hint="⌘U" onClick={() => act(props.onAttach)} />
          <MenuItem icon={<Slash size={15} stroke-width={1.8} />} label="Slash commands" onClick={() => act(props.onSlash)} />
          <div class="mx-2 my-1 h-px bg-[var(--line)]" />
          <MenuItem icon={<FolderClock size={15} stroke-width={1.8} />} label="Browse sessions" onClick={() => act(() => props.onFire("/sessions"))} />
          <MenuItem icon={<Sparkles size={15} stroke-width={1.8} />} label="New session" onClick={() => act(() => props.onFire("/new"))} />
        </div>
      </Show>
    </div>
  );
}

function MenuItem(props: { icon: any; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-[12.5px] text-[var(--text-2)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
    >
      <span class="shrink-0 text-[var(--muted)]">{props.icon}</span>
      <span class="min-w-0 flex-1 truncate">{props.label}</span>
      <Show when={props.hint}>
        <span class="shrink-0 text-[10.5px] text-[var(--faint)]">{props.hint}</span>
      </Show>
    </button>
  );
}

// ── reasoning effort (routes /reasoning) ──────────────────────────────────────

const EFFORTS: { id: string; label: string }[] = [
  { id: "minimal", label: "Minimal" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

function ReasoningPill(props: { disabled?: boolean; onFire: (cmd: string) => void }) {
  const [open, setOpen] = createSignal(false);
  const [level, setLevel] = createSignal<string>("");
  let root: HTMLDivElement | undefined;
  const onDown = (e: PointerEvent) => {
    if (!root?.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDown));

  const pick = (id: string, label: string) => {
    setLevel(label);
    setOpen(false);
    props.onFire(`/reasoning ${id}`);
  };

  return (
    <div ref={root} class="relative">
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => setOpen((o) => !o)}
        title="Reasoning effort — /reasoning"
        class="inline-flex items-center gap-1.5 rounded-[var(--pill)] px-2 py-[5px] text-[11.5px] font-[650] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)] disabled:opacity-40"
      >
        <Gauge size={13} stroke-width={1.9} />
        <span>{level() || "Effort"}</span>
      </button>

      <Show when={open()}>
        <div class="aular-pop absolute bottom-full right-0 z-40 mb-1.5 w-[190px] rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-xl">
          <div class="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--faint)]">
            Reasoning effort
          </div>
          <For each={EFFORTS}>
            {(e) => (
              <button
                type="button"
                onClick={() => pick(e.id, e.label)}
                class="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px] text-[var(--text-2)] transition-colors hover:bg-[var(--element-hover)]"
                classList={{ "text-[var(--text)]": level() === e.label }}
              >
                <span class="min-w-0 flex-1">{e.label}</span>
                <Show when={level() === e.label}>
                  <span class="text-[var(--accent-text)]">✓</span>
                </Show>
              </button>
            )}
          </For>
          <div class="mx-1 my-1 h-px bg-[var(--line)]" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              props.onFire("/reasoning show");
            }}
            class="w-full rounded-[7px] px-2.5 py-1.5 text-left text-[11.5px] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
          >
            Show reasoning in replies
          </button>
        </div>
      </Show>
    </div>
  );
}

// ── the model (routes /model + /fast) ─────────────────────────────────────────

function ModelPill(props: { onFire: (cmd: string) => void }) {
  const [open, setOpen] = createSignal(false);
  const [fast, setFast] = createSignal(false);
  let root: HTMLDivElement | undefined;
  const onDown = (e: PointerEvent) => {
    if (!root?.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDown));

  const m = () => state.model;
  const isCodex = () => m()?.provider === "openai-codex";
  const [models] = createResource(
    () => (open() && isCodex() ? "load" : undefined),
    () => api.codexModels().catch(() => [] as string[]),
  );

  const pick = async (model: string) => {
    setOpen(false);
    await actions.updateModel({ model }).catch(() => {});
  };

  const toggleFast = () => {
    setFast((f) => !f);
    props.onFire("/fast");
  };

  return (
    <Show when={m()}>
      {(model) => (
        <div ref={root} class="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open()}
            title="Model"
            class="inline-flex items-center gap-1.5 rounded-[var(--pill)] px-2 py-[5px] text-[11.5px] font-[650] text-[var(--text-2)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              classList={{
                "bg-[var(--green)]": model().key_set || isCodex(),
                "bg-[var(--amber)]": !model().key_set && !isCodex(),
              }}
            />
            <span class="max-w-[150px] truncate">
              {model().model || model().provider || "no model"}
            </span>
          </button>

          <Show when={open()}>
            <div class="aular-pop absolute bottom-full right-0 z-40 mb-1.5 max-h-[320px] w-[240px] overflow-y-auto rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-xl">
              <div class="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--faint)]">
                Model
              </div>

              <Show
                when={isCodex()}
                fallback={
                  <div class="px-2.5 pb-1.5 pt-0.5">
                    <div class="flex items-center gap-2 rounded-[7px] bg-[var(--element)] px-2.5 py-2">
                      <span class="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text)]">
                        {model().model || model().provider}
                      </span>
                    </div>
                  </div>
                }
              >
                <For
                  each={models() ?? []}
                  fallback={<p class="px-2.5 py-2 text-[11.5px] text-[var(--faint)]">Loading…</p>}
                >
                  {(id) => (
                    <button
                      type="button"
                      onClick={() => void pick(id)}
                      class="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left font-mono text-[11.5px] transition-colors hover:bg-[var(--element-hover)]"
                      classList={{
                        "text-[var(--text)]": model().model === id,
                        "text-[var(--muted)]": model().model !== id,
                      }}
                    >
                      <span class="min-w-0 flex-1 truncate">{id}</span>
                      <Show when={model().model === id}>
                        <span class="text-[var(--accent-text)]">✓</span>
                      </Show>
                    </button>
                  )}
                </For>
              </Show>

              <div class="mx-1 my-1 h-px bg-[var(--line)]" />

              {/* Fast mode — Hermes' /fast, as a toggle. */}
              <button
                type="button"
                onClick={toggleFast}
                class="flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left transition-colors hover:bg-[var(--element-hover)]"
              >
                <Zap size={14} stroke-width={1.9} class="shrink-0 text-[var(--muted)]" />
                <span class="min-w-0 flex-1 text-[12.5px] text-[var(--text-2)]">Fast mode</span>
                <span
                  class="flex h-[18px] w-8 flex-none rounded-full p-[2px] transition-colors"
                  style={{
                    background: fast() ? "var(--accent)" : "var(--element-active)",
                    "justify-content": fast() ? "flex-end" : "flex-start",
                  }}
                >
                  <span class="size-[14px] rounded-full bg-white" style={{ "box-shadow": "var(--shadow-1)" }} />
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  actions.openSettings("model");
                }}
                class="w-full rounded-[7px] px-2.5 py-1.5 text-left text-[11.5px] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
              >
                Model settings…
              </button>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}

// ── the context gauge (opens /status) ─────────────────────────────────────────

function ContextGauge(props: {
  ctx: ConversationContext | null;
  draft: string;
  onStatus: () => void;
}) {
  return (
    <Show when={props.ctx}>
      {(c) => {
        const used = () => c().est_context_tokens;
        const pct = () =>
          Math.min(100, Math.round((used() * 100) / Math.max(1, c().context_length)));
        const draftTokens = () => Math.ceil(props.draft.trim().length / 4);
        const tone = () =>
          pct() > 85 ? "var(--red)" : pct() > 60 ? "var(--amber)" : "var(--muted)";
        const R = 6.5;
        const C = 2 * Math.PI * R;

        return (
          <button
            type="button"
            onClick={props.onStatus}
            title={`≈${used().toLocaleString()} of ${c().context_length.toLocaleString()} context tokens${
              draftTokens() ? ` · ~${draftTokens()} in this draft` : ""
            } — click for /status`}
            class="flex items-center gap-1.5 rounded-[var(--pill)] px-1.5 py-[5px] text-[11px] tabular-nums transition-colors hover:bg-[var(--element-hover)]"
            style={{ color: tone() }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r={R} fill="none" stroke="var(--element-active)" stroke-width="2.5" />
              <circle
                cx="8"
                cy="8"
                r={R}
                fill="none"
                stroke={tone()}
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-dasharray={`${(pct() / 100) * C} ${C}`}
                transform="rotate(-90 8 8)"
              />
            </svg>
            {pct()}%
          </button>
        );
      }}
    </Show>
  );
}

// ── the command pane's trigger detection ─────────────────────────────────────

type Trigger =
  | { kind: "slash"; q: string; from: number }
  | { kind: "mention"; q: string; from: number };

/**
 * Which completable token the caret sits in, if any.
 *
 * `/` only counts as a command when it opens the message and hasn't been
 * followed by a space — once you've typed an argument the pane must get out of
 * the way. `@` counts anywhere a word can start (message start or after
 * whitespace), so you can mention a teammate mid-sentence.
 */
export function triggerAt(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);

  if (text.startsWith("/") && !/\s/.test(before)) {
    return { kind: "slash", q: before.slice(1).toLowerCase(), from: 0 };
  }

  const at = before.lastIndexOf("@");
  if (at !== -1) {
    const frag = before.slice(at + 1);
    const opensWord = at === 0 || /\s/.test(before[at - 1]!);
    if (opensWord && !/\s/.test(frag)) {
      return { kind: "mention", q: frag.toLowerCase(), from: at };
    }
  }
  return null;
}

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

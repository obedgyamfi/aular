import {
  createEffect,
  createResource,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import {
  ArrowUp,
  Maximize2,
  Minimize2,
  Paperclip,
  Slash,
  Square,
  X,
} from "lucide-solid";

import { api } from "~/lib/api";
import { SLASH_COMMANDS, type SlashCommand } from "~/lib/slash-commands";
import {
  actions,
  activeAgent,
  activeConversationId,
  activeWorking,
  state,
} from "~/lib/store";
import type { ConversationContext } from "~/lib/types";

/**
 * The composer — one deck, not a textarea with controls scattered around it.
 *
 * Everything about the turn you're composing lives inside a single bordered
 * surface: what you're replying to and what you've attached ride at the top,
 * the editor in the middle, and the action bar sits INSIDE the bottom edge —
 * attach, the slash hint, the model you're spending, how full the context is,
 * and the send button (which becomes Stop while the agent thinks). Nothing
 * floats; the deck is the object.
 */
export function Composer() {
  const [text, setText] = createSignal("");
  const [ctx, setCtx] = createSignal<ConversationContext | null>(null);
  const [refresh, setRefresh] = createSignal(0);
  const [expanded, setExpanded] = createSignal(false);

  let area: HTMLTextAreaElement | undefined;
  let fileInput: HTMLInputElement | undefined;

  const enabled = () => !!activeAgent();

  // ── the slash palette ─────────────────────────────────────────────────────
  const [dismissed, setDismissed] = createSignal(false);
  const [selected, setSelected] = createSignal(0);

  const query = () => {
    const t = text();
    return t.startsWith("/") && !/\s/.test(t) ? t.slice(1).toLowerCase() : null;
  };
  const matches = (): SlashCommand[] => {
    const q = query();
    if (q === null || dismissed()) return [];
    return SLASH_COMMANDS.filter((c) => c.cmd.slice(1).startsWith(q));
  };
  createEffect(() => {
    if (!text().startsWith("/")) setDismissed(false);
    query();
    setSelected(0);
  });

  const runCommand = (c: SlashCommand) => {
    if (c.needsArgs) {
      setText(c.cmd + " ");
      area?.focus();
      return;
    }
    setText("");
    void actions.send(c.cmd);
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
    el.style.height = `${Math.min(el.scrollHeight, expanded() ? 420 : 200)}px`;
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
    const list = matches();
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
      if (e.key === "Tab") {
        e.preventDefault();
        setText(list[selected()]!.cmd + " ");
        area?.focus();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        runCommand(list[selected()]!);
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
    <div class="shrink-0 px-4 pb-4">
      <div class="relative mx-auto w-full max-w-[820px]">
        {/* The slash palette floats over the deck. */}
        <Show when={matches().length}>
          <div class="aular-pop absolute bottom-full left-0 z-30 mb-2 max-h-[280px] w-full max-w-[460px] overflow-y-auto rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-02 py-1 shadow-xl">
            <For each={matches()}>
              {(c, i) => (
                <button
                  type="button"
                  onMouseEnter={() => setSelected(i())}
                  onClick={() => runCommand(c)}
                  class="flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors"
                  classList={{
                    "bg-v2-overlay-simple-overlay-pressed": i() === selected(),
                  }}
                >
                  <span class="shrink-0 font-mono text-[12px] font-medium text-v2-text-text-accent">
                    {c.cmd}
                  </span>
                  <Show when={c.args}>
                    <span class="shrink-0 font-mono text-[10.5px] text-v2-text-text-faint">
                      {c.args}
                    </span>
                  </Show>
                  <span class="min-w-0 truncate text-[11px] text-v2-text-text-muted">
                    {c.desc}
                  </span>
                </button>
              )}
            </For>
            <div class="mt-1 border-t border-v2-border-border-muted px-3 pb-0.5 pt-1.5 text-[10px] text-v2-text-text-faint">
              ↑↓ navigate · Tab complete · Enter run · gateway commands cost 0 tokens
            </div>
          </div>
        </Show>

        {/* ── the deck ───────────────────────────────────────────────────── */}
        <div
          class="flex flex-col rounded-xl border border-v2-border-border-base bg-v2-background-bg-layer-01 transition-colors focus-within:border-v2-border-border-focus"
          classList={{ "shadow-lg": expanded() }}
        >
          {/* What this turn carries, before you've written it. */}
          <Show when={hasDeckHeader()}>
            <div class="flex flex-wrap items-center gap-1.5 rounded-t-xl border-b border-v2-border-border-muted px-3 py-2">
              <Show when={state.replyTo}>
                {(m) => (
                  <span class="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border-l-2 border-v2-border-border-focus bg-v2-background-bg-layer-02 py-1 pl-2 pr-1">
                    <span class="flex min-w-0 flex-col">
                      <span class="text-[10px] font-medium text-v2-text-text-accent">
                        Replying to{" "}
                        {m().sender_type === "user" ? "yourself" : activeAgent()?.name}
                      </span>
                      <span class="max-w-[420px] truncate text-[11px] text-v2-text-text-muted">
                        {m().content.replace(/\s+/g, " ").trim() || "attachment"}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label="Cancel reply"
                      onClick={() => actions.setReplyTo(null)}
                      class="flex size-5 shrink-0 items-center justify-center rounded text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
              </Show>

              <Show when={state.attachment}>
                {(a) => (
                  <span class="flex items-center gap-1.5 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 py-1 pl-2 pr-1">
                    <Paperclip size={12} class="text-v2-icon-icon-muted" />
                    <span class="max-w-[240px] truncate text-[11.5px] text-v2-text-text-base">
                      {a().name ?? "attachment"}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={() => actions.clearAttachment()}
                      class="flex size-5 items-center justify-center rounded text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
              </Show>
            </div>
          </Show>

          {/* The editor. */}
          <textarea
            ref={area}
            rows={expanded() ? 8 : 2}
            value={text()}
            disabled={!enabled()}
            onInput={(e) => {
              setText(e.currentTarget.value);
              grow(e.currentTarget);
            }}
            onKeyDown={onKeyDown}
            placeholder={
              enabled()
                ? `Message ${activeAgent()?.name ?? ""} — / for commands`
                : "Select an agent first"
            }
            class="w-full resize-none bg-transparent px-3.5 pb-1.5 pt-3 text-[13.5px] leading-relaxed text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint disabled:opacity-60"
            classList={{ "max-h-[420px]": expanded(), "max-h-[200px]": !expanded() }}
          />

          {/* The action bar — inside the deck, under the words. */}
          <div class="flex items-center gap-1 px-2 pb-2 pt-0.5">
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
            <DeckButton
              label="Attach a file"
              disabled={!enabled()}
              onClick={() => fileInput?.click()}
            >
              <Paperclip size={15} />
            </DeckButton>
            <DeckButton
              label="Slash commands — free, they never reach the model"
              disabled={!enabled()}
              onClick={() => {
                setText("/");
                setDismissed(false);
                area?.focus();
              }}
            >
              <Slash size={15} />
            </DeckButton>

            <ModelPill />
            <ContextMeter ctx={ctx()} draft={text()} />

            <div class="flex-1" />

            <DeckButton
              label={expanded() ? "Shrink the editor" : "Expand the editor"}
              onClick={() => {
                setExpanded((e) => !e);
                queueMicrotask(() => area && grow(area));
              }}
            >
              {expanded() ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </DeckButton>

            {/* Send — and while a turn is in flight, Stop. Same seat, so the
                one control you reach for never moves. */}
            <Show
              when={!activeWorking()}
              fallback={
                <button
                  type="button"
                  onClick={() => void actions.send("/stop")}
                  aria-label="Stop the agent"
                  title="Stop (/stop)"
                  class="ml-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-v2-state-bg-danger text-v2-state-fg-danger transition-opacity hover:opacity-90"
                >
                  <Square size={13} fill="currentColor" />
                </button>
              }
            >
              <button
                type="button"
                onClick={submit}
                disabled={(!text().trim() && !state.attachment) || !enabled()}
                aria-label="Send"
                title="Send — Enter"
                class="ml-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-v2-background-bg-accent text-v2-text-text-inverse transition-opacity hover:opacity-90 disabled:bg-v2-background-bg-layer-03 disabled:text-v2-text-text-faint"
              >
                <ArrowUp size={16} stroke-width={2.4} />
              </button>
            </Show>
          </div>
        </div>

        <p class="pt-1 text-center text-[10px] text-v2-text-text-faint">
          Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </div>
  );
}

/** A small square control inside the deck's action bar. */
function DeckButton(props: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: any;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      class="flex size-8 shrink-0 items-center justify-center rounded-lg text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}

/**
 * The model you're spending — a pill that switches it, not a label that
 * sends you to Settings. Codex subscriptions list their own models; anything
 * else opens Settings, where the key lives.
 */
function ModelPill() {
  const [open, setOpen] = createSignal(false);
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

  return (
    <Show when={m()}>
      {(model) => (
        <div ref={root} class="relative">
          <button
            type="button"
            onClick={() =>
              isCodex() ? setOpen((o) => !o) : actions.openSettings("model")
            }
            aria-expanded={open()}
            title={
              isCodex()
                ? "Switch model"
                : `${model().provider} · open model settings`
            }
            class="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11.5px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              classList={{
                "bg-v2-state-fg-success": model().key_set || isCodex(),
                "bg-v2-state-fg-warning": !model().key_set && !isCodex(),
              }}
            />
            <span class="max-w-[140px] truncate font-mono">
              {model().model || model().provider || "no model"}
            </span>
          </button>

          <Show when={open()}>
            <div class="aular-pop absolute bottom-full left-0 z-40 mb-1.5 max-h-[260px] w-[210px] overflow-y-auto rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-02 py-1 shadow-xl">
              <div class="px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-v2-text-text-faint">
                ChatGPT models
              </div>
              <For
                each={models() ?? []}
                fallback={
                  <p class="px-3 py-2 text-[11.5px] text-v2-text-text-faint">
                    Loading…
                  </p>
                }
              >
                {(id) => (
                  <button
                    type="button"
                    onClick={() => void pick(id)}
                    class="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11.5px] transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                    classList={{
                      "bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base":
                        model().model === id,
                      "text-v2-text-text-muted": model().model !== id,
                    }}
                  >
                    {id}
                  </button>
                )}
              </For>
              <div class="mt-1 border-t border-v2-border-border-muted pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    actions.openSettings("model");
                  }}
                  class="w-full px-3 py-1.5 text-left text-[11.5px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                >
                  Model settings…
                </button>
              </div>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}

/**
 * How full the model's context is — a ring, not a bar, because it sits in a
 * row of square controls. The figure is an estimate (chars ÷ 4 plus prompt
 * overhead); `/status` gives the exact number, and the tooltip says so.
 */
function ContextMeter(props: { ctx: ConversationContext | null; draft: string }) {
  return (
    <Show when={props.ctx}>
      {(c) => {
        const used = () => c().est_context_tokens;
        const pct = () =>
          Math.min(100, Math.round((used() * 100) / Math.max(1, c().context_length)));
        const draftTokens = () => Math.ceil(props.draft.trim().length / 4);
        const tone = () =>
          pct() > 85
            ? "var(--v2-state-fg-danger)"
            : pct() > 60
              ? "var(--v2-state-fg-warning)"
              : "var(--v2-icon-icon-accent)";

        const R = 6.5;
        const C = 2 * Math.PI * R;

        return (
          <span
            class="flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-[11px] text-v2-text-text-faint"
            title={`≈${used().toLocaleString()} of ${c().context_length.toLocaleString()} context tokens${
              draftTokens() ? ` · ~${draftTokens()} in this draft` : ""
            } (estimate — /status for exact)`}
          >
            <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
              <circle
                cx="8.5"
                cy="8.5"
                r={R}
                fill="none"
                stroke="var(--v2-background-bg-layer-03)"
                stroke-width="2.5"
              />
              <circle
                cx="8.5"
                cy="8.5"
                r={R}
                fill="none"
                stroke={tone()}
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-dasharray={`${(pct() / 100) * C} ${C}`}
                transform="rotate(-90 8.5 8.5)"
              />
            </svg>
            <span class="tabular-nums">{fmtTokens(used())}</span>
          </span>
        );
      }}
    </Show>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return String(n);
}

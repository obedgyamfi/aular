import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

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
 * The agentic input bar.
 *
 * Everything a desktop agent client is expected to have, and nothing it isn't:
 * a slash-command palette (the gateway's commands, which cost zero tokens), a
 * live context-window meter with a draft estimate, the model you're spending on,
 * attachments, and a reply bar. Ported from the prototype's AgentInputBar +
 * Composer, which were built against the real Hermes command registry.
 */
export function Composer() {
  const [text, setText] = createSignal("");
  const [ctx, setCtx] = createSignal<ConversationContext | null>(null);
  const [refresh, setRefresh] = createSignal(0);

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

  return (
    <div class="shrink-0 px-4 pb-4">
      <div class="relative mx-auto w-full max-w-[820px]">
        {/* The brake. While a turn is in flight the user must always have a
            way to pull the agent's hand back — /stop is the gateway's own
            zero-token interrupt, this is just a button on it. */}
        <Show when={activeWorking()}>
          <button
            type="button"
            onClick={() => void actions.send("/stop")}
            title="Interrupt the running work (/stop)"
            class="absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 py-1 text-[11px] font-medium text-v2-text-text-base shadow-lg transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          >
            <span class="size-[8px] rounded-[2px] bg-v2-state-fg-danger" />
            Stop
          </button>
        </Show>

        {/* Replying to */}
        <Show when={state.replyTo}>
          {(m) => (
            <div class="mb-1.5 flex items-center gap-2 rounded-md border-l-2 border-v2-border-border-focus bg-v2-background-bg-layer-01 px-3 py-1.5">
              <div class="min-w-0 flex-1">
                <div class="text-[11px] font-medium text-v2-text-text-accent">
                  Reply to {m().sender_type === "user" ? "yourself" : activeAgent()?.name}
                </div>
                <div class="truncate text-[11px] text-v2-text-text-muted">
                  {m().content.replace(/\s+/g, " ").trim() || "attachment"}
                </div>
              </div>
              <IconBtn label="Cancel reply" onClick={() => actions.setReplyTo(null)}>
                <Icon name="close-small" size="small" />
              </IconBtn>
            </div>
          )}
        </Show>

        {/* Staged attachment */}
        <Show when={state.attachment}>
          {(a) => (
            <div class="mb-1.5 flex items-center gap-2 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-1.5">
              <Icon name="photo" size="small" />
              <span class="min-w-0 flex-1 truncate text-[11.5px] text-v2-text-text-base">
                {a().name ?? "attachment"}
              </span>
              <IconBtn label="Remove attachment" onClick={() => actions.clearAttachment()}>
                <Icon name="close-small" size="small" />
              </IconBtn>
            </div>
          )}
        </Show>

        {/* The slash palette */}
        <Show when={matches().length}>
          <div class="absolute bottom-full left-0 z-30 mb-2 max-h-[280px] w-full max-w-[460px] overflow-y-auto rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-02 py-1 shadow-xl">
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

        {/* The input */}
        <div class="flex items-end gap-2 rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 py-2 focus-within:border-v2-border-border-focus">
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
          <IconBtn
            label="Attach a file"
            disabled={!enabled()}
            onClick={() => fileInput?.click()}
          >
            <Icon name="plus" size="small" />
          </IconBtn>

          <textarea
            ref={area}
            rows={1}
            value={text()}
            disabled={!enabled()}
            onInput={(e) => {
              setText(e.currentTarget.value);
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 180)}px`;
            }}
            onKeyDown={onKeyDown}
            placeholder={enabled() ? "Type / for commands" : "Select an agent first"}
            class="max-h-44 flex-1 resize-none bg-transparent py-1 font-mono text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint disabled:opacity-60"
          />

          <button
            type="button"
            onClick={submit}
            disabled={(!text().trim() && !state.attachment) || !enabled()}
            aria-label="Send"
            class="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded text-v2-icon-icon-accent transition-opacity disabled:text-v2-icon-icon-muted disabled:opacity-50"
          >
            <Icon name="arrow-up" size="small" />
          </button>
        </div>

        {/* Status row: what you're spending, and what's left. */}
        <div class="flex items-center justify-between gap-3 px-1 pt-1.5">
          <ContextMeter ctx={ctx()} draft={text()} />
          <ModelBadge />
        </div>
      </div>
    </div>
  );
}

/**
 * How full the model's context is, and what the draft will cost.
 *
 * The figure is an estimate (conversation chars ÷ 4, plus prompt overhead) —
 * `/status` gives the exact number. It is labelled as an estimate rather than
 * dressed up as truth.
 */
function ContextMeter(props: { ctx: ConversationContext | null; draft: string }) {
  return (
    <Show when={props.ctx}>
      {(c) => {
        const used = () => c().est_context_tokens;
        const pct = () =>
          Math.min(100, Math.round((used() * 100) / Math.max(1, c().context_length)));
        const draftTokens = () => Math.ceil(props.draft.trim().length / 4);

        return (
          <span
            class="flex min-w-0 items-center gap-1.5 text-[10.5px] text-v2-text-text-faint"
            title={`≈${used().toLocaleString()} of ${c().context_length.toLocaleString()} context tokens (estimate — /status for exact)`}
          >
            <span class="h-1 w-14 overflow-hidden rounded-full bg-v2-background-bg-layer-03">
              <span
                class="block h-full rounded-full"
                classList={{
                  "bg-v2-icon-icon-accent": pct() <= 60,
                  "bg-v2-state-fg-warning": pct() > 60 && pct() <= 85,
                  "bg-v2-state-fg-danger": pct() > 85,
                }}
                style={{ width: `${Math.max(3, pct())}%` }}
              />
            </span>
            <span class="whitespace-nowrap tabular-nums">
              {fmtTokens(used())} / {fmtTokens(c().context_length)}
            </span>
            <Show when={draftTokens() > 0}>
              <span class="whitespace-nowrap text-v2-text-text-muted">
                · ~{draftTokens()} tok draft
              </span>
            </Show>
          </span>
        );
      }}
    </Show>
  );
}

/** The model you are actually spending on. Click to go change it. */
function ModelBadge() {
  const model = () => state.model;

  return (
    <Show when={model()}>
      {(m) => (
        <button
          type="button"
          title={`${m().model} · ${m().provider}${m().key_set ? "" : " · no API key set"}`}
          onClick={() => actions.openSettings("model")}
          class="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[10.5px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
        >
          <span class="font-mono">{m().model || m().provider}</span>
          <span
            class="size-1.5 rounded-full"
            classList={{
              "bg-v2-icon-icon-accent": m().key_set,
              "bg-v2-text-text-danger": !m().key_set,
            }}
          />
        </button>
      )}
    </Show>
  );
}

function IconBtn(props: {
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
      class="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return String(n);
}

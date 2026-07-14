import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { api } from "~/lib/api";
import { openExternal } from "~/lib/external";
import { actions, state } from "~/lib/store";

/**
 * Connect a model — the way Hermes' own CLI does it: pick who you sign in
 * with, then sign in. No form.
 *
 * A ChatGPT/Codex subscription runs the real OpenAI device-code flow (the same
 * function `hermes model` calls): we open auth.openai.com for you, show the
 * code, and poll until you're through. Key-based providers still exist for the
 * people who have keys, but they're a step behind the sign-in — because a
 * normal person has a subscription, not a `base_url`.
 */
type Choice = "codex" | "key" | null;

interface KeyPreset {
  id: string;
  label: string;
  hint: string;
  provider: string;
  base_url: string;
  api_mode: string;
  model: string;
  needsKey: boolean;
}

const KEY_PRESETS: KeyPreset[] = [
  {
    id: "openai",
    label: "OpenAI API key",
    hint: "platform.openai.com — pay per token",
    provider: "openai",
    base_url: "https://api.openai.com/v1",
    api_mode: "chat_completions",
    model: "gpt-4o-mini",
    needsKey: true,
  },
  {
    id: "anthropic",
    label: "Anthropic API key",
    hint: "console.anthropic.com — Claude models",
    provider: "anthropic",
    base_url: "https://api.anthropic.com",
    api_mode: "anthropic",
    model: "claude-sonnet-4",
    needsKey: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "one key, every model",
    provider: "openrouter",
    base_url: "https://openrouter.ai/api/v1",
    api_mode: "chat_completions",
    model: "deepseek/deepseek-chat",
    needsKey: true,
  },
  {
    id: "ollama",
    label: "Local (Ollama)",
    hint: "runs on this machine — no key, no cost",
    provider: "ollama",
    base_url: "http://localhost:11434/v1",
    api_mode: "chat_completions",
    model: "qwen3:8b",
    needsKey: false,
  },
];

export function ModelSettings() {
  const [choice, setChoice] = createSignal<Choice>(null);
  const connected = () => !!state.model?.key_set || state.model?.provider === "openai-codex";

  return (
    <div class="flex flex-col gap-4">
      <p class="text-[11.5px] leading-relaxed text-v2-text-text-muted">
        Your agents think on your account — pick how you sign in. Nothing leaves
        this machine but the model calls themselves.
      </p>

      <Show when={state.model}>
        {(m) => (
          <div class="flex items-center gap-2 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-2">
            <span
              class="size-2 shrink-0 rounded-full"
              classList={{
                "bg-v2-state-fg-success": connected(),
                "bg-v2-state-fg-warning": !connected(),
              }}
            />
            <span class="min-w-0 flex-1 text-[11.5px] text-v2-text-text-base">
              <Show
                when={connected()}
                fallback={<>Not connected — pick a provider below.</>}
              >
                Connected to{" "}
                <span class="font-mono">{m().provider || "provider"}</span>
                <Show when={m().model}>
                  {" "}
                  · <span class="font-mono">{m().model}</span>
                </Show>
              </Show>
            </span>
          </div>
        )}
      </Show>

      {/* The sign-in path, first — it's what most people have. */}
      <button
        type="button"
        onClick={() => setChoice(choice() === "codex" ? null : "codex")}
        aria-expanded={choice() === "codex"}
        class="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
        classList={{
          "border-v2-border-border-focus bg-v2-background-bg-layer-01": choice() === "codex",
          "border-v2-border-border-muted bg-v2-background-bg-layer-01 hover:bg-v2-overlay-simple-overlay-hover":
            choice() !== "codex",
        }}
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-v2-background-bg-layer-02 text-v2-icon-icon-accent">
          <Icon name="status" size="small" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-[12.5px] font-medium text-v2-text-text-base">
            Sign in with ChatGPT
          </span>
          <span class="block text-[11px] text-v2-text-text-muted">
            Use your ChatGPT Plus/Pro subscription (Codex) — no API key, no
            per-token bill
          </span>
        </span>
        <Icon name="chevron-right" size="small" />
      </button>

      <Show when={choice() === "codex"}>
        <CodexConnect />
      </Show>

      <button
        type="button"
        onClick={() => setChoice(choice() === "key" ? null : "key")}
        aria-expanded={choice() === "key"}
        class="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
        classList={{
          "border-v2-border-border-focus bg-v2-background-bg-layer-01": choice() === "key",
          "border-v2-border-border-muted bg-v2-background-bg-layer-01 hover:bg-v2-overlay-simple-overlay-hover":
            choice() !== "key",
        }}
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-v2-background-bg-layer-02 text-v2-icon-icon-muted">
          <Icon name="settings-gear" size="small" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-[12.5px] font-medium text-v2-text-text-base">
            Use an API key
          </span>
          <span class="block text-[11px] text-v2-text-text-muted">
            OpenAI, Anthropic, OpenRouter — or a local model with no key at all
          </span>
        </span>
        <Icon name="chevron-right" size="small" />
      </button>

      <Show when={choice() === "key"}>
        <KeyConnect />
      </Show>
    </div>
  );
}

// ── ChatGPT / Codex: Hermes' real device-code flow ───────────────────────────

function CodexConnect() {
  const [status, setStatus] = createSignal<{
    stage: string;
    verify_url?: string;
    user_code?: string;
    error?: string;
  }>({ stage: "idle" });
  const [busy, setBusy] = createSignal(false);
  const [models, setModels] = createSignal<string[]>([]);
  const [copied, setCopied] = createSignal(false);
  let poll: ReturnType<typeof setInterval> | undefined;
  onCleanup(() => clearInterval(poll));

  const start = async () => {
    setBusy(true);
    try {
      const s = await api.codexConnectStart();
      setStatus(s);
      if (s.verify_url) void openExternal(s.verify_url);
      clearInterval(poll);
      poll = setInterval(async () => {
        const next = await api.codexConnectStatus().catch(() => null);
        if (!next) return;
        setStatus(next);
        if (next.verify_url && !status().verify_url) void openExternal(next.verify_url);
        if (next.stage === "done" || next.stage === "error") {
          clearInterval(poll);
          if (next.stage === "done") {
            await actions.refreshModel();
            setModels((await api.codexModels().catch(() => [])) ?? []);
          }
        }
      }, 2000);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const code = status().user_code;
    if (!code) return;
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const pickModel = async (model: string) => {
    await actions.updateModel({ provider: "openai-codex", model });
  };

  return (
    <div class="flex flex-col gap-3 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
      <Show
        when={status().stage !== "idle"}
        fallback={
          <>
            <p class="text-[11.5px] leading-relaxed text-v2-text-text-muted">
              We'll open OpenAI's sign-in page and give you a code to enter.
              This is the same login the Codex CLI uses — your subscription,
              your account, nothing stored but the token on this machine.
            </p>
            <button
              type="button"
              disabled={busy()}
              onClick={() => void start()}
              class="w-fit rounded-md bg-v2-background-bg-accent px-3.5 py-2 text-[12px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
            >
              {busy() ? "Starting…" : "Sign in with ChatGPT"}
            </button>
          </>
        }
      >
        <Show when={status().stage === "code" || status().stage === "starting"}>
          <div class="flex flex-col gap-2">
            <p class="text-[11.5px] text-v2-text-text-muted">
              <Show when={status().stage === "starting"} fallback={<>Enter this code on the OpenAI page we just opened:</>}>
                Contacting OpenAI…
              </Show>
            </p>
            <Show when={status().user_code}>
              <div class="flex items-center gap-2">
                <code class="rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 py-2 font-mono text-[16px] tracking-[0.15em] text-v2-text-text-base">
                  {status().user_code}
                </code>
                <button
                  type="button"
                  onClick={() => void copy()}
                  class="rounded-md border border-v2-border-border-base px-2.5 py-2 text-[11.5px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                >
                  {copied() ? "Copied" : "Copy"}
                </button>
                <Show when={status().verify_url}>
                  <button
                    type="button"
                    onClick={() => void openExternal(status().verify_url!)}
                    class="rounded-md border border-v2-border-border-base px-2.5 py-2 text-[11.5px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                  >
                    Reopen page
                  </button>
                </Show>
              </div>
            </Show>
            <span class="aular-shimmer text-[11px] font-medium">
              Waiting for you to finish signing in…
            </span>
          </div>
        </Show>

        <Show when={status().stage === "done"}>
          <p class="text-[12px] font-medium text-v2-state-fg-success">
            Signed in. Your agents run on your ChatGPT subscription.
          </p>
          <Show when={models().length}>
            <p class="pt-1 text-[11px] text-v2-text-text-muted">
              Pick the model they think with:
            </p>
            <div class="flex flex-wrap gap-1.5">
              <For each={models()}>
                {(m) => (
                  <button
                    type="button"
                    onClick={() => void pickModel(m)}
                    class="rounded-md border px-2.5 py-1.5 font-mono text-[11.5px] transition-colors"
                    classList={{
                      "border-v2-border-border-focus bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base":
                        state.model?.model === m,
                      "border-v2-border-border-muted text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover":
                        state.model?.model !== m,
                    }}
                  >
                    {m}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={status().stage === "error"}>
          <p class="text-[11.5px] text-v2-state-fg-danger">
            {status().error || "Sign-in did not complete."}
          </p>
          <button
            type="button"
            onClick={() => void start()}
            class="w-fit rounded-md border border-v2-border-border-base px-3 py-1.5 text-[12px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          >
            Try again
          </button>
        </Show>
      </Show>
    </div>
  );
}

// ── API keys: still here, for people who have them ───────────────────────────

function KeyConnect() {
  const [preset, setPreset] = createSignal<KeyPreset>(KEY_PRESETS[0]!);
  const [apiKey, setApiKey] = createSignal("");
  const [model, setModel] = createSignal(KEY_PRESETS[0]!.model);
  const [busy, setBusy] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [error, setError] = createSignal("");

  createEffect(() => setModel(preset().model));

  const save = async () => {
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      await actions.updateModel({
        provider: preset().provider,
        model: model().trim(),
        base_url: preset().base_url,
        api_mode: preset().api_mode,
        ...(apiKey().trim() ? { api_key: apiKey().trim() } : {}),
      });
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="flex flex-col gap-3 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
      <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <For each={KEY_PRESETS}>
          {(p) => (
            <button
              type="button"
              onClick={() => setPreset(p)}
              class="flex flex-col rounded-md border px-3 py-2 text-left transition-colors"
              classList={{
                "border-v2-border-border-focus bg-v2-overlay-simple-overlay-pressed":
                  preset().id === p.id,
                "border-v2-border-border-muted hover:bg-v2-overlay-simple-overlay-hover":
                  preset().id !== p.id,
              }}
            >
              <span class="text-[12px] font-medium text-v2-text-text-base">
                {p.label}
              </span>
              <span class="text-[10.5px] text-v2-text-text-faint">{p.hint}</span>
            </button>
          )}
        </For>
      </div>

      <label class="flex flex-col gap-1">
        <span class="text-[10.5px] font-medium text-v2-text-text-faint">Model</span>
        <input
          value={model()}
          onInput={(e) => setModel(e.currentTarget.value)}
          class={input}
        />
      </label>

      <Show when={preset().needsKey}>
        <label class="flex flex-col gap-1">
          <span class="text-[10.5px] font-medium text-v2-text-text-faint">
            API key {state.model?.key_set ? "(one is already set — leave blank to keep it)" : ""}
          </span>
          <input
            type="password"
            value={apiKey()}
            onInput={(e) => setApiKey(e.currentTarget.value)}
            placeholder="sk-…"
            class={input}
          />
        </label>
      </Show>

      <Show when={error()}>
        <p class="text-[11.5px] text-v2-state-fg-danger">{error()}</p>
      </Show>

      <div class="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy() || !model().trim()}
          class="w-fit rounded-md bg-v2-background-bg-accent px-3.5 py-2 text-[12px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
        >
          {busy() ? "Connecting…" : "Connect"}
        </button>
        <Show when={saved()}>
          <span class="text-[11.5px] text-v2-state-fg-success">
            Connected. New conversations use it immediately.
          </span>
        </Show>
      </div>
    </div>
  );
}

const input =
  "w-full rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2.5 py-1.5 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus";

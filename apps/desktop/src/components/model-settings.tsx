import { createEffect, createSignal, For, Show } from "solid-js";

import { actions, state } from "~/lib/store";

/**
 * Model and provider — ported from the prototype's ModelSettings.
 *
 * BYOK: you bring the key, the agents run on your account. Presets only prefill;
 * every field stays editable, because most providers are OpenAI-compatible and
 * the ones that aren't are one `api_mode` away.
 */
interface Preset {
  id: string;
  label: string;
  provider: string;
  base_url: string;
  api_mode: string;
  model: string;
}

const PRESETS: Preset[] = [
  {
    id: "openai",
    label: "OpenAI",
    provider: "openai",
    base_url: "https://api.openai.com/v1",
    api_mode: "chat_completions",
    model: "gpt-4o-mini",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    provider: "anthropic",
    base_url: "https://api.anthropic.com",
    api_mode: "anthropic",
    model: "claude-sonnet-4",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    provider: "openrouter",
    base_url: "https://openrouter.ai/api/v1",
    api_mode: "chat_completions",
    model: "deepseek/deepseek-chat",
  },
  {
    id: "ollama",
    label: "Local (Ollama)",
    provider: "ollama",
    base_url: "http://localhost:11434/v1",
    api_mode: "chat_completions",
    model: "qwen3:8b",
  },
  {
    id: "custom",
    label: "Custom",
    provider: "",
    base_url: "",
    api_mode: "chat_completions",
    model: "",
  },
];

export function ModelSettings() {
  const [provider, setProvider] = createSignal("");
  const [model, setModel] = createSignal("");
  const [baseURL, setBaseURL] = createSignal("");
  const [apiMode, setApiMode] = createSignal("chat_completions");
  const [apiKey, setApiKey] = createSignal("");
  const [advanced, setAdvanced] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [status, setStatus] = createSignal("");
  const [error, setError] = createSignal("");

  // The store already loaded the current config; mirror it into the form once
  // it lands, and again whenever a save replaces it.
  createEffect(() => {
    const cur = state.model;
    if (!cur) return;
    setProvider(cur.provider);
    setModel(cur.model);
    setBaseURL(cur.base_url);
    setApiMode(cur.api_mode || "chat_completions");
  });

  const applyPreset = (p: Preset) => {
    if (p.id === "custom") {
      setAdvanced(true);
      return;
    }
    setProvider(p.provider);
    setBaseURL(p.base_url);
    setApiMode(p.api_mode);
    // Don't stomp a model the user typed — only a default from another preset.
    if (!model() || PRESETS.some((x) => x.model === model())) setModel(p.model);
  };

  const save = async () => {
    if (saving()) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const res = await actions.saveModel({
        model: model().trim(),
        provider: provider().trim(),
        base_url: baseURL().trim(),
        api_mode: apiMode().trim(),
        ...(apiKey().trim() ? { api_key: apiKey().trim() } : {}),
      });
      setApiKey("");
      setStatus(
        res.reload_required
          ? "Saved. Restart the gateway to apply it."
          : "Saved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const canSave = () => !!model().trim() && !!provider().trim() && !saving();

  return (
    <div class="flex flex-col gap-3">
      <Show when={state.model}>
        {(cur) => (
          <p class="text-[12px] text-v2-text-text-muted">
            Now running{" "}
            <span class="font-medium text-v2-text-text-base">
              {cur().model || "—"}
            </span>
            {cur().provider ? ` · ${cur().provider}` : ""}
            {cur().key_env_var ? (cur().key_set ? " · key set" : " · no key") : ""}
          </p>
        )}
      </Show>

      <div class="flex flex-wrap gap-1.5">
        <For each={PRESETS}>
          {(p) => {
            const on = () => p.id !== "custom" && provider() === p.provider;
            return (
              <button
                type="button"
                onClick={() => applyPreset(p)}
                class="rounded-full border px-2.5 py-1 text-[11.5px] transition-colors"
                classList={{
                  "border-v2-border-border-focus bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base":
                    on(),
                  "border-v2-border-border-muted text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover":
                    !on(),
                }}
              >
                {p.label}
              </button>
            );
          }}
        </For>
      </div>

      <Field label="Model">
        <input
          value={model()}
          onInput={(e) => setModel(e.currentTarget.value)}
          placeholder="gpt-4o-mini"
          class={field}
        />
      </Field>

      <Field label="API key" hint="Stored in your gateway's environment, never in the UI.">
        <input
          type="password"
          value={apiKey()}
          onInput={(e) => setApiKey(e.currentTarget.value)}
          placeholder={
            state.model?.key_set
              ? "•••••••• set — leave blank to keep it"
              : "Paste your provider key"
          }
          class={field}
        />
      </Field>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        class="w-fit text-[11.5px] text-v2-text-text-accent hover:underline"
      >
        {advanced() ? "Hide advanced" : "Advanced — provider, base URL, API mode"}
      </button>

      <Show when={advanced()}>
        <div class="flex flex-col gap-3">
          <Field label="Provider">
            <input
              value={provider()}
              onInput={(e) => setProvider(e.currentTarget.value)}
              placeholder="openai"
              class={field}
            />
          </Field>
          <Field label="Base URL">
            <input
              value={baseURL()}
              onInput={(e) => setBaseURL(e.currentTarget.value)}
              placeholder="https://api.openai.com/v1"
              class={field}
            />
          </Field>
          <Field label="API mode" hint="chat_completions for most providers; anthropic for Claude.">
            <input
              value={apiMode()}
              onInput={(e) => setApiMode(e.currentTarget.value)}
              placeholder="chat_completions"
              class={field}
            />
          </Field>
        </div>
      </Show>

      <Show when={error()}>
        <p class="text-[11.5px] text-v2-state-fg-danger">{error()}</p>
      </Show>
      <Show when={status()}>
        <p class="text-[11.5px] text-v2-text-text-accent">{status()}</p>
      </Show>

      <button
        type="button"
        onClick={save}
        disabled={!canSave()}
        class="w-fit self-end rounded-md bg-v2-background-bg-accent px-3 py-1.5 text-[12px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
      >
        {saving() ? "Saving…" : "Save model"}
      </button>
    </div>
  );
}

const field =
  "w-full rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2.5 py-1.5 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-weak focus:border-v2-border-border-focus";

function Field(props: { label: string; hint?: string; children: any }) {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-[10.5px] font-medium uppercase tracking-[0.08em] text-v2-text-text-weak">
        {props.label}
      </span>
      {props.children}
      <Show when={props.hint}>
        <span class="text-[10.5px] text-v2-text-text-weak">{props.hint}</span>
      </Show>
    </label>
  );
}

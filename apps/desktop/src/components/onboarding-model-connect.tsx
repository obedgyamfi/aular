import { createMemo, createSignal, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

import { CodexConnect } from "~/components/model-settings";
import { ModelDropdown } from "~/components/model-dropdown";
import { MODEL_PROVIDERS } from "~/lib/model-providers";
import type { ModelProvider } from "~/lib/model-providers";
import { actions, harnessCapable, state } from "~/lib/store";

/**
 * Onboarding model-connect. Provider grid on the RIGHT (that's the picker), the
 * selected provider's setup on the LEFT — sign-in and/or an API-key form, with
 * the model chosen from a dropdown. One connected indicator, a gap between the
 * sides, top-aligned so switching providers never reflows, and frameless so the
 * star field reads through. Same connect logic as settings.
 */
export function OnboardingModelConnect() {
  const [selectedId, setSelectedId] = createSignal("openai");
  const selected = () => MODEL_PROVIDERS.find((p) => p.id === selectedId()) ?? MODEL_PROVIDERS[0]!;

  return (
    <div class="grid w-full grid-cols-[minmax(0,1fr)_480px] items-start gap-8">
      <div class="min-h-[356px] min-w-0">
        <Show when={selected()} keyed>
          {(p) => <ProviderSetup provider={p} />}
        </Show>
      </div>
      <ProviderGrid selectedId={selectedId()} onSelect={setSelectedId} />
    </div>
  );
}

function ProviderSetup(props: { provider: ModelProvider }) {
  const p = props.provider;
  const canCodex = p.methods.includes("codex") && harnessCapable("modelAuth");
  const connected = () => !!state.model?.key_set || state.model?.provider === "openai-codex";

  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-3">
        <ProviderLogo provider={p} tile={44} glyph={24} />
        <div class="min-w-0 flex-1">
          <div class="text-[17px] font-medium text-[var(--text)]">{p.name}</div>
          <div class="truncate text-[12px] text-[var(--muted)]">{p.hint}</div>
        </div>
        <Show when={connected()}>
          <div class="flex shrink-0 items-center gap-1.5 rounded-[var(--pill)] bg-[var(--green-soft)] px-2.5 py-1 text-[11px] text-[var(--green)]">
            <span class="size-1.5 rounded-full bg-[var(--green)]" />
            <span class="font-mono">{state.model?.provider}</span>
          </div>
        </Show>
      </div>

      <Show when={canCodex}>
        <div class="rounded-[var(--r2)] border border-[var(--line)] bg-white/[0.02] p-3.5">
          <div class="mb-1 text-[13px] font-medium text-[var(--text)]">Sign in with ChatGPT</div>
          <div class="mb-2.5 text-[11.5px] text-[var(--muted)]">Plus/Pro subscription — no API key, no per-token bill.</div>
          <CodexConnect hideConnected />
        </div>
      </Show>

      <Show when={p.signinSoon}>
        <div class="flex items-center gap-2 rounded-[var(--r2)] border border-dashed border-[var(--line)] px-3 py-2 text-[11.5px] text-[var(--faint)]">
          <span class="size-1.5 rounded-full bg-[var(--faint)]" />
          Sign-in for {p.name} is coming — use an API key for now.
        </div>
      </Show>

      <Show when={p.methods.includes("key") || p.methods.includes("local")}>
        <KeyForm provider={p} local={p.methods.includes("local") && !p.methods.includes("key")} />
      </Show>
    </div>
  );
}

function ProviderGrid(props: { selectedId: string; onSelect: (id: string) => void }) {
  const [search, setSearch] = createSignal("");
  const list = createMemo(() => {
    const q = search().trim().toLowerCase();
    if (!q) return MODEL_PROVIDERS;
    return MODEL_PROVIDERS.filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q));
  });

  return (
    <div class="flex flex-col gap-2.5">
      <div class="flex h-9 items-center gap-2 rounded-[var(--r2)] border border-[var(--line)] bg-white/[0.03] px-2.5">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--faint)" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" /></svg>
        <input
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          placeholder="Search providers"
          class="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
        />
      </div>

      <div class="aular-hover-scrollbar grid max-h-[544px] grid-cols-3 content-start gap-2 overflow-y-auto pr-1">
        <For each={list()}>
          {(p) => (
            <ProviderTile provider={p} selected={props.selectedId === p.id} onSelect={() => props.onSelect(p.id)} />
          )}
        </For>
        <Show when={list().length === 0}>
          <p class="col-span-3 py-3 text-center text-[11.5px] text-[var(--faint)]">No match.</p>
        </Show>
      </div>
    </div>
  );
}

function ProviderTile(props: { provider: ModelProvider; selected: boolean; onSelect: () => void }) {
  const p = props.provider;
  return (
    <button
      type="button"
      onClick={props.onSelect}
      title={p.name}
      class="flex items-center gap-2 rounded-[var(--r2)] border px-2.5 py-2 text-left transition-colors"
      classList={{
        "border-[var(--accent)] bg-white/[0.06]": props.selected,
        "border-[var(--line)] bg-white/[0.02] hover:border-[var(--line-strong)] hover:bg-white/[0.04]": !props.selected,
      }}
    >
      <span class="grid size-[18px] shrink-0 place-items-center">
        <Show
          when={p.logo}
          fallback={
            <span class="grid size-[18px] place-items-center rounded-full bg-white/[0.06] text-[10px] font-medium text-[var(--text-2)]">
              {p.name.slice(0, 1)}
            </span>
          }
        >
          <Dynamic component={p.logo} size={18} />
        </Show>
      </span>
      <span class="min-w-0 flex-1 truncate text-[11.5px] font-medium text-[var(--text)]">{p.name}</span>
    </button>
  );
}

function ProviderLogo(props: { provider: ModelProvider; tile?: number; glyph?: number }) {
  const p = props.provider;
  const t = props.tile ?? 36;
  const g = props.glyph ?? 19;
  return (
    <span
      class="grid shrink-0 place-items-center rounded-[var(--r2)] bg-white/[0.06] text-[var(--text-2)]"
      style={{ width: `${t}px`, height: `${t}px` }}
    >
      <Show
        when={p.logo}
        fallback={
          <span class="font-medium text-[var(--text-2)]" style={{ "font-size": `${Math.round(g * 0.72)}px` }}>
            {p.name.slice(0, 1)}
          </span>
        }
      >
        <Dynamic component={p.logo} size={g} />
      </Show>
    </span>
  );
}

function KeyForm(props: { provider: ModelProvider; local?: boolean }) {
  const p = props.provider;
  const isCustom = p.id === "custom";
  const [model, setModel] = createSignal(p.model);
  const [apiKey, setApiKey] = createSignal("");
  const [baseUrl, setBaseUrl] = createSignal(p.base_url);
  const [busy, setBusy] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [error, setError] = createSignal("");

  const save = async () => {
    if (busy() || !model().trim()) return;
    setBusy(true);
    setError("");
    try {
      await actions.updateModel({
        provider: p.id,
        model: model().trim(),
        base_url: isCustom ? baseUrl().trim() : p.base_url,
        api_mode: p.api_mode,
        ...(apiKey().trim() ? { api_key: apiKey().trim() } : {}),
      });
      setApiKey("");
      void actions.restartAgentRuntime();
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="flex flex-col gap-2.5 rounded-[var(--r2)] border border-[var(--line)] bg-white/[0.02] p-3.5">
      <div class="text-[13px] font-medium text-[var(--text)]">
        {props.local ? "Connect the local model" : "Use an API key"}
      </div>

      <Show when={isCustom}>
        <label class="flex flex-col gap-1">
          <span class="text-[10.5px] font-medium text-[var(--faint)]">Endpoint</span>
          <input value={baseUrl()} onInput={(e) => setBaseUrl(e.currentTarget.value)} placeholder="https://your-endpoint/v1" class={field} />
        </label>
      </Show>

      <label class="flex flex-col gap-1">
        <span class="text-[10.5px] font-medium text-[var(--faint)]">Model</span>
        <ModelDropdown value={model()} onChange={setModel} />
      </label>

      <Show when={!props.local}>
        <label class="flex flex-col gap-1">
          <span class="text-[10.5px] font-medium text-[var(--faint)]">
            API key{state.model?.key_set ? " (one is set — leave blank to keep it)" : ""}
          </span>
          <input type="password" value={apiKey()} onInput={(e) => setApiKey(e.currentTarget.value)} placeholder="sk-…" class={field} />
        </label>
      </Show>

      <Show when={error()}>
        <p class="text-[11.5px] text-[var(--red)]">{error()}</p>
      </Show>

      <div class="flex items-center gap-2.5 pt-0.5">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy() || !model().trim()}
          class="rounded-[var(--r2)] bg-[var(--accent)] px-4 py-2 text-[12px] font-medium text-[var(--on-accent)] transition-all hover:brightness-110 disabled:opacity-50"
        >
          {busy() ? "Connecting…" : "Connect"}
        </button>
        <Show when={saved()}>
          <span class="text-[11.5px] text-[var(--green)]">Connected. New conversations use it.</span>
        </Show>
      </div>
    </div>
  );
}

const field =
  "h-9 w-full rounded-[var(--r2)] border border-[var(--line)] bg-white/[0.04] px-2.5 text-[12px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--accent)]";

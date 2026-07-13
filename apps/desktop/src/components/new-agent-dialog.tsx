import { createResource, createSignal, For, Show } from "solid-js";

import { actions } from "~/lib/store";
import { api } from "~/lib/api";

/**
 * Hire an agent.
 *
 * Templates come from the backend's role catalog — the seed of the flagship
 * engineering org. Picking one fills in the persona and the tools; you can
 * still name it whatever you like.
 */
export function NewAgentDialog(props: { onClose: () => void }) {
  const [templates] = createResource(() => api.listTemplates().catch(() => []));
  const [name, setName] = createSignal("");
  const [picked, setPicked] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const create = async () => {
    const tpl = templates()?.find((t: any) => t.role === picked());
    if (!name().trim() || !tpl || busy()) return;
    setBusy(true);
    setError("");
    try {
      const agent = await actions.createAgent({
        name: name().trim(),
        role: tpl.role,
        persona: tpl.persona,
        instructions: tpl.instructions,
        tone: tpl.tone,
        default_tools: tpl.default_tools,
      });
      props.onClose();
      void actions.openAgent(agent.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-v2-overlay-simple-overlay-scrim p-6"
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        class="flex w-full max-w-[420px] flex-col gap-4 rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 p-5"
      >
        <div class="flex flex-col gap-1">
          <h2 class="text-[14px] font-medium text-v2-text-text-base">Hire an agent</h2>
          <p class="text-[12px] text-v2-text-text-muted">
            Pick a role. It arrives with a persona, operating rules, and its tools.
          </p>
        </div>

        <input
          autofocus
          placeholder="Name (e.g. Forge)"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          class="w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 py-2 text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-weak focus:border-v2-border-border-focus"
        />

        <div class="flex max-h-[240px] flex-col gap-1 overflow-y-auto">
          <For each={templates() ?? []}>
            {(t: any) => (
              <button
                type="button"
                onClick={() => setPicked(t.role)}
                aria-current={picked() === t.role}
                class="flex flex-col gap-0.5 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-v2-overlay-simple-overlay-hover aria-[current=true]:border-v2-border-border-focus aria-[current=true]:bg-v2-overlay-simple-overlay-pressed"
              >
                <span class="text-[12.5px] text-v2-text-text-base">{t.name ?? t.role}</span>
                <span class="line-clamp-2 text-[11px] leading-relaxed text-v2-text-text-muted">
                  {t.persona}
                </span>
              </button>
            )}
          </For>
        </div>

        <Show when={error()}>
          <p class="text-[12px] text-v2-text-text-danger">{error()}</p>
        </Show>

        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            class="rounded-md px-3 py-1.5 text-[12.5px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={create}
            disabled={!name().trim() || !picked() || busy()}
            class="rounded-md bg-v2-background-bg-accent px-3 py-1.5 text-[12.5px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
          >
            {busy() ? "Hiring…" : "Hire"}
          </button>
        </div>
      </div>
    </div>
  );
}

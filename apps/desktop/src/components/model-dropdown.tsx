import { createSignal, For, Show } from "solid-js";

/**
 * A model picker as a dropdown button. Lists `models` when we have them (e.g.
 * OpenAI/Codex returns a live list) and always offers a free-text entry, so a
 * provider with no fetchable list still works — you type the id. Same control
 * everywhere the model gets chosen.
 */
export function ModelDropdown(props: { value: string; models?: string[]; onChange: (m: string) => void }) {
  const [open, setOpen] = createSignal(false);
  const [custom, setCustom] = createSignal("");

  const list = () => props.models ?? [];
  const choose = (m: string) => {
    props.onChange(m);
    setOpen(false);
  };
  const submitCustom = () => {
    const v = custom().trim();
    if (!v) return;
    choose(v);
    setCustom("");
  };

  return (
    <div class="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open()}
        class="flex h-9 w-full items-center justify-between gap-2 rounded-[var(--r2)] border border-[var(--line)] bg-white/[0.04] px-2.5 text-left transition-colors hover:border-[var(--line-strong)]"
      >
        <span class="truncate font-mono text-[12px] text-[var(--text)]">{props.value || "Choose a model"}</span>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--muted)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      <Show when={open()}>
        <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-2)]">
          <Show when={list().length}>
            <div class="aular-hover-scrollbar max-h-[212px] overflow-y-auto p-1.5">
              <For each={list()}>
                {(m) => (
                  <button
                    type="button"
                    onClick={() => choose(m)}
                    class="flex w-full items-center rounded-[var(--r2)] px-2 py-1.5 text-left font-mono text-[12px] transition-colors"
                    classList={{
                      "bg-[var(--element)] text-[var(--text)]": m === props.value,
                      "text-[var(--muted)] hover:bg-[var(--row-hover)]": m !== props.value,
                    }}
                  >
                    {m}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <div class="border-t border-[var(--line)] p-1.5">
            <div class="flex h-8 items-center gap-1.5 rounded-[var(--r2)] bg-[var(--element)] px-2">
              <input
                value={custom()}
                onInput={(e) => setCustom(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && submitCustom()}
                placeholder="Type a model id…"
                class="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
              />
              <Show when={custom().trim()}>
                <button type="button" onClick={submitCustom} class="shrink-0 rounded-[var(--r1)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent-text)] hover:text-[var(--text)]">Use</button>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

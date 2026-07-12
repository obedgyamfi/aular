import { createSignal } from "solid-js";

export function Composer() {
  const [text, setText] = createSignal("");

  return (
    <div class="shrink-0 px-4 pb-4">
      <div class="mx-auto w-full max-w-[760px]">
        <div class="flex items-end gap-2 rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 py-2 focus-within:border-v2-border-border-focus">
          <textarea
            rows={1}
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            placeholder="Type / for commands"
            class="max-h-40 flex-1 resize-none bg-transparent py-1 font-mono text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-weak"
          />
          <button
            type="button"
            disabled={!text().trim()}
            aria-label="Send"
            class="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded text-v2-icon-icon-accent transition-opacity disabled:text-v2-icon-icon-muted disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12h14m-6-6 6 6-6 6"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

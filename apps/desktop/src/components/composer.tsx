import { createSignal } from "solid-js";

/** The agentic input. Slash commands and the context meter land here next. */
export function Composer() {
  const [text, setText] = createSignal("");

  return (
    <div class="shrink-0 px-4 pb-4 pt-2">
      <div class="mx-auto w-full max-w-[840px]">
        <div
          class="flex items-end gap-2 rounded-lg px-3 py-2 transition-colors"
          style={{
            background: "var(--aular-surface)",
            border: "1px solid var(--aular-border)",
            "transition-duration": "var(--aular-duration-fast)",
          }}
        >
          <textarea
            rows={1}
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            placeholder="Type / for commands"
            class="max-h-40 flex-1 resize-none bg-transparent py-1 text-[13px] outline-none"
            style={{ color: "var(--aular-text)" }}
          />
          <button
            type="button"
            disabled={!text().trim()}
            aria-label="Send"
            class="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-40"
            style={{
              color: text().trim()
                ? "var(--aular-accent)"
                : "var(--aular-text-faint)",
            }}
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

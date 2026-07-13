import { createSignal } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { actions, activeAgent } from "~/lib/store";

export function Composer() {
  const [text, setText] = createSignal("");
  let area: HTMLTextAreaElement | undefined;

  const submit = () => {
    const t = text().trim();
    if (!t || !activeAgent()) return;
    setText("");
    if (area) area.style.height = "auto";
    void actions.send(t);
  };

  return (
    <div class="shrink-0 px-4 pb-4">
      <div class="mx-auto w-full max-w-[760px]">
        <div class="flex items-end gap-2 rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 py-2 focus-within:border-v2-border-border-focus">
          <textarea
            ref={area}
            rows={1}
            value={text()}
            disabled={!activeAgent()}
            onInput={(e) => {
              setText(e.currentTarget.value);
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={activeAgent() ? "Type / for commands" : "Select an agent first"}
            class="max-h-40 flex-1 resize-none bg-transparent py-1 font-mono text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-weak disabled:opacity-60"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text().trim() || !activeAgent()}
            aria-label="Send"
            class="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded text-v2-icon-icon-accent transition-opacity disabled:text-v2-icon-icon-muted disabled:opacity-50"
          >
            <Icon name="arrow-up" size="small" />
          </button>
        </div>
      </div>
    </div>
  );
}

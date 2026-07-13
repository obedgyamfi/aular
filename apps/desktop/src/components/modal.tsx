import { onCleanup, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

/** A dialog. Escape closes, the scrim closes, and so does the ✕ — people look
 *  for one, and a scrim you have to guess at is not a control. */
export function Modal(props: {
  title?: string;
  width?: number;
  onClose: () => void;
  children: any;
}) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
  };
  document.addEventListener("keydown", onKey);
  onCleanup(() => document.removeEventListener("keydown", onKey));

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-v2-overlay-simple-overlay-scrim p-6"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        class="relative flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 p-5 shadow-2xl"
        style={{ "max-width": `${props.width ?? 460}px` }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={props.onClose}
          class="absolute right-3 top-3 z-10 flex size-7 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
        >
          <Icon name="close" size="small" />
        </button>

        <Show when={props.title}>
          <h2 class="mb-3 pr-8 text-[14px] font-medium text-v2-text-text-base">
            {props.title}
          </h2>
        </Show>
        {props.children}
      </div>
    </div>
  );
}

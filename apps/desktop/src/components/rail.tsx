import { For, createSignal } from "solid-js";

type Register = "chat" | "work" | "org";

const REGISTERS: { id: Register; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "M4 4h16v11H7l-3 3V4z" },
  { id: "work", label: "Work", icon: "M4 7h16v12H4V7zm5-3h6v3H9V4z" },
  {
    id: "org",
    label: "Organization",
    icon: "M12 3v4M6 21v-4m12 4v-4M4 17h4v4H4v-4zm12 0h4v4h-4v-4zM10 3h4v4h-4V3zm-4 8h12v2H6v-2z",
  },
];

// The rail: 64px wide on the base background, matching opencode's
// sidebar-rail (w-16 shrink-0 bg-background-base, items centered, gap-3).
export function Rail() {
  const [active, setActive] = createSignal<Register>("chat");

  return (
    <div
      data-component="sidebar-rail"
      class="flex w-16 shrink-0 flex-col items-center gap-3 overflow-hidden bg-v2-background-bg-base px-3 py-3"
    >
      <For each={REGISTERS}>
        {(reg) => (
          <button
            type="button"
            aria-label={reg.label}
            aria-current={active() === reg.id}
            onClick={() => setActive(reg.id)}
            class="flex size-9 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover aria-[current=true]:bg-v2-overlay-simple-overlay-pressed aria-[current=true]:text-v2-icon-icon-accent"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d={reg.icon}
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        )}
      </For>
    </div>
  );
}

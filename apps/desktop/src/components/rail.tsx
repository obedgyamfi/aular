import { For, createSignal } from "solid-js";

type Register = "chat" | "work" | "org";

const REGISTERS: { id: Register; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "M4 4h16v11H7l-3 3V4z" },
  { id: "work", label: "Work", icon: "M4 7h16v12H4V7zm5-3h6v3H9V4z" },
  { id: "org", label: "Organization", icon: "M12 3v4M6 21v-4m12 4v-4M4 17h4v4H4v-4zm12 0h4v4h-4v-4zM10 3h4v4h-4V3zm-4 8h12v2H6v-2z" },
];

/**
 * The register switcher. Chat is the shell's home; Work and Organization are
 * where the licensed engine's surfaces live, so they carry a lock in the free
 * build rather than being hidden — the user should know what they're missing.
 */
export function Rail() {
  const [active, setActive] = createSignal<Register>("chat");

  return (
    <nav
      class="flex w-12 shrink-0 flex-col items-center gap-1 py-2"
      style={{
        background: "var(--aular-titlebar)",
        "border-right": "1px solid var(--aular-border-soft)",
      }}
    >
      <For each={REGISTERS}>
        {(reg) => (
          <button
            type="button"
            aria-label={reg.label}
            aria-current={active() === reg.id}
            onClick={() => setActive(reg.id)}
            class="flex size-9 items-center justify-center rounded-md transition-colors"
            style={{
              background:
                active() === reg.id ? "var(--aular-accent-soft)" : "transparent",
              color:
                active() === reg.id
                  ? "var(--aular-accent)"
                  : "var(--aular-text-faint)",
              "transition-duration": "var(--aular-duration-fast)",
            }}
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
    </nav>
  );
}

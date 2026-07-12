import { Composer } from "~/components/composer";

/** The conversation surface. Empty until an agent is selected. */
export function ChatPane() {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex min-h-0 flex-1 items-center justify-center">
        <div class="flex max-w-sm flex-col items-center gap-2 text-center">
          <span
            class="flex size-10 items-center justify-center rounded-lg text-[15px] font-semibold"
            style={{
              background: "var(--aular-accent-soft)",
              color: "var(--aular-accent)",
            }}
          >
            A
          </span>
          <p class="text-[13px]">Select an agent to start</p>
          <p class="text-[12px]" style={{ color: "var(--aular-text-muted)" }}>
            Your agents run on your machine, on your own model key.
          </p>
        </div>
      </div>
      <Composer />
    </div>
  );
}

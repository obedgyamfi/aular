import { Composer } from "~/components/composer";

export function ChatPane() {
  return (
    <div class="flex min-h-0 flex-1 flex-col bg-v2-background-bg-base">
      <div class="flex min-h-0 flex-1 items-center justify-center">
        <div class="flex max-w-sm flex-col items-center gap-2 text-center">
          <p class="text-[13px] text-v2-text-text-base">Select an agent to start</p>
          <p class="text-[12px] text-v2-text-text-muted">
            Your agents run on your machine, on your own model key.
          </p>
        </div>
      </div>
      <Composer />
    </div>
  );
}

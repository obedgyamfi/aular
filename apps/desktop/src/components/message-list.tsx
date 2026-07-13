import { createEffect, For, Show } from "solid-js";

import { Markdown } from "~/components/markdown";
import { activeMessages, activeWorking, state, activeConversationId } from "~/lib/store";
import type { Message } from "~/lib/types";

/**
 * The conversation. Agent replies grow in place while they stream (the
 * `streaming` flag rides on message.updated), so the text appears token by
 * token instead of arriving as a wall.
 */
export function MessageList() {
  let bottom: HTMLDivElement | undefined;

  // Follow the tail as content arrives.
  createEffect(() => {
    activeMessages().length;
    activeWorking();
    queueMicrotask(() => bottom?.scrollIntoView({ block: "end" }));
  });

  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-4 py-6">
        <For each={activeMessages()}>{(m) => <Bubble message={m} />}</For>

        <Show when={activeWorking()}>
          <div class="flex items-center gap-2 text-[12px] text-v2-text-text-weak">
            <span class="size-1.5 animate-pulse rounded-full bg-v2-icon-icon-accent" />
            working…
          </div>
        </Show>

        <div ref={bottom} />
      </div>
    </div>
  );
}

function Bubble(props: { message: Message }) {
  const m = () => props.message;

  return (
    <Show
      when={m().sender_type !== "user"}
      fallback={
        <div class="flex justify-end">
          <div class="max-w-[80%] rounded-lg rounded-br-sm bg-v2-background-bg-accent px-3 py-2 text-[13px] leading-relaxed text-v2-text-text-inverse">
            <span data-selectable class="whitespace-pre-wrap">
              {m().content}
            </span>
          </div>
        </div>
      }
    >
      <Show
        when={m().sender_type !== "system"}
        fallback={
          <div class="flex justify-center">
            <span class="rounded-full bg-v2-background-bg-layer-02 px-3 py-1 text-[11px] text-v2-text-text-muted">
              {m().content}
            </span>
          </div>
        }
      >
        <div class="flex flex-col gap-1">
          <span class="text-[11px] font-medium text-v2-text-text-muted">
            {state.agents.find((a) => a.id === m().sender_id)?.name ?? "Agent"}
          </span>
          <div class="text-[13px] leading-relaxed text-v2-text-text-base">
            <Markdown content={m().content} />
            <Show when={m().streaming}>
              <span class="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-v2-icon-icon-accent align-middle" />
            </Show>
          </div>
        </div>
      </Show>
    </Show>
  );
}

/** The active conversation's id — exported so panes can key off it. */
export { activeConversationId };

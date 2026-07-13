import { createMemo, For, Show } from "solid-js";

import { Avatar } from "~/components/avatar";
import { activeConversationId, state } from "~/lib/store";

/**
 * The turn-in-flight indicator.
 *
 * Not a chat bubble with three dots: an agent working is doing something — a
 * search, a file read, a shell command — and saying which is more honest and
 * more interesting than pretending it's typing. So the label shimmers with the
 * live tool name when there is one, and falls back to "Thinking" when the model
 * is just reasoning. The dots carry the pulse either way.
 */
export function Thinking(props: { agentName: string }) {
  /** The most recent tool still running in this conversation, if any. */
  const runningTool = createMemo(() => {
    const convoId = activeConversationId();
    if (!convoId) return undefined;
    const calls = state.toolCalls[convoId] ?? [];
    for (let i = calls.length - 1; i >= 0; i--) {
      if (calls[i]!.status === "running") return calls[i]!.tool_name;
    }
    return undefined;
  });

  const label = () => {
    const tool = runningTool();
    return tool ? prettyTool(tool) : "Thinking";
  };

  return (
    <div class="flex items-end gap-2 pt-3">
      <div class="w-8 shrink-0">
        <Avatar name={props.agentName} size={28} />
      </div>

      <div class="flex items-center gap-2 rounded-lg rounded-bl-sm bg-v2-background-bg-layer-02 px-3 py-2">
        <Dots />
        <span class="aular-shimmer text-[12px] font-medium">{label()}</span>
        <Show when={runningTool()}>
          <span class="text-[11px] text-v2-text-text-faint">·</span>
          <span class="font-mono text-[10.5px] text-v2-text-text-faint">
            {runningTool()}
          </span>
        </Show>
      </div>
    </div>
  );
}

/** The same pulse, small enough for a chat-list row. */
export function Dots(props: { class?: string }) {
  return (
    <span class={`flex items-center gap-[3px] ${props.class ?? ""}`}>
      <For each={[0, 160, 320]}>
        {(delay) => (
          <span
            class="aular-think size-[5px] rounded-full bg-v2-icon-icon-accent"
            style={{ "animation-delay": `${delay}ms` }}
          />
        )}
      </For>
    </span>
  );
}

/** `web_search` → "Searching the web", and so on. Falls back gracefully. */
function prettyTool(name: string): string {
  const known: Record<string, string> = {
    web_search: "Searching the web",
    web_fetch: "Reading a page",
    browser: "Browsing",
    terminal: "Running a command",
    shell: "Running a command",
    file: "Reading files",
    file_read: "Reading files",
    file_write: "Writing files",
    code_execution: "Running code",
    memory_store: "Remembering",
    memory_search: "Recalling",
    skills_list: "Checking its skills",
    skill_view: "Reading a skill",
    todo: "Planning",
    cronjob: "Scheduling",
  };
  return known[name] ?? "Working";
}

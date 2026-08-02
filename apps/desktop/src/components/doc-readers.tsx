import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import Plus from "lucide-solid/icons/plus";
import X from "lucide-solid/icons/x";

import { Avatar } from "~/components/avatar";
import type { Agent, OrgDocument } from "~/lib/types";

/**
 * Who reads this document, and a way to change it.
 *
 * Sharing belongs to the document rather than to an agent's shelf: "who reads
 * this" is a property of the thing being read, and doing it from the document
 * means you decide it while looking at the content you are deciding about.
 *
 * An org-wide document has no readers to pick — everyone already reads it, and
 * offering a picker would imply the list could be narrowed. It says so instead.
 */
export function DocReaders(props: {
  doc: OrgDocument;
  agents: Agent[];
  /** document id → agent ids it is shared with. */
  links: Record<string, string[]>;
  onShare: (docId: string, agentId: string, on: boolean) => void;
}) {
  const [picking, setPicking] = createSignal(false);
  let root: HTMLDivElement | undefined;
  const onDown = (e: PointerEvent) => {
    if (!root?.contains(e.target as Node)) setPicking(false);
  };
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDown));

  const orgWide = () => !props.doc.agent_profile_id;
  const author = () => props.agents.find((a) => a.id === props.doc.agent_profile_id);
  const sharedIds = createMemo(() => new Set(props.links[props.doc.id] ?? []));
  const readers = createMemo(() => props.agents.filter((a) => sharedIds().has(a.id)));
  const addable = createMemo(() =>
    props.agents.filter((a) => !sharedIds().has(a.id) && a.id !== props.doc.agent_profile_id),
  );

  return (
    <section ref={root} class="relative flex flex-wrap items-center gap-1.5">
      <span class="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
        {orgWide() ? "Read by" : "Readers"}
      </span>

      <Show
        when={!orgWide()}
        fallback={
          <span class="text-[11.5px] text-[var(--text-2)]">
            Every agent — this is org-wide knowledge
          </span>
        }
      >
        {/* The author, first and unremovable: the document was written for them,
            which is a different relationship from being given it. */}
        <Show when={author()}>
          {(a) => (
            <span class="inline-flex items-center gap-1.5 rounded-[var(--pill)] bg-[var(--element)] py-0.5 pl-0.5 pr-2">
              <Avatar name={a().name} size={16} circle />
              <span class="text-[11.5px] text-[var(--text-2)]">{a().name}</span>
              <span class="text-[10px] text-[var(--faint)]">author</span>
            </span>
          )}
        </Show>

        <For each={readers()}>
          {(a) => (
            <span class="group/reader inline-flex items-center gap-1.5 rounded-[var(--pill)] border border-[var(--line)] py-0.5 pl-0.5 pr-1">
              <Avatar name={a.name} size={16} circle />
              <span class="text-[11.5px] text-[var(--text-2)]">{a.name}</span>
              <button
                type="button"
                aria-label={`Stop ${a.name} reading this`}
                title={`Stop ${a.name} reading this`}
                onClick={() => props.onShare(props.doc.id, a.id, false)}
                class="grid size-4 place-items-center rounded-full text-[var(--faint)] transition-colors hover:bg-[var(--element-hover)] hover:text-v2-state-fg-danger"
              >
                <X size={10} stroke-width={2.6} />
              </button>
            </span>
          )}
        </For>

        <Show when={addable().length}>
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            aria-expanded={picking()}
            class="inline-flex items-center gap-1 rounded-[var(--pill)] border border-dashed border-[var(--line-strong)] px-2 py-[3px] text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            <Plus size={11} stroke-width={2.4} />
            Share
          </button>
        </Show>
      </Show>

      <Show when={picking()}>
        <div class="aular-pop absolute left-0 top-full z-40 mt-1.5 max-h-[240px] w-[220px] overflow-y-auto rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-xl">
          <For each={addable()}>
            {(a) => (
              <button
                type="button"
                onClick={() => {
                  props.onShare(props.doc.id, a.id, true);
                  setPicking(false);
                }}
                class="flex w-full items-center gap-2 rounded-[var(--r2)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--element-hover)]"
              >
                <Avatar name={a.name} size={18} circle />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[12px] text-[var(--text-2)]">{a.name}</span>
                  <span class="block truncate text-[10px] text-[var(--faint)]">
                    {prettyRole(a.role)}
                  </span>
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

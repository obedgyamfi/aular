import { createSignal, For, Show } from "solid-js";
import Lock from "lucide-solid/icons/lock";
import Pencil from "lucide-solid/icons/pencil";
import Trash2 from "lucide-solid/icons/trash-2";

import { Avatar } from "~/components/avatar";
import { confirmDialog } from "~/components/confirm";
import { Markdown } from "~/components/markdown";
import { api } from "~/lib/api";
import type { OrgDocument } from "~/lib/types";

/**
 * One document of the knowledge bank, read and written.
 *
 * Everything here is injected into agent prompts, and agents write back to the
 * same store — so a document opens *reading* (rendered, like the page it is)
 * and Edit turns it back into text. Authoring is deliberately minimal: a name
 * and its contents, nothing else. Whatever the doc *is* (a process, a spec, a
 * set of notes) is carried by what you name it.
 */
const EXAMPLES = ["Launch process", "Brand voice", "Audience research", "Meeting notes"];

/** A document, being read: a page, not a form. */
export function DocView(props: {
  doc: OrgDocument;
  scopeName?: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = createSignal("");

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete “${props.doc.title}”?`,
      message:
        "Your agents read the knowledge bank before every turn. Removing this takes it out of their prompts.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteDocument(props.doc.id);
      props.onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div class="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div class="mx-auto w-full max-w-[720px] px-10 py-8">
        <div class="flex items-start gap-3">
          <h1
            class="min-w-0 flex-1 text-[21px] font-semibold leading-snug text-[var(--text)]"
            style={{ "font-family": "var(--serif)" }}
          >
            {props.doc.title || "Untitled"}
          </h1>
          <div class="flex shrink-0 items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={props.onEdit}
              class="inline-flex items-center gap-1.5 rounded-[var(--r2)] border border-[var(--line)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--element-hover)]"
            >
              <Pencil size={13} stroke-width={2} />
              Edit
            </button>
            <button
              type="button"
              title="Delete document"
              onClick={remove}
              class="grid size-8 place-items-center rounded-[var(--r2)] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--red)]"
            >
              <Trash2 size={14} stroke-width={2} />
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 pt-3 text-[11px] text-[var(--faint)]">
          <Show
            when={props.scopeName}
            fallback={<span class="text-[var(--muted)]">Org-wide</span>}
          >
            <span class="flex items-center gap-1.5 text-[var(--muted)]">
              <Avatar name={props.scopeName!} size={16} />
              {props.scopeName}
            </span>
          </Show>
          <span>·</span>
          <span>
            Updated{" "}
            {new Date(props.doc.updated_at).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>

        <Show when={error()}>
          <p class="pt-3 text-[11.5px] text-[var(--red)]">{error()}</p>
        </Show>

        <div class="pt-6">
          <Show
            when={props.doc.content.trim()}
            fallback={
              <p class="text-[12.5px] italic text-[var(--faint)]">
                Empty — edit it to give your agents something to read.
              </p>
            }
          >
            <Markdown content={props.doc.content} />
          </Show>
        </div>
      </div>
    </div>
  );
}

/**
 * The same document, being written — a name and its contents, nothing else.
 * The body doubles as a drop zone, so typing and upload share one surface.
 */
export function DocEditor(props: {
  doc: OrgDocument | null;
  seed: { title: string; content: string } | null;
  /** Scope for a NEW document: an agent id makes it that agent's
   *  specialization, null/absent makes it org-wide. Editing keeps the scope
   *  the document already has. */
  agentId?: string | null;
  onSaved: (d: OrgDocument) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = createSignal(props.doc?.title ?? props.seed?.title ?? "");
  const [content, setContent] = createSignal(
    props.doc?.content ?? props.seed?.content ?? "",
  );
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const [dragging, setDragging] = createSignal(false);

  const save = async () => {
    if (!title().trim() || saving()) return;
    setSaving(true);
    setError("");
    try {
      const saved = await api.upsertDocument({
        // Editing an existing doc keeps its scope and kind so the upsert lands
        // on the same record; a new one takes the scope it was created from —
        // an agent's shelf writes their specialization, the canvas at large
        // writes org-wide.
        ...((props.doc?.agent_profile_id ?? props.agentId ?? null)
          ? { agent_profile_id: (props.doc?.agent_profile_id ?? props.agentId)! }
          : {}),
        title: title().trim(),
        kind: props.doc?.kind ?? "doc",
        content: content(),
      });
      props.onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setContent(text);
      if (!title().trim()) setTitle(file.name.replace(/\.(md|markdown|txt)$/i, ""));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div class="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div class="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-10 py-8">
        <div class="flex items-center gap-2">
          <span class="flex-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
            {props.doc ? "Editing" : "New document"}
          </span>
          <button
            type="button"
            onClick={props.onCancel}
            class="rounded-[var(--r2)] px-3 py-1.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!title().trim() || saving()}
            onClick={() => void save()}
            class="rounded-[var(--r2)] bg-[var(--text)] px-3.5 py-1.5 text-[12px] font-[650] text-[var(--bg)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--on-accent)] disabled:opacity-40"
          >
            {saving() ? "Saving…" : "Save document"}
          </button>
        </div>

        <input
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
          placeholder="Name this document"
          autofocus
          class="mt-5 w-full bg-transparent text-[21px] font-semibold leading-snug text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
          style={{ "font-family": "var(--serif)" }}
        />

        {/* A hint, not a picker: name it after whatever it is. */}
        <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span class="text-[11.5px] text-[var(--muted)]">Name it whatever it is —</span>
          <For each={EXAMPLES}>
            {(ex) => (
              <button
                type="button"
                onClick={() => {
                  if (!title().trim()) setTitle(ex);
                }}
                class="rounded-[var(--pill)] border border-[var(--line)] px-2.5 py-[3px] text-[11px] text-[var(--text-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
              >
                {ex}
              </button>
            )}
          </For>
        </div>

        <div
          class="mt-4 flex min-h-0 flex-1 flex-col rounded-[var(--r3)] border transition-colors"
          classList={{
            "border-[var(--accent)] bg-[var(--accent-soft)]": dragging(),
            "border-[var(--line)]": !dragging(),
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            // Ignore leaves into child nodes — only the real exit clears it.
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(e) => void onDrop(e)}
        >
          <textarea
            value={content()}
            onInput={(e) => setContent(e.currentTarget.value)}
            placeholder="Start typing the contents — or drop a .md or .txt file here."
            class="min-h-[200px] flex-1 resize-none bg-transparent px-4 py-3.5 text-[13px] leading-[1.7] text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
          />
        </div>

        <Show when={error()}>
          <p class="pt-2.5 text-[11.5px] text-[var(--red)]">{error()}</p>
        </Show>

        <div class="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--faint)]">
          <Lock size={12} stroke-width={2} />
          Saved to the shared bank — your agents read it before their turn.
        </div>
      </div>
    </div>
  );
}

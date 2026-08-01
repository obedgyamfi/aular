import { createResource, createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import Building2 from "lucide-solid/icons/building-2";
import ChevronRight from "lucide-solid/icons/chevron-right";
import FileText from "lucide-solid/icons/file-text";
import Lock from "lucide-solid/icons/lock";
import Pencil from "lucide-solid/icons/pencil";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import Upload from "lucide-solid/icons/upload";

import { Avatar } from "~/components/avatar";
import { confirmDialog } from "~/components/confirm";
import { Markdown } from "~/components/markdown";
import { api } from "~/lib/api";
import { state } from "~/lib/store";
import type { OrgDocument } from "~/lib/types";

/**
 * The knowledge bank — the organization's memory.
 *
 * The documents the whole team works from, plus each agent's role document. All
 * of it is injected into agent prompts, and agents write back here themselves —
 * so this is a window onto a store they share, not a folder of notes.
 *
 * Two panes on the design's surface cards: the shelf on the left, one document
 * open on the right. A document opens *reading* — rendered, like the page it is
 * — and Edit turns it back into text. Adding is deliberately minimal: a name
 * and its contents, nothing else. Whatever the doc *is* (a process, a spec, a
 * set of notes) is carried by what you name it. Roadmaps aren't authored here —
 * the agents own those, and they live in their own view.
 */
const EXAMPLES = ["Launch process", "Brand voice", "Audience research", "Meeting notes"];

export function OrgDocs() {
  const [docs, { refetch }] = createResource(() =>
    api.listDocuments().then((d) => d ?? []).catch(() => []),
  );

  const [selected, setSelected] = createSignal<OrgDocument | null>(null);
  const [editing, setEditing] = createSignal(false);
  // A file dropped or picked seeds the editor (name + contents) for review,
  // rather than landing silently — the same surface as the typing flow.
  const [seed, setSeed] = createSignal<{ title: string; content: string } | null>(null);
  const [error, setError] = createSignal("");
  let picker: HTMLInputElement | undefined;

  const agentName = (id?: string | null) =>
    state.agents.find((a) => a.id === id)?.name ?? "(removed agent)";

  // Roadmaps are the agents' to author and live in their own kanban/gantt view;
  // everything else is the bank, grouped by owner: an Organization group (the
  // shared, org-wide docs) plus one collapsible group per agent that has files.
  const bankDocs = () => (docs() ?? []).filter((d) => d.kind !== "roadmap");
  const orgDocs = () => bankDocs().filter((d) => !d.agent_profile_id);
  const agentGroups = () => {
    const byAgent = new Map<string, OrgDocument[]>();
    for (const d of bankDocs()) {
      if (!d.agent_profile_id) continue;
      const list = byAgent.get(d.agent_profile_id) ?? [];
      list.push(d);
      byAgent.set(d.agent_profile_id, list);
    }
    // Roster order first, then any docs whose agent was removed.
    const groups: { id: string; name: string; docs: OrgDocument[] }[] = [];
    for (const a of state.agents) {
      const list = byAgent.get(a.id);
      if (list?.length) {
        groups.push({ id: a.id, name: a.name, docs: list });
        byAgent.delete(a.id);
      }
    }
    for (const [id, list] of byAgent) {
      groups.push({ id, name: agentName(id), docs: list });
    }
    return groups;
  };

  // Which groups are expanded. The Organization group opens by default; opening
  // a document expands its group so the shelf never hides what you're reading.
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({ org: true });
  const isExpanded = (key: string) => !!expanded()[key];
  const toggleGroup = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const open = (d: OrgDocument) => {
    setSelected(d);
    setEditing(false);
    setSeed(null);
    const key = d.agent_profile_id ?? "org";
    setExpanded((e) => (e[key] ? e : { ...e, [key]: true }));
  };

  const startNew = () => {
    setSelected(null);
    setSeed(null);
    setEditing(true);
  };

  /** A markdown/text file belongs in the bank without a copy-paste. It opens
      the editor prefilled — name from the filename, contents from the file. */
  const fromFile = async (file?: File) => {
    if (!file) return;
    setError("");
    try {
      const content = await file.text();
      const title = file.name.replace(/\.(md|markdown|txt)$/i, "");
      setSelected(null);
      setSeed({ title, content });
      setEditing(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div class="flex min-h-0 flex-1 gap-3.5 p-6">
      {/* ── the shelf ── */}
      <aside
        class="flex w-[248px] shrink-0 flex-col overflow-hidden rounded-[var(--r4)] border border-[var(--line)] bg-[var(--surface)]"
        style={{ "box-shadow": "var(--shadow-1)" }}
      >
        <div class="flex shrink-0 items-center gap-1.5 border-b border-[var(--line)] p-2.5">
          <button
            type="button"
            onClick={startNew}
            class="flex flex-1 items-center gap-1.5 rounded-[var(--r2)] border border-[var(--line)] px-2.5 py-[7px] text-[12px] font-[650] text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
          >
            <Plus size={14} stroke-width={2} />
            New document
          </button>
          <input
            ref={picker}
            type="file"
            accept=".md,.markdown,.txt,text/*"
            class="hidden"
            onChange={(e) => {
              void fromFile(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            title="Upload a markdown or text file"
            onClick={() => picker?.click()}
            class="grid size-[30px] flex-none place-items-center rounded-[var(--r2)] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
          >
            <Upload size={15} stroke-width={2} />
          </button>
        </div>

        <Show when={error()}>
          <p class="px-3 pt-2 text-[11px] text-[var(--red)]">{error()}</p>
        </Show>

        <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          <Group
            label="Organization"
            count={orgDocs().length}
            open={isExpanded("org")}
            onToggle={() => toggleGroup("org")}
            icon={<Building2 size={15} stroke-width={1.9} />}
          >
            <For each={orgDocs()} fallback={<Empty>No shared documents yet.</Empty>}>
              {(d) => (
                <DocRow doc={d} active={selected()?.id === d.id} onClick={() => open(d)} />
              )}
            </For>
          </Group>

          <For each={agentGroups()}>
            {(g) => (
              <Group
                label={g.name}
                count={g.docs.length}
                open={isExpanded(g.id)}
                onToggle={() => toggleGroup(g.id)}
                avatar={g.name}
              >
                <For each={g.docs}>
                  {(d) => (
                    <DocRow doc={d} active={selected()?.id === d.id} onClick={() => open(d)} />
                  )}
                </For>
              </Group>
            )}
          </For>
        </div>
      </aside>

      {/* ── reader / editor / empty ── */}
      <section
        class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--r4)] border border-[var(--line)] bg-[var(--surface)]"
        style={{ "box-shadow": "var(--shadow-1)" }}
      >
        <Show when={editing() || selected()} fallback={<EmptyState onNew={startNew} />}>
          <Show
            when={editing()}
            fallback={
              <DocView
                doc={selected()!}
                scopeName={
                  selected()!.agent_profile_id
                    ? agentName(selected()!.agent_profile_id)
                    : undefined
                }
                onEdit={() => setEditing(true)}
                onDeleted={async () => {
                  await refetch();
                  setSelected(null);
                }}
              />
            }
          >
            <DocEditor
              doc={selected()}
              seed={seed()}
              onSaved={async (d) => {
                await refetch();
                open(d);
              }}
              onCancel={() => {
                setEditing(false);
                setSeed(null);
              }}
            />
          </Show>
        </Show>
      </section>
    </div>
  );
}

/** A collapsible owner group in the shelf — the Organization bank or one
 *  agent's files. The header toggles; the document list sits under a hairline. */
function Group(props: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  icon?: JSX.Element;
  avatar?: string;
  children: JSX.Element;
}) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={props.open}
        onClick={props.onToggle}
        class="flex w-full items-center gap-1.5 rounded-[var(--r2)] px-1.5 py-[7px] text-left transition-colors hover:bg-[var(--element-hover)]"
      >
        <ChevronRight
          size={14}
          stroke-width={2.2}
          class="flex-none text-[var(--muted)]"
          style={{ transform: props.open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
        />
        <Show
          when={props.avatar}
          fallback={<span class="flex-none text-[var(--muted)]">{props.icon}</span>}
        >
          <Avatar name={props.avatar!} size={18} />
        </Show>
        <span class="min-w-0 flex-1 truncate text-[12px] font-[650] text-[var(--text)]">
          {props.label}
        </span>
        <span class="flex-none text-[11px] text-[var(--faint)]">{props.count}</span>
      </button>
      <Show when={props.open}>
        <div class="mb-1 ml-[13px] flex flex-col gap-px border-l border-[var(--line)] pl-1.5 pt-0.5">
          {props.children}
        </div>
      </Show>
    </div>
  );
}

function Empty(props: { children: any }) {
  return <p class="px-2 py-1 text-[11px] text-[var(--faint)]">{props.children}</p>;
}

function DocRow(props: {
  doc: OrgDocument;
  subtitle?: string;
  active: boolean;
  onClick: () => void;
}) {
  const d = () => props.doc;
  return (
    <button
      type="button"
      aria-current={props.active}
      onClick={props.onClick}
      class="flex w-full items-center gap-2 rounded-[var(--r2)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--element-hover)] aria-[current=true]:bg-[var(--element)]"
    >
      {/* Role documents carry the agent's avatar; plain documents get a file
          icon so the shelf reads as a set of files. */}
      <Show
        when={props.subtitle}
        fallback={
          <span class="flex-none text-[var(--muted)]">
            <FileText size={15} stroke-width={1.9} />
          </span>
        }
      >
        <Avatar name={props.subtitle!} size={18} />
      </Show>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[12.5px] text-[var(--text)]">
          {d().title || "Untitled"}
        </span>
        <span class="block truncate text-[11px] text-[var(--faint)]">
          {props.subtitle ? `${props.subtitle} · ` : ""}
          {new Date(d().updated_at).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          })}
        </span>
      </span>
    </button>
  );
}

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

function EmptyState(props: { onNew: () => void }) {
  return (
    <div class="flex min-w-0 flex-1 flex-col items-center justify-center px-8 text-center">
      <div class="max-w-[440px]">
        <div class="mx-auto grid size-11 place-items-center rounded-[var(--r3)] bg-[var(--element)] text-[var(--muted)]">
          <FileText size={20} stroke-width={1.8} />
        </div>
        <p
          class="mt-4 text-[15px] font-semibold text-[var(--text)]"
          style={{ "font-family": "var(--serif)" }}
        >
          The organization's memory
        </p>
        <p class="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
          Everything here goes into your agents' context — the documents and notes
          they share and write back to. Pick one to read, or add your own.
        </p>
        <button
          type="button"
          onClick={props.onNew}
          class="mt-4 inline-flex items-center gap-1.5 rounded-[var(--r2)] bg-[var(--text)] px-3.5 py-[9px] text-[12.5px] font-[650] text-[var(--bg)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--on-accent)]"
        >
          <Plus size={15} stroke-width={2} />
          New document
        </button>
      </div>
    </div>
  );
}

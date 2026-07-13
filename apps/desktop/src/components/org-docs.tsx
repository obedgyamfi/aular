import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Avatar } from "~/components/avatar";
import { confirmDialog } from "~/components/confirm";
import { api } from "~/lib/api";
import { state } from "~/lib/store";
import type { OrgDocument } from "~/lib/types";

/**
 * The knowledge bank — ported from the prototype's OrgDocs.
 *
 * The organization's memory: the roadmap everything serves, the specs and
 * processes the whole team works from, and each agent's role document. All of it
 * is injected into agent prompts, and agents write back here themselves with doc
 * blocks — so this is a window onto a store they share, not a folder of notes.
 *
 * Two panes, like the prototype: the bank on the left, one document open on the
 * right. A document you can only preview is a document you won't maintain.
 */
export function OrgDocs() {
  const [docs, { refetch }] = createResource(() =>
    api.listDocuments().then((d) => d ?? []),
  );

  const [selected, setSelected] = createSignal<OrgDocument | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal("");
  let picker: HTMLInputElement | undefined;

  const roadmap = () =>
    (docs() ?? []).find((d) => !d.agent_profile_id && d.kind === "roadmap");
  const orgDocs = () =>
    (docs() ?? []).filter((d) => !d.agent_profile_id && d.kind !== "roadmap");
  const roleDocs = () => (docs() ?? []).filter((d) => !!d.agent_profile_id);

  const agentName = (id?: string | null) =>
    state.agents.find((a) => a.id === id)?.name ?? "(removed agent)";

  const open = (d: OrgDocument) => {
    setSelected(d);
    setCreating(false);
  };

  /** Markdown you already wrote belongs in the bank without a copy-paste. */
  const upload = async (file?: File) => {
    if (!file) return;
    setError("");
    try {
      const content = await file.text();
      const title = file.name.replace(/\.(md|markdown|txt)$/i, "");
      const doc = await api.upsertDocument({ title, kind: "doc", content });
      await refetch();
      open(doc);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div class="flex min-h-0 min-w-0 flex-1">
      <aside class="flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-v2-border-border-muted">
        <div class="flex h-11 shrink-0 items-center gap-1 px-3">
          <span class="min-w-0 flex-1 text-[13px] font-medium text-v2-text-text-base">
            Knowledge bank
          </span>

          <input
            ref={picker}
            type="file"
            accept=".md,.markdown,.txt,text/*"
            class="hidden"
            onChange={(e) => {
              void upload(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            title="Upload a markdown or text file"
            onClick={() => picker?.click()}
            class="flex size-6 items-center justify-center rounded text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
          >
            <Icon name="cloud-upload" size="small" />
          </button>
          <button
            type="button"
            title="New document"
            onClick={() => {
              setSelected(null);
              setCreating(true);
            }}
            class="flex size-6 items-center justify-center rounded text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
          >
            <Icon name="plus-small" size="small" />
          </button>
        </div>

        <Show when={error()}>
          <p class="px-3 pb-1 text-[11px] text-v2-state-fg-danger">{error()}</p>
        </Show>

        <div class="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-3">
          <Section label="Roadmap" />
          <Show
            when={roadmap()}
            fallback={
              <p class="px-2 py-1 text-[11px] leading-relaxed text-v2-text-text-faint">
                None yet. Write one (kind “roadmap”) and every agent reads it
                first.
              </p>
            }
          >
            {(r) => (
              <DocRow
                doc={r()}
                active={selected()?.id === r().id}
                onClick={() => open(r())}
              />
            )}
          </Show>

          <Section label="Org documents" />
          <For
            each={orgDocs()}
            fallback={
              <p class="px-2 py-1 text-[11px] text-v2-text-text-faint">None yet.</p>
            }
          >
            {(d) => (
              <DocRow doc={d} active={selected()?.id === d.id} onClick={() => open(d)} />
            )}
          </For>

          <Section label="Role documents" />
          <For
            each={roleDocs()}
            fallback={
              <p class="px-2 py-1 text-[11px] text-v2-text-text-faint">None yet.</p>
            }
          >
            {(d) => (
              <DocRow
                doc={d}
                subtitle={agentName(d.agent_profile_id)}
                active={selected()?.id === d.id}
                onClick={() => open(d)}
              />
            )}
          </For>
        </div>
      </aside>

      <Show
        when={creating() || selected()}
        fallback={
          <div class="flex min-w-0 flex-1 items-center justify-center px-8 text-center">
            <div class="max-w-[440px]">
              <p class="text-[13px] font-medium text-v2-text-text-base">
                The organization's memory
              </p>
              <p class="pt-1.5 text-[11.5px] leading-relaxed text-v2-text-text-muted">
                Everything here goes into your agents' context: the roadmap they
                work toward, the specs and processes they share, and each agent's
                role document. They write back to it as they work — and you can
                add or upload documents any time.
              </p>
            </div>
          </div>
        }
      >
        {/* Keyed on the open document: the editor holds a draft, and a draft of
            one document must never leak into the next one you click. */}
        <DocEditor
          doc={selected()}
          onSaved={async (d) => {
            await refetch();
            open(d);
          }}
          onDeleted={async () => {
            await refetch();
            setSelected(null);
            setCreating(false);
          }}
        />
      </Show>
    </div>
  );
}

function Section(props: { label: string }) {
  return (
    <div class="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.08em] text-v2-text-text-faint">
      {props.label}
    </div>
  );
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
      class="flex w-full flex-col rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-v2-overlay-simple-overlay-hover aria-[current=true]:bg-v2-overlay-simple-overlay-pressed"
    >
      <span class="truncate text-[12px] text-v2-text-text-base">{d().title}</span>
      <span class="truncate text-[10.5px] text-v2-text-text-faint">
        {d().kind}
        {props.subtitle ? ` · ${props.subtitle}` : ""} ·{" "}
        {new Date(d().updated_at).toLocaleDateString([], {
          month: "numeric",
          day: "numeric",
        })}
      </span>
    </button>
  );
}

/** One document, open: title, kind, scope, and the markdown itself. */
function DocEditor(props: {
  doc: OrgDocument | null;
  onSaved: (d: OrgDocument) => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = createSignal(props.doc?.title ?? "");
  const [kind, setKind] = createSignal(props.doc?.kind ?? "doc");
  const [scope, setScope] = createSignal(props.doc?.agent_profile_id ?? "");
  const [content, setContent] = createSignal(props.doc?.content ?? "");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  // Solid keeps this component mounted when you click a different row, so the
  // draft has to follow the document. Without this you'd open the roadmap and
  // find the last doc's text sitting in the editor, one Save away from
  // overwriting it.
  let loaded: string | undefined;
  createEffect(() => {
    const d = props.doc;
    const id = d?.id ?? "__new__";
    if (id === loaded) return;
    loaded = id;
    setTitle(d?.title ?? "");
    setKind(d?.kind ?? "doc");
    setScope(d?.agent_profile_id ?? "");
    setContent(d?.content ?? "");
    setError("");
  });

  const staff = () => state.agents.filter((a) => a.role !== "system");

  const save = async () => {
    if (!title().trim() || saving()) return;
    setSaving(true);
    setError("");
    try {
      const saved = await api.upsertDocument({
        ...(scope() ? { agent_profile_id: scope() } : {}),
        title: title().trim(),
        kind: kind(),
        content: content(),
      });
      props.onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const doc = props.doc;
    if (!doc) return;
    const ok = await confirmDialog({
      title: `Delete “${doc.title}”?`,
      message:
        "Your agents read the knowledge bank before every turn. Removing this takes it out of their prompts.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteDocument(doc.id);
      props.onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-v2-border-border-muted px-4 py-2">
        <input
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
          placeholder="Document title"
          class="min-w-[180px] flex-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2.5 py-1.5 text-[12.5px] font-medium text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus"
        />

        <select
          value={kind()}
          onChange={(e) => setKind(e.currentTarget.value)}
          class={select}
        >
          <option value="doc">doc</option>
          <option value="spec">spec</option>
          <option value="process">process</option>
          <option value="roadmap">roadmap</option>
          <option value="report">report</option>
        </select>

        <select
          value={scope()}
          onChange={(e) => setScope(e.currentTarget.value)}
          class={`${select} max-w-[160px]`}
        >
          <option value="">Org-wide</option>
          <For each={staff()}>{(a) => <option value={a.id}>{a.name}</option>}</For>
        </select>

        <button
          type="button"
          onClick={save}
          disabled={!title().trim() || saving()}
          class="rounded-md bg-v2-background-bg-accent px-3 py-1.5 text-[12px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
        >
          {saving() ? "Saving…" : "Save"}
        </button>

        <Show when={props.doc}>
          <button
            type="button"
            onClick={remove}
            class="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-v2-state-fg-danger transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          >
            Delete
          </button>
        </Show>
      </div>

      <Show when={error()}>
        <p class="px-4 pt-2 text-[11.5px] text-v2-state-fg-danger">{error()}</p>
      </Show>

      <Show when={props.doc}>
        {(d) => (
          <div class="flex items-center gap-2 px-4 pt-2 text-[10.5px] text-v2-text-text-faint">
            <Avatar name={d().title} size={16} />
            last updated {new Date(d().updated_at).toLocaleString()}
          </div>
        )}
      </Show>

      <textarea
        value={content()}
        onInput={(e) => setContent(e.currentTarget.value)}
        placeholder="Markdown — the roadmap, a spec, a process. This text goes into your agents' prompts, so write what they must know."
        class="m-4 min-h-0 flex-1 resize-none rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4 font-mono text-[12px] leading-relaxed text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus"
      />
    </div>
  );
}

const select =
  "rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2 py-1.5 text-[11.5px] text-v2-text-text-base outline-none";

import { createResource, createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Markdown } from "~/components/markdown";
import { api } from "~/lib/api";
import { state } from "~/lib/store";
import type { OrgDocument } from "~/lib/types";

/**
 * The knowledge bank — ported from the prototype's OrgDocs.
 *
 * The organization's memory. Chat scrolls away; this doesn't. Every agent turn
 * carries these documents in its prompt — the roadmap first — so the team works
 * from one plan instead of re-deciding it every session. Agents write here
 * themselves (with a doc block), and so can you.
 */
export function OrgDocs() {
  const [docs, { refetch }] = createResource(() =>
    api.listDocuments().then((d) => d ?? []),
  );
  const [selected, setSelected] = createSignal<OrgDocument | null>(null);
  const [editing, setEditing] = createSignal(false);

  const [title, setTitle] = createSignal("");
  const [kind, setKind] = createSignal("doc");
  const [scope, setScope] = createSignal("");
  const [content, setContent] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const roadmap = () => (docs() ?? []).find((d) => d.kind === "roadmap");
  const orgDocs = () =>
    (docs() ?? []).filter((d) => d.kind !== "roadmap" && !d.agent_profile_id);
  const roleDocs = () => (docs() ?? []).filter((d) => !!d.agent_profile_id);

  const startNew = () => {
    setSelected(null);
    setTitle("");
    setKind("doc");
    setScope("");
    setContent("");
    setEditing(true);
  };

  const startEdit = (d: OrgDocument) => {
    setSelected(d);
    setTitle(d.title);
    setKind(d.kind);
    setScope(d.agent_profile_id ?? "");
    setContent(d.content);
    setEditing(true);
  };

  const save = async () => {
    if (!title().trim() || busy()) return;
    setBusy(true);
    try {
      await api.upsertDocument({
        ...(scope() ? { agent_profile_id: scope() } : {}),
        title: title().trim(),
        kind: kind(),
        content: content(),
      });
      setEditing(false);
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: OrgDocument) => {
    await api.deleteDocument(d.id).catch(() => {});
    if (selected()?.id === d.id) setSelected(null);
    await refetch();
  };

  const agentName = (id?: string | null) =>
    state.agents.find((a) => a.id === id)?.name ?? "—";

  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex flex-col gap-0.5">
          <h2 class="text-[13px] font-medium text-v2-text-text-base">
            Knowledge bank
          </h2>
          <p class="text-[11.5px] text-v2-text-text-muted">
            The organization's memory. Every agent reads this before it works.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          class="flex shrink-0 items-center gap-1.5 rounded-md bg-v2-background-bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-v2-text-text-inverse"
        >
          <Icon name="plus-small" size="small" />
          New document
        </button>
      </div>

      <Show when={editing()}>
        <div class="flex flex-col gap-2.5 rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-01 p-3">
          <div class="grid grid-cols-3 gap-2">
            <input
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              placeholder="Title"
              class={field}
            />
            <select value={kind()} onChange={(e) => setKind(e.currentTarget.value)} class={field}>
              <option value="doc">Document</option>
              <option value="spec">Spec</option>
              <option value="process">Process</option>
              <option value="roadmap">Roadmap (the masterplan)</option>
              <option value="report">Report</option>
            </select>
            <select value={scope()} onChange={(e) => setScope(e.currentTarget.value)} class={field}>
              <option value="">Org-wide</option>
              <For each={state.agents.filter((a) => a.role !== "system")}>
                {(a) => <option value={a.id}>{a.name}'s role doc</option>}
              </For>
            </select>
          </div>

          <textarea
            value={content()}
            onInput={(e) => setContent(e.currentTarget.value)}
            rows={10}
            placeholder="Markdown. This text goes into your agents' prompts — write what they must know."
            class={`${field} resize-y font-mono`}
          />

          <div class="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              class="rounded-md px-3 py-1.5 text-[12px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy() || !title().trim()}
              class="rounded-md bg-v2-background-bg-accent px-3 py-1.5 text-[12px] font-medium text-v2-text-text-inverse disabled:opacity-50"
            >
              {busy() ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Show>

      <Show when={roadmap()}>
        {(r) => (
          <Section label="Roadmap — the masterplan all work serves">
            <DocRow doc={r()} onOpen={startEdit} onDelete={remove} highlight />
          </Section>
        )}
      </Show>

      <Show when={orgDocs().length}>
        <Section label="Org documents">
          <For each={orgDocs()}>
            {(d) => <DocRow doc={d} onOpen={startEdit} onDelete={remove} />}
          </For>
        </Section>
      </Show>

      <Show when={roleDocs().length}>
        <Section label="Role documents">
          <For each={roleDocs()}>
            {(d) => (
              <DocRow
                doc={d}
                subtitle={agentName(d.agent_profile_id)}
                onOpen={startEdit}
                onDelete={remove}
              />
            )}
          </For>
        </Section>
      </Show>

      <Show when={!docs.loading && !(docs() ?? []).length}>
        <p class="py-10 text-center text-[11.5px] text-v2-text-text-weak">
          The bank is empty. Your agents will write to it as they work — or start
          it yourself with a roadmap.
        </p>
      </Show>

      <Show when={editing() ? null : selected()}>
        {(d) => (
          <div class="rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4 text-[12.5px]">
            <Markdown content={d().content} />
          </div>
        )}
      </Show>
    </div>
  );
}

function Section(props: { label: string; children: any }) {
  return (
    <div class="flex flex-col gap-1.5">
      <span class="text-[10px] font-medium uppercase tracking-[0.08em] text-v2-text-text-weak">
        {props.label}
      </span>
      <div class="flex flex-col gap-1">{props.children}</div>
    </div>
  );
}

function DocRow(props: {
  doc: OrgDocument;
  subtitle?: string;
  highlight?: boolean;
  onOpen: (d: OrgDocument) => void;
  onDelete: (d: OrgDocument) => void;
}) {
  const d = () => props.doc;
  return (
    <div
      class="group flex items-center gap-2 rounded-md border px-3 py-2 transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      classList={{
        "border-v2-border-border-focus bg-v2-background-bg-layer-01": !!props.highlight,
        "border-v2-border-border-muted bg-v2-background-bg-layer-01": !props.highlight,
      }}
    >
      <button
        type="button"
        onClick={() => props.onOpen(d())}
        class="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span class="shrink-0 text-v2-icon-icon-muted">
          <Icon name="file-tree" size="small" />
        </span>
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-[12px] text-v2-text-text-base">{d().title}</span>
          <span class="truncate text-[10.5px] text-v2-text-text-weak">
            {d().kind}
            {props.subtitle ? ` · ${props.subtitle}` : ""} ·{" "}
            {new Date(d().updated_at).toLocaleDateString()}
          </span>
        </span>
      </button>

      <button
        type="button"
        aria-label="Delete document"
        onClick={() => props.onDelete(d())}
        class="shrink-0 rounded p-1 text-v2-icon-icon-muted opacity-0 transition-opacity hover:text-v2-text-text-danger group-hover:opacity-100"
      >
        <Icon name="trash" size="small" />
      </button>
    </div>
  );
}

const field =
  "w-full rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2.5 py-1.5 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-weak focus:border-v2-border-border-focus";

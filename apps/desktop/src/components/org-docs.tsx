import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { Avatar } from "~/components/avatar";
import { confirmDialog } from "~/components/confirm";
import { Markdown } from "~/components/markdown";
import { api } from "~/lib/api";
import { state } from "~/lib/store";
import type { OrgDocument } from "~/lib/types";

/**
 * The knowledge bank — the organization's memory.
 *
 * The roadmap everything serves, the specs and processes the whole team works
 * from, and each agent's role document. All of it is injected into agent
 * prompts, and agents write back here themselves — so this is a window onto a
 * store they share, not a folder of notes.
 *
 * Two panes: the bank on the left, one document open on the right. A document
 * opens *reading* — rendered, like the page it is — and an Edit button turns it
 * back into text. The old way (always-on markdown editor, native dropdowns)
 * made the org's memory feel like editing a config file.
 */
const KINDS = ["doc", "spec", "process", "roadmap", "report"] as const;

export function OrgDocs() {
  const [docs, { refetch }] = createResource(() =>
    api.listDocuments().then((d) => d ?? []).catch(() => []),
  );

  const [selected, setSelected] = createSignal<OrgDocument | null>(null);
  const [editing, setEditing] = createSignal(false);
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
    setEditing(false);
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
              setEditing(true);
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
        when={editing() || selected()}
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
            onSaved={async (d) => {
              await refetch();
              open(d);
            }}
            onCancel={() => {
              // A new draft has nothing to fall back to; a doc reopens as a page.
              setEditing(false);
            }}
          />
        </Show>
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
        {cap(d().kind)}
        {props.subtitle ? ` · ${props.subtitle}` : ""} ·{" "}
        {new Date(d().updated_at).toLocaleDateString([], {
          month: "short",
          day: "numeric",
        })}
      </span>
    </button>
  );
}

/** A document, being read: a page, not a form. */
function DocView(props: {
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
      <div class="mx-auto w-full max-w-[760px] px-8 py-6">
        <div class="flex items-start gap-3">
          <h1 class="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-v2-text-text-base">
            {props.doc.title}
          </h1>
          <div class="flex shrink-0 items-center gap-1 pt-0.5">
            <button
              type="button"
              onClick={props.onEdit}
              class="flex items-center gap-1.5 rounded-md border border-v2-border-border-base px-2.5 py-1.5 text-[12px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
            >
              <Icon name="pencil-line" size="small" />
              Edit
            </button>
            <button
              type="button"
              title="Delete document"
              onClick={remove}
              class="flex size-8 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-state-fg-danger"
            >
              <Icon name="trash" size="small" />
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 pt-2.5 text-[11px] text-v2-text-text-faint">
          <KindPill kind={props.doc.kind} />
          <Show
            when={props.scopeName}
            fallback={<span class="text-v2-text-text-muted">Org-wide</span>}
          >
            <span class="flex items-center gap-1.5 text-v2-text-text-muted">
              <Avatar name={props.scopeName!} size={15} />
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
          <p class="pt-3 text-[11.5px] text-v2-state-fg-danger">{error()}</p>
        </Show>

        <div class="pt-5 text-[13px]">
          <Show
            when={props.doc.content.trim()}
            fallback={
              <p class="text-[12px] italic text-v2-text-text-faint">
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

/** The same document, being written. */
function DocEditor(props: {
  doc: OrgDocument | null;
  onSaved: (d: OrgDocument) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = createSignal(props.doc?.title ?? "");
  const [kind, setKind] = createSignal(props.doc?.kind ?? "doc");
  const [scope, setScope] = createSignal(props.doc?.agent_profile_id ?? "");
  const [content, setContent] = createSignal(props.doc?.content ?? "");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

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
      setSaving(false);
    }
  };

  return (
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="shrink-0 border-b border-v2-border-border-muted px-6 py-3">
        <div class="flex items-center gap-3">
          <input
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            placeholder="Document title"
            class="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
          />
          <div class="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={props.onCancel}
              class="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!title().trim() || saving()}
              class="rounded-md bg-v2-background-bg-accent px-3 py-1.5 text-[12px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
            >
              {saving() ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 pt-2.5">
          {/* What kind of page this is — five choices don't need a dropdown. */}
          <div class="flex items-center gap-px overflow-hidden rounded-md border border-v2-border-border-muted">
            <For each={KINDS}>
              {(k) => (
                <button
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind() === k}
                  class="px-2.5 py-1 text-[11px] transition-colors"
                  classList={{
                    "bg-v2-overlay-simple-overlay-pressed font-medium text-v2-text-text-base":
                      kind() === k,
                    "text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base":
                      kind() !== k,
                  }}
                >
                  {cap(k)}
                </button>
              )}
            </For>
          </div>

          <ScopeMenu value={scope()} onChange={setScope} />
        </div>

        <Show when={error()}>
          <p class="pt-2 text-[11.5px] text-v2-state-fg-danger">{error()}</p>
        </Show>
      </div>

      <textarea
        value={content()}
        onInput={(e) => setContent(e.currentTarget.value)}
        placeholder="Markdown — the roadmap, a spec, a process. This text goes into your agents' prompts, so write what they must know."
        class="min-h-0 flex-1 resize-none bg-transparent px-6 py-4 font-mono text-[12px] leading-relaxed text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
      />
    </div>
  );
}

/** Who reads this: the whole org, or one agent. A designed menu, not a <select>. */
function ScopeMenu(props: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  const onDown = (e: PointerEvent) => {
    if (!root?.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDown));

  const staff = () => state.agents.filter((a) => a.role !== "system");
  const current = () => state.agents.find((a) => a.id === props.value);

  return (
    <div ref={root} class="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open()}
        class="flex items-center gap-1.5 rounded-md border border-v2-border-border-muted px-2.5 py-1 text-[11px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
      >
        <Show when={current()} fallback={<span>Org-wide</span>}>
          {(a) => (
            <span class="flex items-center gap-1.5">
              <Avatar name={a().name} size={14} />
              {a().name}
            </span>
          )}
        </Show>
        <Icon name="chevron-down" size="small" />
      </button>

      <Show when={open()}>
        <div class="aular-pop absolute left-0 top-full z-40 mt-1 max-h-[240px] w-[200px] overflow-y-auto rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-02 py-1 shadow-xl">
          <ScopeItem
            label="Org-wide"
            active={!props.value}
            onClick={() => {
              props.onChange("");
              setOpen(false);
            }}
          />
          <For each={staff()}>
            {(a) => (
              <ScopeItem
                label={a.name}
                avatar
                active={props.value === a.id}
                onClick={() => {
                  props.onChange(a.id);
                  setOpen(false);
                }}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function ScopeItem(props: {
  label: string;
  avatar?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
    >
      <Show when={props.avatar}>
        <Avatar name={props.label} size={16} />
      </Show>
      <span class="min-w-0 flex-1 truncate">{props.label}</span>
      <Show when={props.active}>
        <Icon name="check-small" size="small" />
      </Show>
    </button>
  );
}

function KindPill(props: { kind: string }) {
  return (
    <span class="rounded-full bg-v2-background-bg-layer-02 px-2 py-0.5 text-[10.5px] font-medium text-v2-text-text-muted">
      {cap(props.kind)}
    </span>
  );
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

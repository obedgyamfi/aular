import { createMemo, createSignal, For, Show } from "solid-js";
import ChevronRight from "lucide-solid/icons/chevron-right";
import FileText from "lucide-solid/icons/file-text";
import MessageCircle from "lucide-solid/icons/message-circle";
import Plus from "lucide-solid/icons/plus";
import UserRound from "lucide-solid/icons/user-round";
import X from "lucide-solid/icons/x";

import { Avatar, avatarColor } from "~/components/avatar";
import { Backdrop } from "~/components/backdrop";
import { actions } from "~/lib/store";
import { settings } from "~/lib/settings";
import type { Agent, OrgDocument } from "~/lib/types";

/**
 * What one agent knows — the canvas's companion panel.
 *
 * Clicking a sun asks a different question than clicking a planet: not "what
 * does this document say" but "what does this agent read". So this is the
 * profile card's shape carrying a shelf instead of stats — their own
 * specialization first, then the org-wide knowledge every agent shares, each
 * group foldable because one of them is usually the long one.
 */
export function KnowledgeAside(props: {
  agent: Agent;
  documents: OrgDocument[];
  onOpenDoc: (doc: OrgDocument) => void;
  onNewDoc: (agentId: string) => void;
  onClose: () => void;
}) {
  const agent = () => props.agent;
  const tint = () =>
    settings.dynamicAccent ? avatarColor(agent().name) : "var(--blurple)";

  const own = createMemo(() =>
    props.documents.filter((d) => d.agent_profile_id === agent().id),
  );
  const org = createMemo(() => props.documents.filter((d) => !d.agent_profile_id));

  return (
    <aside class="flex w-[316px] shrink-0 flex-col p-2">
      <div
        class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r4)] bg-[var(--sidebar)]"
        style={{
          "background-image": `linear-gradient(180deg, color-mix(in srgb, ${tint()} 34%, transparent) 0%, transparent 28%)`,
        }}
      >
        <Backdrop strength={0.3} tint={tint()} />

        <div class="relative z-10 flex items-center gap-2.5 px-4 pb-2 pt-4">
          <Avatar name={agent().name} size={40} circle />
          <div class="min-w-0 flex-1">
            <div class="truncate text-[14px] font-bold text-[var(--text)]">{agent().name}</div>
            <div class="truncate text-[11.5px] text-[var(--text-2)]">
              {prettyRole(agent().role)}
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            class="grid size-6 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
          >
            <X size={14} stroke-width={2.2} />
          </button>
        </div>

        <div class="aular-hover-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <Shelf
            label="Specialization"
            hint="only this agent reads these"
            docs={own()}
            open
            onOpenDoc={props.onOpenDoc}
            empty="No documents of their own yet."
          />
          <Shelf
            label="Org-wide"
            hint="every agent reads these"
            docs={org()}
            onOpenDoc={props.onOpenDoc}
            empty="The organization has no shared documents yet."
          />
        </div>

        <div class="relative z-10 flex shrink-0 gap-1.5 p-3">
          <button
            type="button"
            onClick={() => props.onNewDoc(agent().id)}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r2)] bg-[var(--accent)] bg-[image:var(--accent-grad)] py-2 text-[12px] font-semibold text-[var(--on-accent)] transition-all hover:brightness-110"
          >
            <Plus size={14} stroke-width={2.2} />
            Teach
          </button>
          <IconAction label="Chat" onClick={() => actions.openChat(agent().id)}>
            <MessageCircle size={15} stroke-width={1.9} />
          </IconAction>
          <IconAction label="Full profile" onClick={() => actions.openProfile(agent().id)}>
            <UserRound size={15} stroke-width={1.9} />
          </IconAction>
        </div>
      </div>
    </aside>
  );
}

/** One foldable group of documents. */
function Shelf(props: {
  label: string;
  hint: string;
  docs: OrgDocument[];
  open?: boolean;
  empty: string;
  onOpenDoc: (doc: OrgDocument) => void;
}) {
  const [open, setOpen] = createSignal(props.open ?? false);
  return (
    <section class="mb-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open()}
        class="flex w-full items-center gap-1.5 rounded-[var(--r2)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--element-hover)]"
      >
        <span
          class="shrink-0 text-[var(--faint)] transition-transform"
          classList={{ "rotate-90": open() }}
        >
          <ChevronRight size={12} stroke-width={2.4} />
        </span>
        <span class="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[var(--muted)]">
          {props.label}
        </span>
        <span class="text-[10.5px] text-[var(--faint)]">{props.docs.length}</span>
        <span class="ml-auto truncate pl-2 text-[10px] text-[var(--faint)]">{props.hint}</span>
      </button>

      <Show when={open()}>
        <Show
          when={props.docs.length}
          fallback={<p class="px-2 pb-2 pl-6 text-[11px] text-[var(--faint)]">{props.empty}</p>}
        >
          <For each={props.docs}>
            {(d) => (
              <button
                type="button"
                onClick={() => props.onOpenDoc(d)}
                class="flex w-full items-center gap-2 rounded-[var(--r2)] px-2 py-1.5 pl-6 text-left transition-colors hover:bg-[var(--element-hover)]"
              >
                <span class="shrink-0 text-[var(--faint)]">
                  <FileText size={13} stroke-width={1.9} />
                </span>
                <span class="min-w-0 flex-1 truncate text-[12px] text-[var(--text-2)]">
                  {d.title}
                </span>
              </button>
            )}
          </For>
        </Show>
      </Show>
    </section>
  );
}

function IconAction(props: { label: string; onClick: () => void; children: any }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      class="grid size-9 shrink-0 place-items-center rounded-[var(--r2)] bg-[var(--element)] text-[var(--muted)] transition-colors hover:bg-[var(--element-hover)] hover:text-[var(--text)]"
    >
      {props.children}
    </button>
  );
}

function prettyRole(role: string): string {
  if (role === "system") return "System";
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

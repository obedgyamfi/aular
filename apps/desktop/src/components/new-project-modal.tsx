import { createSignal, For } from "solid-js";

import { Modal } from "~/components/modal";
import { actions, state } from "~/lib/store";

/**
 * Start a project: a name, what it's for, who leads it, and when it's due.
 * Creating it makes it active and drops you on its detail page.
 */
export function NewProjectModal(props: { onClose: () => void }) {
  const [name, setName] = createSignal("");
  const [objective, setObjective] = createSignal("");
  const [leadId, setLeadId] = createSignal<string>("");
  const [due, setDue] = createSignal("");

  const staff = () => state.agents.filter((a) => a.role !== "system");
  const canCreate = () => name().trim().length > 0;

  const create = async () => {
    if (!canCreate()) return;
    await actions.createProject({
      name: name(),
      objective: objective(),
      leadId: leadId() || null,
      due: due() || null,
    });
    props.onClose();
  };

  const field =
    "w-full rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-3 py-2 text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus";
  const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-v2-text-text-muted";

  return (
    <Modal
      title="New project"
      width={480}
      onClose={props.onClose}
      footer={
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            class="rounded-md px-3 py-1.5 text-[12.5px] font-medium text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCreate()}
            onClick={() => void create()}
            class="rounded-md bg-v2-background-bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-v2-text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Create project
          </button>
        </div>
      }
    >
      <div class="flex flex-col gap-4">
        <div>
          <label class={label}>Name</label>
          <input
            autofocus
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="Website Relaunch"
            class={field}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
        </div>

        <div>
          <label class={label}>Objective</label>
          <textarea
            value={objective()}
            onInput={(e) => setObjective(e.currentTarget.value)}
            placeholder="What is this project setting out to do?"
            rows={3}
            class={`${field} resize-none`}
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class={label}>Lead</label>
            <select value={leadId()} onChange={(e) => setLeadId(e.currentTarget.value)} class={field}>
              <option value="">Unassigned</option>
              <For each={staff()}>{(a) => <option value={a.id}>{a.name}</option>}</For>
            </select>
          </div>
          <div>
            <label class={label}>Target date</label>
            <input
              type="date"
              value={due()}
              onInput={(e) => setDue(e.currentTarget.value)}
              class={field}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

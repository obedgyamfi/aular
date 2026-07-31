import { api } from "./api";
import type { Proposal } from "./intent";
import { actions, state } from "./store";

/** The outcome of applying a proposal: a note to show, and whether it stuck. */
export interface ApplyResult {
  applied: boolean;
  note?: string;
  /** True when the request needs the system agent rather than a direct edit. */
  delegate?: boolean;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Turn a parsed proposal into a real org edit through the same APIs the dialogs
 * use — the one place quick, prompt-driven changes are applied, so the build
 * strip and the org-builder chat never drift.
 *
 * Anything the parser couldn't resolve (or a hire with no matching template)
 * comes back `delegate: true` — that's the system agent's job, not a one-click
 * edit.
 */
export async function applyProposal(p: Proposal): Promise<ApplyResult> {
  if (p.kind === "delegate") return { applied: false, delegate: true };

  try {
    if (p.kind === "routine") {
      await api.createRoutine({
        agent_profile_id: p.agentId,
        name: p.name,
        schedule_rule: p.rule,
        target_behavior: p.behavior,
        active: true,
      });
      return { applied: true };
    }

    if (p.kind === "reparent") {
      await actions.updateAgent(p.agentId, { reports_to: p.managerId ?? "" });
      return { applied: true };
    }

    if (p.kind === "staff") {
      const project = state.projects.find((x) => x.id === p.projectId);
      const onIt = project?.team.includes(p.agentId) ?? false;
      if (p.add === onIt) {
        return {
          applied: false,
          note: p.add
            ? `${p.agentName} is already on ${p.projectName}.`
            : `${p.agentName} isn't on ${p.projectName}.`,
        };
      }
      actions.toggleProjectMember(p.projectId, p.agentId);
      return { applied: true };
    }

    if (p.kind === "project") {
      await actions.createProject({ name: p.name, objective: "", leadId: p.leadId, due: null });
      return { applied: true };
    }

    if (p.kind === "hire") {
      // Prefer a matching template — it arrives with a persona and tools.
      const templates = (await api.listTemplates().catch(() => [])) ?? [];
      const q = p.role.toLowerCase();
      const tpl = templates.find(
        (x) =>
          x.role.toLowerCase().includes(q.split(/\s+/)[0] ?? "") ||
          (x.name ?? "").toLowerCase().includes(q),
      );
      if (!tpl) return { applied: false, delegate: true };
      await actions.createAgent({
        name: p.name ?? tpl.name ?? titleCase(p.role),
        role: tpl.role,
        persona: tpl.persona,
        instructions: tpl.instructions,
        tone: tpl.tone,
        default_tools: tpl.default_tools,
      });
      return { applied: true };
    }

    return { applied: false, delegate: true };
  } catch (e) {
    const msg = (e as Error).message;
    // A routine row survives a dead gateway — the cron bridge is what failed.
    if (/scheduling failed|502/i.test(msg)) {
      return { applied: true, note: "Saved, but paused — the runtime is offline. See Schedules." };
    }
    return { applied: false, note: msg };
  }
}

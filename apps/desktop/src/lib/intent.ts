import type { Agent, Project } from "./types";

/**
 * The build strip's intent layer: recognize the org-shaped requests a person
 * types most — a schedule, a reporting change, a hire — and turn them into
 * appliable proposals. Anything it can't read with confidence is delegated to
 * the AULAR system agent, which is the real builder; this parser exists so the
 * common cases apply in one click instead of one conversation.
 */
export type Proposal =
  | {
      kind: "routine";
      agentId: string;
      agentName: string;
      name: string;
      rule: string;
      behavior: string;
    }
  | {
      kind: "reparent";
      agentId: string;
      agentName: string;
      managerId: string | null;
      managerName: string;
    }
  | { kind: "hire"; role: string; name?: string }
  | {
      kind: "staff";
      agentId: string;
      agentName: string;
      projectId: string;
      projectName: string;
      add: boolean;
    }
  | { kind: "project"; name: string; leadId: string | null; leadName?: string }
  | { kind: "delegate"; text: string };

/** Resolve a person-reference against the roster; "me"/"you"/"the CEO" = null. */
function resolveAgent(ref: string, agents: Agent[]): Agent | "ceo" | null {
  const r = ref.trim().toLowerCase().replace(/[.,!?]$/, "");
  if (!r) return null;
  if (["me", "you", "myself", "the ceo", "ceo", "the founder", "founder"].includes(r)) {
    return "ceo";
  }
  return (
    agents.find((a) => a.name.toLowerCase() === r) ??
    agents.find((a) => r.startsWith(a.name.toLowerCase())) ??
    agents.find((a) => a.name.toLowerCase().startsWith(r.split(/\s+/)[0] ?? "")) ??
    null
  );
}

/** The schedule phrase, lifted whole: "every weekday at 9:00", "daily at 6pm"… */
const SCHEDULE_RE =
  /\b((?:every|each)\s+(?:weekday|day|morning|evening|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?(?:\s+(?:and\s+\w+day\s+)?at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|daily(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|hourly|(?:every\s+\d+\s+(?:minutes|hours|days))|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+(?:every|each)\s+\w+)\b/i;

/** "have Rowan …", "ask Atlas to …", "Rowan should …" — who does the work. */
const ACTOR_RES = [
  /\b(?:have|ask|tell|get|let|make)\s+([A-Z][\w-]*(?:\s+[A-Z][\w-]*)?)\s+(?:to\s+)?/,
  /\b([A-Z][\w-]*)\s+should\s+/,
];

/** Resolve a project by name, loosest match last. */
function resolveProject(ref: string, projects: Project[]): Project | null {
  const r = ref.trim().toLowerCase().replace(/[.,!?]$/, "").replace(/\s+project$/, "");
  if (!r) return null;
  return (
    projects.find((p) => p.name.toLowerCase() === r) ??
    projects.find((p) => p.name.toLowerCase().includes(r)) ??
    projects.find((p) => r.includes(p.name.toLowerCase())) ??
    null
  );
}

export function parseIntent(text: string, agents: Agent[], projects: Project[] = []): Proposal {
  const t = text.trim();
  if (!t) return { kind: "delegate", text: t };

  // ── staffing: "add Rowan to Website Relaunch" / "take Rowan off …" ───────
  const staff =
    /\b(add|put|assign|move|remove|take|drop)\s+([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)?)\s+(?:to|on|onto|from|off)\s+(?:the\s+)?(.+?)(?:\s+project)?\s*$/i.exec(
      t,
    );
  if (staff) {
    const agent = resolveAgent(staff[2]!, agents);
    const project = resolveProject(staff[3]!, projects);
    if (agent && agent !== "ceo" && project && !project.allAgents) {
      return {
        kind: "staff",
        agentId: agent.id,
        agentName: agent.name,
        projectId: project.id,
        projectName: project.name,
        add: !/^(remove|take|drop)$/i.test(staff[1]!),
      };
    }
  }

  // ── new project: "create a project called Guest Checkout (led by Atlas)" ─
  const proj =
    /\b(?:create|start|open|spin\s+up)\s+(?:a\s+)?(?:new\s+)?project\s+(?:called|named)?\s*["“]?([^"”]+?)["”]?(?:\s+led\s+by\s+([A-Za-z][\w-]*))?\s*$/i.exec(
      t,
    );
  if (proj) {
    const lead = proj[2] ? resolveAgent(proj[2]!, agents) : null;
    const name = proj[1]!.trim();
    if (name) {
      return {
        kind: "project",
        name,
        leadId: lead && lead !== "ceo" ? lead.id : null,
        leadName: lead && lead !== "ceo" ? lead.name : undefined,
      };
    }
  }

  // ── reporting change: "make X report to Y" / "X reports to Y" ────────────
  const rep =
    /\b(?:make|have|set|move)?\s*([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)?)\s+(?:now\s+)?reports?\s+to\s+([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)?|me|you|the\s+ceo)\b/i.exec(
      t,
    );
  if (rep) {
    const agent = resolveAgent(rep[1]!, agents);
    const manager = resolveAgent(rep[2]!, agents);
    if (agent && agent !== "ceo" && manager) {
      return {
        kind: "reparent",
        agentId: agent.id,
        agentName: agent.name,
        managerId: manager === "ceo" ? null : manager.id,
        managerName: manager === "ceo" ? "You (CEO)" : manager.name,
      };
    }
  }

  // ── schedule: a cadence phrase + an actor ────────────────────────────────
  const sched = SCHEDULE_RE.exec(t);
  if (sched) {
    let actor: Agent | null = null;
    let behavior = t;
    for (const re of ACTOR_RES) {
      const m = re.exec(t);
      if (m) {
        const found = resolveAgent(m[1]!, agents);
        if (found && found !== "ceo") {
          actor = found;
          behavior = t.slice(m.index + m[0].length);
          break;
        }
      }
    }
    if (actor) {
      behavior = behavior.replace(SCHEDULE_RE, "").replace(/\s{2,}/g, " ").trim();
      behavior = behavior.replace(/^[,.\s]+|[,.\s]+$/g, "");
      const name = titleCase(behavior.split(/\s+/).slice(0, 4).join(" ")) || `Routine for ${actor.name}`;
      return {
        kind: "routine",
        agentId: actor.id,
        agentName: actor.name,
        name,
        rule: sched[1]!.toLowerCase().trim(),
        behavior: behavior || t,
      };
    }
  }

  // ── hire: "hire a QA engineer (named Piper)" ─────────────────────────────
  const hire =
    /\b(?:hire|add|create|recruit|bring\s+on)\s+(?:an?\s+|another\s+)?(?!agent\b)([\w\s/&-]{3,40}?)(?:\s+named\s+([A-Z][\w-]*)|\s+called\s+([A-Z][\w-]*))?\s*$/i.exec(
      t,
    );
  if (hire && /\b(hire|recruit|bring\s+on)\b/i.test(t)) {
    const role = hire[1]!.trim().replace(/\s+agent$/i, "");
    return { kind: "hire", role, name: hire[2] ?? hire[3] };
  }

  return { kind: "delegate", text: t };
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A one-line human reading of a proposal, for the draft card. */
export function describeProposal(p: Proposal): string {
  switch (p.kind) {
    case "routine":
      return `${p.agentName} · ${p.rule}`;
    case "reparent":
      return `${p.agentName} now reports to ${p.managerName}`;
    case "hire":
      return `Hire ${p.name ? `${p.name}, ` : ""}a ${p.role}`;
    case "staff":
      return p.add
        ? `Add ${p.agentName} to ${p.projectName}`
        : `Remove ${p.agentName} from ${p.projectName}`;
    case "project":
      return `Create project “${p.name}”${p.leadName ? ` · led by ${p.leadName}` : ""}`;
    case "delegate":
      return "Send to Aular to figure out";
  }
}

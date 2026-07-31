import type { Agent } from "./types";
import type { WorkflowArtifact } from "./workflow";

/**
 * The org, as data — the single declarative source of truth the canvas renders.
 *
 * The AULAR system agent's job becomes "keep this spec correct"; the canvas is a
 * pure function of it (parse → compile a view → lay out with ELK → render +
 * animate). Everything drawn — the hierarchy, each agent's capabilities, the
 * schedules, the workflows — lives here, modeled on CrewAI's declarative
 * agents/tasks/flows.
 */
export interface OrgSpec {
  version: number;
  founder: { name: string; role: string };
  agents: OrgAgent[];
  schedules: OrgSchedule[];
  workflows: OrgWorkflow[];
}

export interface OrgAgent {
  id: string;
  name: string;
  role: string;
  /** The agent this one reports to; null = the founder. */
  reports_to: string | null;
  tools: string[];
  skills: string[];
  apps: string[];
}

export interface OrgSchedule {
  id: string;
  /** The agent it runs. */
  agent: string;
  cadence: string;
  does: string;
}

export type WfNodeKind = "trigger" | "action" | "decision" | "delivery" | "artifact" | "alert";

export interface OrgWorkflow {
  id: string;
  /** The agent that owns/runs the workflow. */
  owner: string;
  /** Optional schedule id that fires it. */
  trigger?: string;
  nodes: { id: string; kind: WfNodeKind; label: string; status?: string }[];
  edges: { from: string; to: string; when?: string }[];
}

const APP_TOOLS = [
  "slack", "github", "gitlab", "gmail", "google", "notion", "linear", "jira",
  "figma", "drive", "calendar", "discord", "sheets", "docs", "trello", "asana",
  "zoom", "stripe", "salesforce", "hubspot", "twilio", "airtable", "confluence",
  "dropbox", "teams", "outlook", "webhook",
];
const isApp = (t: string) => {
  const s = t.toLowerCase();
  return APP_TOOLS.some((a) => s.includes(a));
};

const WF_KINDS: WfNodeKind[] = ["trigger", "action", "decision", "delivery", "artifact", "alert"];

/**
 * Seed a spec from the live app state — the founder plus every agent (tools split
 * into local tools vs connected apps, skills resolved), the routines as
 * schedules, and the stored workflows. This is the initial source of truth; the
 * agent patches it from here.
 */
export function buildOrgSpec(input: {
  founderName: string;
  agents: Agent[];
  skillsOf: (a: Agent) => string[];
  schedules: OrgSchedule[];
  workflows: Record<string, WorkflowArtifact[]>;
}): OrgSpec {
  const agents: OrgAgent[] = input.agents.map((a) => {
    const tools = a.default_tools ?? [];
    return {
      id: a.id,
      name: a.name,
      role: a.role,
      reports_to: a.reports_to || null,
      tools: tools.filter((t) => !isApp(t)),
      apps: tools.filter(isApp),
      skills: input.skillsOf(a),
    };
  });

  const workflows: OrgWorkflow[] = [];
  for (const [owner, list] of Object.entries(input.workflows)) {
    for (const wf of list) {
      workflows.push({
        id: wf.id,
        owner,
        nodes: wf.nodes.map((n) => ({
          id: n.id,
          kind: (WF_KINDS.includes(n.kind as WfNodeKind) ? n.kind : "action") as WfNodeKind,
          label: n.label,
          status: n.status,
        })),
        edges: wf.edges.map((e) => ({ from: e.from, to: e.to, when: e.condition })),
      });
    }
  }

  return {
    version: 1,
    founder: { name: input.founderName, role: "Founder · CEO" },
    agents,
    schedules: input.schedules,
    workflows,
  };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isStr = (v: unknown): v is string => typeof v === "string";
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr) : []);

/**
 * Validate an unknown value (e.g. an agent-emitted YAML/JSON spec, parsed to an
 * object) into a typed OrgSpec, or null if it isn't one. Lenient on optional
 * fields, strict on the shape that would otherwise crash the renderer.
 */
export function parseOrgSpec(data: unknown): OrgSpec | null {
  if (!isRec(data) || !Array.isArray(data.agents)) return null;

  const founder = isRec(data.founder) ? data.founder : {};
  const agents: OrgAgent[] = [];
  const ids = new Set<string>();
  for (const raw of data.agents) {
    if (!isRec(raw) || !isStr(raw.id) || !isStr(raw.name) || ids.has(raw.id)) return null;
    ids.add(raw.id);
    agents.push({
      id: raw.id,
      name: raw.name,
      role: isStr(raw.role) ? raw.role : "Agent",
      reports_to: isStr(raw.reports_to) && ids.has(raw.reports_to) ? raw.reports_to : (isStr(raw.reports_to) ? raw.reports_to : null),
      tools: strArr(raw.tools),
      skills: strArr(raw.skills),
      apps: strArr(raw.apps),
    });
  }

  const schedules: OrgSchedule[] = [];
  for (const raw of Array.isArray(data.schedules) ? data.schedules : []) {
    if (isRec(raw) && isStr(raw.id) && isStr(raw.agent)) {
      schedules.push({
        id: raw.id,
        agent: raw.agent,
        cadence: isStr(raw.cadence) ? raw.cadence : "",
        does: isStr(raw.does) ? raw.does : "",
      });
    }
  }

  const workflows: OrgWorkflow[] = [];
  for (const raw of Array.isArray(data.workflows) ? data.workflows : []) {
    if (!isRec(raw) || !isStr(raw.id) || !isStr(raw.owner) || !Array.isArray(raw.nodes)) continue;
    const nodes = raw.nodes.flatMap((n) =>
      isRec(n) && isStr(n.id) && isStr(n.label)
        ? [{
            id: n.id,
            kind: (WF_KINDS.includes(n.kind as WfNodeKind) ? n.kind : "action") as WfNodeKind,
            label: n.label,
            status: isStr(n.status) ? n.status : undefined,
          }]
        : [],
    );
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = (Array.isArray(raw.edges) ? raw.edges : []).flatMap((e) =>
      isRec(e) && isStr(e.from) && isStr(e.to) && nodeIds.has(e.from) && nodeIds.has(e.to)
        ? [{ from: e.from, to: e.to, when: isStr(e.when) ? e.when : undefined }]
        : [],
    );
    workflows.push({ id: raw.id, owner: raw.owner, trigger: isStr(raw.trigger) ? raw.trigger : undefined, nodes, edges });
  }

  return {
    version: typeof data.version === "number" ? data.version : 1,
    founder: {
      name: isStr(founder.name) ? founder.name : "You",
      role: isStr(founder.role) ? founder.role : "Founder · CEO",
    },
    agents,
    schedules,
    workflows,
  };
}

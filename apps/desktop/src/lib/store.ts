import { createStore, produce } from "solid-js/store";

import { api, openRealtime } from "./api";
import type {
  Agent,
  ApiProject,
  AuthUser,
  Brief,
  Conversation,
  Health,
  MediaDescriptor,
  Message,
  ModelSettings,
  PhaseState,
  Project,
  ProjectStatus,
  RealtimeEvent,
  RuntimeStatus,
  Task,
  ToolCall,
} from "./types";
import { TERMINAL_TASK_STATES } from "./types";
import type { Proposal } from "./intent";
import { parseWorkflowArtifact, type WorkflowArtifact } from "./workflow";
import { focusComposer } from "./window";

/**
 * The app's state.
 *
 * Shaped like the prototype's store, because that shape was earned: realtime
 * and REST both write here, and keeping per-agent view state (unread, preview,
 * typing) separate from the message log is what stops them fighting.
 */
export type Register =
  | "chat"
  | "work"
  | "org"
  | "knowledge"
  /** A single project in full. There is no "all projects" screen — the rail is
   *  the switcher, and a list of what the rail already shows is furniture. */
  | "overview"
  | "roadmap"
  | "calendar";

/** The settings section to land on — set by whatever sent you there. */
export type SettingsSection =
  | "general"
  | "appearance"
  | "chats"
  | "model"
  | "usage"
  | "memory"
  | "about";

/**
 * One stop in the view history — what back/forward walk through.
 *
 * The project belongs here as much as the register does: the rail switches
 * *which org you're looking at*, so a stop that only remembered the register
 * would replay the right surface scoped to the wrong team.
 */
export interface View {
  register: Register;
  agentId: string | null;
  projectId: string;
}

/** What the chat list shows beneath an agent's name. */
export interface Preview {
  text: string;
  at: string;
  sender: "user" | "agent" | "system";
}

interface State {
  register: Register;
  /** Settings is a dialog over wherever you are, not a place you navigate to —
   *  closing it puts you back exactly where you were. */
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  user: AuthUser | null;
  health: Health | null;
  runtime: RuntimeStatus | null;
  model: ModelSettings | null;

  agents: Agent[];
  activeAgentId: string | null;
  /** An agent's profile page, opened over the chat register. */
  profileAgentId: string | null;

  /** The org's projects and the active (selected) one. Selecting re-scopes the
   *  app to its team — no detail page; the card expands in place. Frontend-only
   *  for now (seeded client-side). */
  projects: Project[];
  activeProjectId: string;

  /** A proposal the AULAR system agent has drafted but not yet applied — the
   *  ghost that materializes in the target section (a project card, a schedule
   *  row) until you Apply or Discard it. */
  draft: Proposal | null;

  /** Per-agent workflows (n8n-style graphs), drawn on the org canvas when an
   *  agent is focused. Seeded illustratively; real ones arrive as chat
   *  artifacts (captured from the agent's `<<<AULAR_WORKFLOW>>>` replies).
   *  Keyed by the owning agent's id. */
  workflows: Record<string, WorkflowArtifact[]>;

  /** A workflow opened onto the org canvas. Global rather than the org panel's
   *  own state because the minimap that opens it lives in messages, and a
   *  message can be read from any register — opening one is a navigation. */
  workflowView: WorkflowArtifact | null;

  /** The builder rail beside the org chart — expanded by default, remembered.
   *  Global because every "hire an agent" button in the app expands it. */
  orgChatOpen: boolean;

  /** Per-agent skills and user-authored catalog entries — the config page's
   *  node graph. Frontend-only until skills get a backend model. */
  agentSkills: Record<string, string[]>;
  customSkills: string[];

  /** agent id → the conversation currently OPEN for them, and the reverse.
   *  An agent can have many threads (see `threads`); this is the one on
   *  screen, and switching sessions moves it. */
  conversationOf: Record<string, string>;
  agentOf: Record<string, string>;
  /** agent id → every thread you've had with them, newest activity first.
   *  The header's session switcher reads this; `openAgent` fills it. */
  threads: Record<string, Conversation[]>;

  messages: Record<string, Message[]>;
  toolCalls: Record<string, ToolCall[]>;

  /** The org's work: task id → task, A2A-stated. Fed by boot + task.updated. */
  tasks: Record<string, Task>;

  /** Typed agent reports: brief id → brief. */
  briefs: Record<string, Brief>;

  /** per-agent chat-list state */
  unread: Record<string, number>;
  preview: Record<string, Preview>;

  /** conversation id → the agent is working right now */
  working: Record<string, boolean>;
  /** message id → still streaming in */
  streaming: Record<string, boolean>;

  /** the message being replied to, and a staged attachment */
  replyTo: Message | null;
  attachment: MediaDescriptor | null;

  /** Where you've been, and where you are in it. */
  history: View[];
  historyAt: number;

  error: string | null;
}

/**
 * The organization itself, as a project — every agent, always.
 *
 * This is the rail's home tile: Discord's DM button, holding the whole company
 * rather than one project's slice of it. Every other tile is a real project.
 */
export const HOME_PROJECT: Project = {
  id: "proj-default",
  name: "Your Organization",
  status: "active",
  objective: "Everyone on your team, in one place.",
  leadId: null,
  due: null,
  team: [],
  allAgents: true,
  progress: 0,
};

/** A project backed by a real core-api row — safe to PATCH/persist. The default
 *  "everyone" project and locally-created ones (older backend) are client-only. */
const isPersistedProject = (id: string) => id !== HOME_PROJECT.id && !id.startsWith("local-");

/**
 * One illustrative workflow, so a focused agent's canvas shows a real n8n-style
 * flow before agents author their own. Trigger → fetch → decision → alert/report
 * — the shape of a scheduled brief. Attached to the first staff agent (or the
 * system agent when the org is still empty).
 */
function seedSampleWorkflows(agents: Agent[]): Record<string, WorkflowArtifact[]> {
  const target =
    agents.find((a) => a.role !== "system") ?? agents.find((a) => a.role === "system");
  if (!target) return {};
  const wf: WorkflowArtifact = {
    id: `wf-${target.id}-brief`,
    title: "Morning intelligence brief",
    owner: target.name,
    schedule: "Weekdays · 09:00",
    status: "ready",
    nodes: [
      { id: "trigger", label: "Weekday 09:00", kind: "trigger", status: "complete" },
      { id: "fetch", label: "Fetch sources", kind: "action", owner: target.name, status: "running" },
      { id: "decide", label: "Anything urgent?", kind: "decision", status: "waiting" },
      { id: "alert", label: "Alert you", kind: "alert", status: "waiting" },
      { id: "report", label: "Daily digest", kind: "artifact", status: "waiting" },
    ],
    edges: [
      { from: "trigger", to: "fetch" },
      { from: "fetch", to: "decide" },
      { from: "decide", to: "alert", condition: "critical", label: "urgent" },
      { from: "decide", to: "report", condition: "no", label: "else" },
    ],
  };
  return { [target.id]: [wf] };
}

const PROJECT_STATUSES: ReadonlySet<string> = new Set(["active", "planning", "paused", "done"]);
const PHASE_STATES: ReadonlySet<string> = new Set(["done", "active", "queued", "blocked"]);

/**
 * Map a core-api project onto the richer client Project. Phases now come from
 * the backend (the lead owns them via the ROADMAP block); progress is derived
 * from them — the share of phases done.
 */
function mapProject(p: ApiProject): Project {
  const phases = (p.phases ?? []).map((ph) => ({
    id: ph.id,
    name: ph.name,
    ownerId: ph.owner_id,
    start: ph.start,
    end: ph.end,
    state: (PHASE_STATES.has(ph.state) ? ph.state : "queued") as PhaseState,
  }));
  const doneCount = phases.filter((ph) => ph.state === "done").length;
  return {
    id: p.id,
    name: p.name,
    objective: p.objective,
    status: (PROJECT_STATUSES.has(p.status) ? p.status : "active") as ProjectStatus,
    leadId: p.lead_id,
    due: null,
    team: p.team ?? [],
    phases,
    progress: phases.length ? Math.round((doneCount / phases.length) * 100) : 0,
  };
}

/** Upsert a backend project from a create/update event (carries its phases). */
function upsertProject(p: ApiProject) {
  const m = mapProject(p);
  set("projects", (list) => {
    const idx = list.findIndex((x) => x.id === m.id);
    return idx === -1 ? [...list, m] : list.map((x) => (x.id === m.id ? m : x));
  });
}

const ORG_CHAT_OPEN_KEY = "aular-org-chat-open";
function readOrgChatOpen(): boolean {
  try {
    return localStorage.getItem(ORG_CHAT_OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

const [state, set] = createStore<State>({
  // The design lands you in chat — the pane carries onboarding when the org
  // is empty, so there is no separate Home.
  register: "chat",
  settingsOpen: false,
  settingsSection: "general",
  user: null,
  health: null,
  runtime: null,
  model: null,
  agents: [],
  activeAgentId: null,
  profileAgentId: null,
  projects: [HOME_PROJECT],
  activeProjectId: HOME_PROJECT.id,
  draft: null,
  workflows: {},
  workflowView: null,
  orgChatOpen: readOrgChatOpen(),
  agentSkills: {},
  customSkills: [],
  conversationOf: {},
  threads: {},
  agentOf: {},
  messages: {},
  toolCalls: {},
  tasks: {},
  briefs: {},
  unread: {},
  preview: {},
  working: {},
  streaming: {},
  replyTo: null,
  attachment: null,
  history: [{ register: "chat", agentId: null, projectId: HOME_PROJECT.id }],
  historyAt: 0,
  error: null,
});

export { state };

// Dev-only: the store, inspectable from the console / the UI test harness.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__aular_state = state;
}

let stopRealtime: (() => void) | null = null;

/**
 * True while back/forward are replaying a view, so the replay doesn't record
 * itself as a new stop in the history.
 */
let replaying = false;

/**
 * Record a stop. Callers name the register and agent; the project is stamped
 * from state here, because every call site means "…in the org I'm looking at
 * right now" and threading it through each one would only invite them to
 * disagree.
 */
function pushView(view: Omit<View, "projectId">) {
  if (replaying) return;
  const full: View = { ...view, projectId: state.activeProjectId };
  const current = state.history[state.historyAt];
  if (
    current?.register === full.register &&
    current?.agentId === full.agentId &&
    current?.projectId === full.projectId
  ) {
    return;
  }

  set(
    produce((s: State) => {
      // Moving somewhere new from a rewound history drops the forward branch —
      // the same rule a browser uses.
      s.history = [...s.history.slice(0, s.historyAt + 1), full].slice(-50);
      s.historyAt = s.history.length - 1;
    }),
  );
}

async function replay(index: number) {
  const view = state.history[index];
  if (!view) return;
  replaying = true;
  try {
    set("historyAt", index);
    // The project first: the register and the roster beneath it are both read
    // through it, so restoring it last would flash the right surface scoped to
    // the org we're leaving.
    if (state.projects.some((p) => p.id === view.projectId)) {
      set("activeProjectId", view.projectId);
    }
    set("register", view.register);
    if (view.agentId && view.agentId !== state.activeAgentId) {
      await actions.openAgent(view.agentId);
    }
  } finally {
    replaying = false;
  }
}

/**
 * Insert or merge a message into a thread, keeping it in time order.
 *
 * Events can arrive out of order (a streamed `message.updated` can beat the
 * `message.created` it belongs to), and the same message can arrive twice — via
 * the POST response and again over the socket. Both cases land here: match on
 * id, merge if present, insert in the right place if not.
 */
function upsertMessage(convoId: string, msg: Message) {
  set(
    produce((s: State) => {
      const list = s.messages[convoId] ?? (s.messages[convoId] = []);
      const i = list.findIndex((m) => m.id === msg.id);
      if (i !== -1) {
        list[i] = { ...list[i]!, ...msg };
        return;
      }
      const at = Date.parse(msg.created_at);
      let j = list.length;
      while (j > 0 && Date.parse(list[j - 1]!.created_at) > at) j--;
      list.splice(j, 0, msg);
    }),
  );
}

/**
 * A conversation is only "working" while the server keeps saying so. If a
 * gateway dies mid-turn the activity ping just stops, and without this the row
 * would sit on "typing…" forever. Every ping re-arms it; a reply clears it.
 */
const ACTIVITY_TTL_MS = 12_000;
const activityTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function armActivityTimeout(convoId: string) {
  clearTimeout(activityTimers[convoId]);
  activityTimers[convoId] = setTimeout(() => {
    set("working", convoId, false);
    delete activityTimers[convoId];
  }, ACTIVITY_TTL_MS);
}

function clearWorking(convoId: string) {
  clearTimeout(activityTimers[convoId]);
  delete activityTimers[convoId];
  set("working", convoId, false);
}

/**
 * Previews are read as one plain line, so markdown markers are noise there —
 * "**Decision needed**" must read "Decision needed". Structure-only lines
 * (headings, bullets) keep their text; links keep their label.
 */
/**
 * Heal a reply stored with the retired chunk delimiter.
 *
 * Agents used to be told to split answers on `<<<AULAR_CHUNK>>>` and the app
 * drew each piece as its own message. They aren't any more, but threads written
 * before that change still carry it — as a paragraph break it reads exactly as
 * the one message it always was. Every surface that renders stored content goes
 * through here, or the raw marker leaks into a bubble or a preview line.
 */
export function joinChunks(content: string): string {
  if (!content.includes(CHUNK_DELIMITER)) return content;
  return content
    .split(CHUNK_DELIMITER)
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
}
const CHUNK_DELIMITER = "<<<AULAR_CHUNK>>>";

export function previewText(content: string): string {
  return joinChunks(content)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|\s)[*_]([^*_]+)[*_]/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull a thread's history in. The API returns newest-first; the UI reads
 *  oldest-first. */
async function loadThread(convoId: string) {
  const [msgs, tools] = await Promise.all([
    api.listMessages(convoId),
    api.listToolCalls(convoId).catch(() => []),
  ]);
  set("messages", convoId, (msgs ?? []).slice().reverse());
  set("toolCalls", convoId, (tools ?? []).slice().reverse());
}

/** The chat list's subtitle. An older event must never overwrite a newer one. */
function bumpPreview(agentId: string, msg: Message) {
  const current = state.preview[agentId];
  if (current && current.at > msg.created_at) return;
  set("preview", agentId, {
    text: previewText(msg.content),
    at: msg.created_at,
    sender: msg.sender_type,
  });
}

/**
 * Capture an agent-authored workflow so it lands on the org canvas.
 *
 * A reply can carry a `<<<AULAR_WORKFLOW>>>` artifact; storing it under its owner
 * is the truest "the agent patches the org" — the flow appears on the canvas
 * beneath the agent that runs it, with no separate step. Idempotent: a streamed
 * reply fires many edits, and the same artifact must be stored exactly once.
 */
function captureWorkflow(msg: Message) {
  if (msg.sender_type !== "agent" && msg.sender_type !== "system") return;
  const { workflow } = parseWorkflowArtifact(msg.content.replace(/<<<AULAR_CHUNK>>>/g, "\n\n"));
  if (!workflow) return;
  for (const list of Object.values(state.workflows)) {
    if (list.some((w) => w.id === workflow.id)) return;
  }
  // The artifact names its owner; resolve to the agent id the canvas keys by,
  // falling back to the thread's agent, then the system agent.
  const byName = state.agents.find(
    (a) => a.name.trim().toLowerCase() === workflow.owner.trim().toLowerCase(),
  );
  const ownerId =
    byName?.id ?? state.agentOf[msg.conversation_id] ?? state.agents.find((a) => a.role === "system")?.id;
  if (!ownerId) return;
  set("workflows", ownerId, (list) => [...(list ?? []), workflow]);
}

/** Agent replies, for anything that needs to react to them (notifications). */
type ReplyListener = (message: Message, agentId: string | undefined) => void;
const replyListeners = new Set<ReplyListener>();

export function onAgentReply(fn: ReplyListener): () => void {
  replyListeners.add(fn);
  return () => replyListeners.delete(fn);
}

let runtimePollTimer: ReturnType<typeof setTimeout> | undefined;
let runtimeSawInstalling = false;

export const actions = {
  setUser(user: AuthUser | null) {
    set("user", user);
  },

  setRegister(register: Register) {
    set("register", register);
    set("profileAgentId", null);
    pushView({ register, agentId: state.activeAgentId });
  },

  /** Open a workflow on the org canvas — from its minimap in any register. */
  openWorkflow(workflow: WorkflowArtifact) {
    set("workflowView", workflow);
    if (state.register !== "org") actions.setRegister("org");
  },

  closeWorkflow() {
    set("workflowView", null);
  },

  setOrgChatOpen(open: boolean) {
    set("orgChatOpen", open);
    try {
      localStorage.setItem(ORG_CHAT_OPEN_KEY, open ? "1" : "0");
    } catch {
      /* private mode */
    }
  },

  /**
   * Every "hire an agent" button in the app lands here: the org chart with
   * the builder rail expanded and the cursor in its composer. You describe
   * the hire — "hire a QA engineer named Piper" — and it becomes a draft or
   * a turn, which replaced the form-filling modal.
   */
  hireAgent() {
    actions.setOrgChatOpen(true);
    if (state.register !== "org") actions.setRegister("org");
    // After the register switch has mounted the rail's composer, so the
    // focus lands on the visible one (listeners run in mount order).
    queueMicrotask(focusComposer);
  },

  /**
   * Open an agent's chat from anywhere. The design's sidebar is always present,
   * so clicking an agent from the Org or Projects view must both switch to the
   * chat register and load the thread — this is the one call that does both.
   */
  openChat(agentId: string) {
    set("profileAgentId", null);
    set("register", "chat");
    void actions.openAgent(agentId);
  },

  /** The agent's profile page — a place, not a popup. Lives over chat. */
  openProfile(agentId: string) {
    set("register", "chat");
    set("profileAgentId", agentId);
  },

  // ── projects ────────────────────────────────────────────────────────────
  /**
   * Switch the active project — what clicking a rail tile does.
   *
   * Discord drops you in the server's first channel, not in a DM with whoever
   * runs it, and that's the right rule here too: you came to see the *project*.
   * So we land on its general channel — the system agent, which belongs to every
   * team and is where you talk the project into shape. Only if that's somehow
   * missing do we fall back to the lead.
   *
   * The project is set before the chat opens, so the view stop records the org
   * you're arriving in rather than the one you left.
   */
  setActiveProject(id: string) {
    set("activeProjectId", id);
    const general = state.agents.find((a) => a.role === "system");
    const p = state.projects.find((x) => x.id === id);
    const lead = p?.leadId && state.agents.some((a) => a.id === p.leadId) ? p.leadId : null;
    const land = general?.id ?? lead;
    if (land) actions.openChat(land);
  },

  /**
   * Select a project from the grid: re-scope the app to its team, without
   * leaving the Projects register (the card expands in place). Distinct from
   * setActiveProject, which the sidebar switcher uses to drop you in the lead's
   * chat.
   */
  selectProject(id: string) {
    set("activeProjectId", id);
  },

  /**
   * The AULAR agent has drafted a change — hold it as a ghost, and jump to the
   * section where it will materialize so the user watches it land. Passing null
   * clears the draft (applied or discarded).
   */
  reflectDraft(p: Proposal | null) {
    set("draft", p);
    // Jump to the section where the ghost will land, so the user watches it.
    const to: Register | null =
      p?.kind === "project" ? "overview" : p?.kind === "routine" ? "calendar" : null;
    if (to && state.register !== to) actions.setRegister(to);
  },
  clearDraft() {
    set("draft", null);
  },

  /** Create a real project on the backend, then select it. (AULAR creates via
   *  the PROJECT block; this is the user's own hand — the new-project dialog and
   *  the "create a project" prompt draft.) */
  async createProject(input: {
    name: string;
    objective: string;
    leadId: string | null;
    due: string | null;
  }): Promise<Project> {
    const name = input.name.trim() || "Untitled project";
    const objective = input.objective.trim();
    const team = input.leadId ? [input.leadId] : [];

    // Persist through core-api when it's reachable. If the route is missing (an
    // older backend build) or the call fails, still add the project locally so
    // the button always works — the AULAR agent can create projects too, but
    // this manual path must never depend on it or on the backend being current.
    let created: ApiProject | null = null;
    try {
      created = await api.createProject({ name, objective, lead_id: input.leadId ?? undefined, team });
    } catch {
      created = null;
    }

    const project: Project = created
      ? mapProject(created)
      : {
          id: `local-${crypto.randomUUID()}`,
          name,
          objective,
          status: "active",
          leadId: input.leadId ?? null,
          due: input.due ?? null,
          team,
          progress: 0,
        };
    set("projects", (list) => (list.some((x) => x.id === project.id) ? list : [...list, project]));
    // A new project earns a rail tile — land in it, the way Discord drops you
    // into a server the moment you make one.
    actions.setActiveProject(project.id);
    return project;
  },

  /** Edit a project's basic fields — optimistic, then persisted for real
   *  projects. The default "everyone" project and any local-only ones stay
   *  client-side. Empty/blank patches are ignored (a rename can't clear a name). */
  editProject(id: string, patch: { name?: string; objective?: string; status?: ProjectStatus }) {
    const name = patch.name?.trim();
    if (patch.name !== undefined && !name) return; // never let a project go nameless
    set(
      "projects",
      (p) => p.id === id,
      produce((proj: Project) => {
        if (name !== undefined) proj.name = name;
        if (patch.objective !== undefined) proj.objective = patch.objective.trim();
        if (patch.status !== undefined) proj.status = patch.status;
      }),
    );
    if (isPersistedProject(id)) {
      void api
        .updateProject(id, { ...patch, ...(name !== undefined ? { name } : {}) })
        .catch(() => {});
    }
  },

  /** Add or remove an agent from a project's team (the assign chips) — optimistic,
   *  then persisted for real projects (the default "everyone" project is client-only). */
  toggleProjectMember(projectId: string, agentId: string) {
    let next: string[] = [];
    set(
      "projects",
      (p) => p.id === projectId,
      "team",
      (team) => {
        next = team.includes(agentId) ? team.filter((x) => x !== agentId) : [...team, agentId];
        return next;
      },
    );
    if (isPersistedProject(projectId)) {
      void api.updateProject(projectId, { team: next }).catch(() => {});
    }
  },

  // ── capabilities (frontend-only until skills get a backend model) ─────────
  /** Replace an agent's skill list — the node graph's connect/disconnect. */
  setAgentSkills(agentId: string, skills: string[]) {
    set("agentSkills", agentId, skills);
  },

  /** A user-authored skill: into the catalog, and onto this agent. */
  addCustomSkill(agentId: string, name: string, current: string[]) {
    const skill = name.trim();
    if (!skill) return;
    if (!state.customSkills.includes(skill)) {
      set("customSkills", (list) => [...list, skill]);
    }
    if (!current.includes(skill)) {
      set("agentSkills", agentId, [...current, skill]);
    }
  },
  closeProfile() {
    set("profileAgentId", null);
  },

  /** Open Settings on a particular section — used by the composer's model badge
   *  and anything else that points at a specific setting. */
  openSettings(section: SettingsSection) {
    set("settingsSection", section);
    set("settingsOpen", true);
  },

  closeSettings() {
    set("settingsOpen", false);
  },

  back() {
    if (canGoBack()) void replay(state.historyAt - 1);
  },

  forward() {
    if (canGoForward()) void replay(state.historyAt + 1);
  },

  /**
   * Everything the app needs once signed in. Conversations carry the chat
   * list's unread counts and last-message previews, so the whole list loads in
   * one round-trip instead of one per row.
   */
  async load() {
    const [health, agents, convos, model, tasks, briefs, projectsList] = await Promise.all([
      api.health().catch(() => null),
      api.listAgents(),
      api.listConversations().then((c) => c ?? []),
      api.getModelSettings().catch(() => null),
      api.listTasks().then((t) => t ?? []).catch(() => []),
      api.listBriefs().then((b) => b ?? []).catch(() => []),
      api.listProjects().then((p) => p ?? []).catch(() => []),
    ]);

    set(
      produce((s: State) => {
        s.health = health;
        s.agents = agents;
        s.model = model;
        s.error = null;
        // Real projects from the backend (AULAR creates them via the PROJECT
        // block + names a lead); the default "everyone" project stays at head.
        s.projects = [HOME_PROJECT, ...projectsList.map(mapProject)];
        // Seed one illustrative workflow so a focused agent has a flow to show.
        if (Object.keys(s.workflows).length === 0) {
          s.workflows = seedSampleWorkflows(agents);
        }
        s.tasks = Object.fromEntries(tasks.map((t) => [t.id, t]));
        s.briefs = Object.fromEntries(briefs.map((b) => [b.id, b]));
        // The list is newest-activity first, and an agent can have several
        // threads. First one wins — overwriting bound every agent to its
        // OLDEST conversation, with a stale preview and unread count to match.
        for (const c of convos) {
          s.agentOf[c.id] = c.agent_profile_id;
          (s.threads[c.agent_profile_id] ??= []).push(c);
          if (c.agent_profile_id in s.conversationOf) continue;
          s.conversationOf[c.agent_profile_id] = c.id;
          s.unread[c.agent_profile_id] = c.unread_count ?? 0;
          if (c.last_message && c.last_message_at) {
            s.preview[c.agent_profile_id] = {
              text: previewText(c.last_message),
              at: c.last_message_at,
              sender: (c.last_message_sender as Preview["sender"]) ?? "agent",
            };
          }
        }
      }),
    );

    stopRealtime?.();
    stopRealtime = openRealtime(handleEvent);
    void actions.refreshRuntime();
  },

  /** Re-sync after a dropped socket — the prototype's fix for stuck rows. */
  async resync() {
    try {
      await actions.load();
      const id = activeConversationId();
      if (id) {
        const msgs = await api.listMessages(id);
        set("messages", id, (msgs ?? []).slice().reverse());
      }
    } catch {
      /* offline; the socket will retry */
    }
  },

  async signOut() {
    stopRealtime?.();
    stopRealtime = null;
    await api.logout();
    set({
      user: null,
      agents: [],
      activeAgentId: null,
      messages: {},
      toolCalls: {},
      unread: {},
      preview: {},
      // Conversations belong to the account, so they go with it. These used to
      // survive a sign-out and the next account inherited the last one's
      // thread map — harmless only because ids differ between users.
      conversationOf: {},
      agentOf: {},
      threads: {},
    });
  },

  /** Open an agent: resolve (or start) its conversation and pull its history. */
  async openAgent(agentId: string) {
    set("activeAgentId", agentId);
    pushView({ register: state.register, agentId });
    let convoId = state.conversationOf[agentId];

    // Always refresh the thread list — it feeds the header's session switcher,
    // and a thread started on another device should show up here.
    const existing = (await api.listConversations(agentId).catch(() => null)) ?? [];
    if (existing.length) {
      set("threads", agentId, existing);
      for (const c of existing) set("agentOf", c.id, agentId);
    }

    if (!convoId) {
      const convo = existing[0] ?? (await api.createConversation(agentId));
      convoId = convo.id;
      if (!existing.length) set("threads", agentId, [convo]);
      set("conversationOf", agentId, convoId);
      set("agentOf", convoId, agentId);
    }

    await loadThread(convoId);
    void api.markAgentRead(agentId).catch(() => {});
    set("unread", agentId, 0);
  },

  /**
   * Start a fresh session with an agent.
   *
   * A new thread rather than a new agent: same persona, same tools, an empty
   * context window. The gateway treats each conversation as its own session,
   * so this is how you change subject without dragging the old one along.
   */
  async newConversation(agentId: string) {
    const convo = await api.createConversation(agentId);
    set("threads", agentId, (list) => [convo, ...(list ?? [])]);
    set("agentOf", convo.id, agentId);
    set("conversationOf", agentId, convo.id);
    set("messages", convo.id, []);
    set("toolCalls", convo.id, []);
    if (state.activeAgentId !== agentId) set("activeAgentId", agentId);
    focusComposer();
    return convo;
  },

  /** Switch which of an agent's threads is on screen. */
  async openConversation(agentId: string, convoId: string) {
    if (state.conversationOf[agentId] === convoId) return;
    set("conversationOf", agentId, convoId);
    set("agentOf", convoId, agentId);
    if (state.activeAgentId !== agentId) set("activeAgentId", agentId);
    await loadThread(convoId);
  },

  async renameConversation(convoId: string, title: string) {
    const agentId = state.agentOf[convoId];
    if (!agentId) return;
    // Optimistic: the title is yours, and a round trip to see your own typing
    // land is the kind of lag that makes a rename feel broken.
    set("threads", agentId, (list) =>
      (list ?? []).map((c) => (c.id === convoId ? { ...c, title } : c)),
    );
    try {
      await api.renameConversation(convoId, title);
    } catch (e) {
      set("error", (e as Error).message);
    }
  },

  /**
   * Delete a thread, and land somewhere sensible.
   *
   * Deleting the one you're reading has to leave you *somewhere*: the next
   * thread if there is one, a fresh session if that was the last.
   */
  async deleteConversation(convoId: string) {
    const agentId = state.agentOf[convoId];
    if (!agentId) return;
    try {
      await api.deleteConversation(convoId);
    } catch (e) {
      set("error", (e as Error).message);
      return;
    }
    const rest = (state.threads[agentId] ?? []).filter((c) => c.id !== convoId);
    set("threads", agentId, rest);
    set("messages", convoId, undefined as unknown as Message[]);
    set("toolCalls", convoId, undefined as unknown as ToolCall[]);

    if (state.conversationOf[agentId] !== convoId) return;
    if (rest[0]) {
      set("conversationOf", agentId, rest[0].id);
      await loadThread(rest[0].id);
    } else {
      await actions.newConversation(agentId);
    }
  },

  /**
   * Send a turn.
   *
   * The reply arrives over the socket, but *your* message must not wait for it:
   * the POST already returns the stored message, so it goes into the thread as
   * soon as it exists. Anything else means typing into a void whenever the
   * socket is slow — or, if it's down, until something else happens to refetch.
   * The realtime `message.created` for the same id is a no-op (deduped).
   */
  async send(content: string) {
    const agentId = state.activeAgentId;
    if (!agentId) return;
    const convoId = state.conversationOf[agentId];
    if (!convoId) return;

    const media = state.attachment ? [state.attachment] : undefined;
    const replyTo = state.replyTo?.id;

    set({ replyTo: null, attachment: null });
    set("working", convoId, true);
    armActivityTimeout(convoId);

    try {
      const { user_message } = await api.sendMessage(convoId, content, replyTo, media);
      if (user_message) upsertMessage(convoId, user_message);
    } catch (e) {
      set("working", convoId, false);
      set("error", (e as Error).message);
    }
  },

  async deleteMessage(m: Message) {
    try {
      await api.deleteMessage(m.conversation_id, m.id);
    } catch (e) {
      set("error", (e as Error).message);
    }
  },

  /** Answer an input-required task; the worker resumes with it. */
  async answerTask(id: string, content: string) {
    const t = await api.answerTask(id, content);
    set("tasks", id, t);
    return t;
  },

  /** Answer a decision brief — the agent resumes on that basis. */
  async answerBrief(id: string, answer: string) {
    const b = await api.answerBrief(id, answer);
    set("briefs", id, b);
    return b;
  },

  async cancelTask(id: string) {
    const t = await api.cancelTask(id);
    set("tasks", id, t);
    return t;
  },

  setReplyTo(m: Message | null) {
    set("replyTo", m);
  },

  async attach(file: File) {
    try {
      const descriptor = await api.uploadMedia(file);
      set("attachment", descriptor);
    } catch (e) {
      set("error", (e as Error).message);
    }
  },

  clearAttachment() {
    set("attachment", null);
  },

  async createAgent(input: Partial<Agent>) {
    const agent = await api.createAgent(input);
    // Dedup: the realtime `agent.created` for this same id may already have
    // landed before the POST resolved, so the optimistic add must guard too.
    set("agents", (list) =>
      list.some((a) => a.id === agent.id) ? list : [...list, agent],
    );
    return agent;
  },

  async updateAgent(id: string, patch: Partial<Agent>) {
    const agent = await api.updateAgent(id, patch);
    set("agents", (a) => a.id === id, agent);
    return agent;
  },

  async deleteAgent(id: string) {
    await api.deleteAgent(id);
    set("agents", (list) => list.filter((a) => a.id !== id));
    if (state.activeAgentId === id) set("activeAgentId", null);
  },

  /** Re-read the model config (after a sign-in flow changed it). */
  async refreshModel() {
    const m = await api.getModelSettings().catch(() => null);
    set("model", m);
    return m;
  },

  /**
   * The agent runtime's state — ONE poll loop for the whole app. Onboarding
   * renders in two places (Home's empty state and the chat pane's); when
   * each held its own install state, clicking Install in one left the other
   * showing an idle card while the install ran invisibly.
   */
  async refreshRuntime() {
    clearTimeout(runtimePollTimer);
    try {
      const st = await api.runtimeStatus();
      set("runtime", st);
      const stage = st.install.stage;
      const installing =
        stage === "uv" || stage === "python" || stage === "hermes" || stage === "verify";
      if (!st.installed && installing) {
        runtimeSawInstalling = true;
        runtimePollTimer = setTimeout(() => void actions.refreshRuntime(), 2500);
      } else if (st.installed && stage === "done" && runtimeSawInstalling) {
        // A watched install just finished — bring the gateway up without an
        // app relaunch.
        runtimeSawInstalling = false;
        await actions.restartAgentRuntime();
      }
    } catch {
      // An older backend without the endpoint: treat as installed (it is —
      // that backend only exists where Hermes already runs).
      set("runtime", { installed: true, gateway_up: true, install: { stage: "idle" } });
    }
  },

  /** Start (or join) the runtime install, then follow it via the poll loop. */
  async installRuntime() {
    await api.runtimeInstall().catch(() => undefined);
    await actions.refreshRuntime();
  },

  /**
   * Restart the gateway — the process that actually thinks. The gateway
   * loads credentials and model config at start, so every successful model
   * connect calls this; without it the user talks to a gateway that booted
   * before their sign-in existed ("Provider authentication failed").
   * Packaged app only; the dev browser's stack manages its own gateway.
   */
  async restartAgentRuntime() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("restart_agent_runtime");
    } catch {
      /* dev browser */
    }
  },

  /** Save a model choice; partial input merges over what's configured. */
  async updateModel(input: Partial<Parameters<typeof api.updateModelSettings>[0]>) {
    const current = state.model;
    const res = await api.updateModelSettings({
      provider: input.provider ?? current?.provider ?? "",
      model: input.model ?? current?.model ?? "",
      ...(input.base_url !== undefined ? { base_url: input.base_url } : {}),
      ...(input.api_mode !== undefined ? { api_mode: input.api_mode } : {}),
      ...(input.api_key ? { api_key: input.api_key } : {}),
    });
    set("model", res.config);
    return res;
  },

  async saveModel(input: Parameters<typeof api.updateModelSettings>[0]) {
    const res = await api.updateModelSettings(input);
    set("model", res.config);
    return res;
  },

  setError(message: string | null) {
    set("error", message);
  },
};

/** Realtime → store. Streaming replies grow a message in place. */
function handleEvent(e: RealtimeEvent) {
  const convoId = e.conversation_id ?? e.data?.conversation_id;

  switch (e.type) {
    case "message.created": {
      const msg = e.data as Message;
      if (!convoId) return;

      upsertMessage(convoId, msg);

      // Any output from the other side ends the turn for *that* conversation,
      // whether or not you're looking at it.
      if (msg.sender_type !== "user") clearWorking(convoId);

      const agentId = state.agentOf[convoId];
      if (agentId) {
        bumpPreview(agentId, msg);
        if (msg.sender_type !== "user") {
          if (state.activeAgentId === agentId) {
            // You're reading it as it lands, so tell the server that — otherwise
            // it comes back unread on the next launch.
            void api.markAgentRead(agentId).catch(() => {});
          } else {
            set("unread", agentId, (n) => (n ?? 0) + 1);
          }
        }
      }

      if (msg.sender_type === "agent") {
        for (const fn of replyListeners) fn(msg, agentId);
      }
      captureWorkflow(msg);
      return;
    }

    case "message.updated": {
      const msg = e.data as Message & { streaming?: boolean };
      if (!convoId) return;

      // core-api re-sends the full text of the message on every edit, so this
      // is a replace, not an append. The cursor lives on until the finalizing
      // edit arrives with streaming=false.
      upsertMessage(convoId, msg);
      set("streaming", msg.id, !!msg.streaming);

      const agentId = state.agentOf[convoId];
      if (agentId) bumpPreview(agentId, msg);

      // A finalized reply means the agent is done — even if we never saw the
      // message.created that normally clears this (a brief socket drop used to
      // leave the row stuck on "typing…").
      if (!msg.streaming) {
        clearWorking(convoId);
        captureWorkflow(msg);
      }
      return;
    }

    case "message.deleted": {
      const id = e.data?.id as string | undefined;
      if (!convoId || !id) return;
      set("messages", convoId, (list) => (list ?? []).filter((m) => m.id !== id));
      return;
    }

    case "agent.activity": {
      if (!convoId) return;
      if (e.data?.state === "working") {
        set("working", convoId, true);
        armActivityTimeout(convoId);
      } else {
        clearWorking(convoId);
      }
      return;
    }

    case "tool_call.started":
    case "tool_call.updated": {
      const tc = e.data as ToolCall;
      if (!tc?.conversation_id) return;
      set(
        produce((s: State) => {
          const list =
            s.toolCalls[tc.conversation_id] ?? (s.toolCalls[tc.conversation_id] = []);
          const i = list.findIndex((t) => t.id === tc.id);
          if (i === -1) list.push(tc);
          else list[i] = tc;
        }),
      );
      return;
    }

    case "task.updated": {
      const t = e.data as Task;
      if (!t?.id) return;
      set("tasks", t.id, t);
      return;
    }

    case "brief.created":
    case "brief.updated": {
      const b = e.data as Brief;
      if (!b?.id) return;
      set("briefs", b.id, b);
      return;
    }

    case "agent.created": {
      const agent = e.data as Agent;
      set("agents", (list) =>
        list.some((a) => a.id === agent.id) ? list : [...list, agent],
      );
      return;
    }

    case "agent.updated": {
      const agent = e.data as Agent;
      set("agents", (a) => a.id === agent.id, agent);
      return;
    }

    case "project.created":
    case "project.updated": {
      const p = e.data as ApiProject;
      if (p?.id) upsertProject(p);
      return;
    }
  }
}

// ── selectors ───────────────────────────────────────────────────────────────

export const activeConversationId = () =>
  state.activeAgentId ? state.conversationOf[state.activeAgentId] : undefined;

// ── projects ──────────────────────────────────────────────────────────────

/** The active project, falling back to the default if the id ever dangles. */
export const activeProject = (): Project =>
  state.projects.find((p) => p.id === state.activeProjectId) ??
  state.projects[0] ??
  HOME_PROJECT;

/** On the rail's home tile — the whole company rather than one project's slice. */
export const atHome = (): boolean => activeProject().allAgents === true;

/** Real projects, in rail order. Home is a tile of its own, not one of these. */
export const railProjects = (): Project[] => state.projects.filter((p) => !p.allAgents);

/** An agent's project membership. The system agent is always in scope — it is
 *  how you build any team, so it belongs to every project. */
export const isProjectMember = (project: Project, agent: Agent): boolean =>
  agent.role === "system" || project.allAgents === true || project.team.includes(agent.id);

/**
 * Unread waiting in a project — the rail tile's badge.
 *
 * The sum over its team, and the system agent is deliberately left out: it
 * belongs to every project, so counting it would light up every tile at once
 * for one message.
 */
export const projectUnread = (project: Project): number =>
  state.agents.reduce(
    (n, a) =>
      a.role !== "system" && isProjectMember(project, a) ? n + (state.unread[a.id] ?? 0) : n,
    0,
  );

/**
 * The tasks in view: everything at home, this project's work inside a project.
 *
 * A task carries a project only when a lead dispatched it for one, so org-level
 * work lives at home and appears in no project. That's deliberate — inferring
 * membership from the assignee would smear a shared agent's work across every
 * project it happens to be staffed on, and a board you can't trust is worse
 * than a board that admits what it knows.
 */
export const scopedTasks = (): Task[] => {
  const all = Object.values(state.tasks);
  if (atHome()) return all;
  return all.filter((t) => t.project_id === state.activeProjectId);
};

/** Unread across the whole company — the home tile's badge. */
export const homeUnread = (): number =>
  state.agents.reduce((n, a) => n + (state.unread[a.id] ?? 0), 0);

/** The roster scoped to the active project — what the sidebar's AGENTS list and
 *  the conversations beneath it are filtered to. */
export const projectAgents = (): Agent[] => {
  const p = activeProject();
  if (p.allAgents) return state.agents;
  return state.agents.filter((a) => isProjectMember(p, a));
};

/** Resolve an agent id to its record — for lead and team-avatar rendering. */
export const agentById = (id: string | null | undefined): Agent | undefined =>
  id ? state.agents.find((a) => a.id === id) : undefined;

/** A project's members as agent records, in roster order. */
export const projectTeam = (project: Project): Agent[] =>
  project.allAgents
    ? state.agents.filter((a) => a.role !== "system")
    : state.agents.filter((a) => project.team.includes(a.id));

export const activeMessages = (): Message[] => {
  const id = activeConversationId();
  return id ? (state.messages[id] ?? []) : [];
};

export const activeWorking = (): boolean => {
  const id = activeConversationId();
  return id ? !!state.working[id] : false;
};

export const activeAgent = (): Agent | undefined =>
  state.agents.find((a) => a.id === state.activeAgentId);

/** Is this agent working right now? Drives the typing row in the chat list. */
export const agentWorking = (agentId: string): boolean => {
  const convoId = state.conversationOf[agentId];
  return convoId ? !!state.working[convoId] : false;
};

export const canGoBack = (): boolean => state.historyAt > 0;
export const canGoForward = (): boolean => state.historyAt < state.history.length - 1;

export const totalUnread = (): number =>
  Object.values(state.unread).reduce((a, b) => a + b, 0);

// ── tasks ────────────────────────────────────────────────────────────────────

/**
 * Whether the connected backend serves an org surface. Backends that predate
 * the capabilities field have everything (the only such backend is the org
 * prototype), so absence means capable — an explicit list is respected.
 */
export const orgCapable = (cap: "tasks" | "briefs"): boolean => {
  const caps = state.health?.capabilities;
  return !caps || caps.includes(cap);
};

const taskTouchedAt = (t: Task) => t.state_updated_at ?? t.created_at;

/** Tasks whose lifecycle is still running, newest activity first. */
export const liveTasks = (): Task[] =>
  Object.values(state.tasks)
    .filter((t) => !TERMINAL_TASK_STATES.has(t.state))
    .sort((a, b) => taskTouchedAt(b).localeCompare(taskTouchedAt(a)));

/**
 * Every hand-off made from this thread, in any state.
 *
 * Not `liveTasks`: a delegation belongs to the conversation's history the same
 * way a message does, so a finished one stays readable instead of vanishing
 * the moment it completes. Oldest first — the timeline interleaves by time.
 */
export const delegationsOfConversation = (conversationId: string): Task[] =>
  Object.values(state.tasks)
    .filter(
      (t) =>
        t.from_conversation_id === conversationId &&
        t.to_conversation_id !== conversationId,
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

/** The human's inbox: everything paused on a person. */
export const inputRequiredTasks = (): Task[] =>
  liveTasks().filter((t) => t.state === "input-required");

/** Decisions an agent is waiting on you to make, newest first. */
export const pendingBriefs = (): Brief[] =>
  Object.values(state.briefs)
    .filter((b) => b.kind === "decision" && !b.answered_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

/** A conversation's briefs, oldest first (they render inline in the thread). */
export const briefsOfConversation = (conversationId: string): Brief[] =>
  Object.values(state.briefs)
    .filter((b) => b.conversation_id === conversationId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

/** A conversation's live tasks — what its agent owes, and what it farmed out.
 *  A self-dispatch (same thread both sides) counts once, as assigned. */
export const tasksOfConversation = (
  conversationId: string,
): { assigned: Task[]; delegated: Task[] } => {
  const live = liveTasks();
  return {
    assigned: live.filter((t) => t.to_conversation_id === conversationId),
    delegated: live.filter(
      (t) =>
        t.from_conversation_id === conversationId &&
        t.to_conversation_id !== conversationId,
    ),
  };
};

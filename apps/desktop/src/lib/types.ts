// The shapes the backend speaks. Mirrors core/internal/*.

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  persona: string;
  instructions: string;
  tone: string;
  default_tools: string[];
  memory_scope?: string;
  model_backend?: string;
  permission_profile?: string;
  reports_to?: string | null;
  updated_at?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  risk_level?: string;
  category?: string;
}

export interface AgentTemplate {
  id?: string;
  name: string;
  role: string;
  persona: string;
  instructions: string;
  tone: string;
  default_tools: string[];
}

/** The composer's live context meter (GET /conversations/{id}/context). */
export interface ConversationContext {
  model: string;
  provider: string;
  context_length: number;
  est_context_tokens: number;
  session_input_tokens: number;
  session_output_tokens: number;
  session_flushed: boolean;
}

/** The knowledge bank. */
export interface OrgDocument {
  id: string;
  agent_profile_id?: string | null;
  title: string;
  kind: string;
  content: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  agent_profile_id: string;
  title: string;
  unread_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_sender?: string | null;
}

export interface MediaDescriptor {
  url: string;
  name?: string;
  kind?: "image" | "video" | "audio" | "document";
  mime_type?: string;
  size?: string | number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: "user" | "agent" | "system";
  sender_id: string;
  content: string;
  content_format: string;
  reply_to_message_id?: string | null;
  /** {"media": [...]} for attachments — the shape the backend delivers. */
  structured_payload?: { media?: MediaDescriptor[] } | null;
  created_at: string;
  /** transient: set while a reply is still streaming in */
  streaming?: boolean;
}

export interface ToolCall {
  id: string;
  conversation_id: string;
  tool_name: string;
  request_payload: { preview?: string; args?: unknown };
  response_payload: { snippet?: string };
  status: "running" | "settled";
  created_at: string;
}

export interface ModelSettings {
  model: string;
  provider: string;
  base_url: string;
  api_mode: string;
  context_length: number;
  key_env_var: string;
  key_set: boolean;
}

export interface ModelSettingsInput {
  model: string;
  provider: string;
  base_url?: string;
  api_mode?: string;
  context_length?: number;
  api_key?: string;
}

export interface Health {
  status: string;
  engine: string;
  /** 0 = unlimited: the org engine is linked and licensed. */
  max_agents: number;
  /** Whether this server accepts new accounts, and on what terms. */
  signup?: "closed" | "invite" | "open";
}

/** The envelope pushed over the WebSocket. */
export interface RealtimeEvent {
  type:
    | "message.created"
    | "message.updated"
    | "message.deleted"
    | "agent.created"
    | "agent.updated"
    | "agent.activity"
    | "tool_call.started"
    | "tool_call.updated"
    | "task.updated"
    | "brief.created"
    | "brief.updated";
  conversation_id?: string;
  data?: any;
}

// ── tasks (the A2A lifecycle over dispatches) ────────────────────────────────

/** TaskState values exactly as the Agent2Agent protocol specifies them. */
export type TaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "canceled"
  | "failed"
  | "rejected";

export const TERMINAL_TASK_STATES: ReadonlySet<TaskState> = new Set([
  "completed",
  "canceled",
  "failed",
  "rejected",
]);

/** GET /api/v1/tasks row; also the task.updated WS payload. */
export interface Task {
  id: string;
  task: string;
  state: TaskState;
  state_message?: string;
  state_updated_at?: string;
  from_agent_name: string;
  to_agent_name: string;
  to_agent_profile_id?: string;
  from_conversation_id: string;
  to_conversation_id: string;
  depth: number;
  created_at: string;
  answered_at?: string;
}

// ── the dashboard ───────────────────────────────────────────────────────────
// Mirrors the prototype's Org Overview data (backend/core-api handlers_tokens,
// handlers_usage, handlers_analytics).

export interface AgentTokenUsage {
  agent_profile_id: string;
  agent_name: string;
  sessions: number;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
}

export interface TokenUsage {
  totals: AgentTokenUsage;
  per_agent: AgentTokenUsage[];
}

/**
 * Silent metering — a read-only rollup for a window. Mirrors
 * backend/core-api/internal/metering.Summary: the beta measures, never enforces.
 */
export interface UsageAgent {
  agent_profile_id: string;
  agent_name: string;
  messages: number;
  chars: number;
}

export interface UsageSummary {
  since: string;
  window: string;
  totals: {
    messages: number;
    user_messages: number;
    agent_messages: number;
    chars: number;
  };
  per_agent: UsageAgent[];
}

/** What the agents remember, read live from the Hermes memory graph. */
export interface MemoryNode {
  id: string;
  label: string;
  kind: "memory" | "skill";
  source?: string;
  category?: string;
  use_count: number;
  timestamp: number;
  pinned: boolean;
}

export interface MemoryGraph {
  memories: MemoryNode[];
  skills: MemoryNode[];
}

/** A scheduled agent behavior, bridged to a real Hermes cron job. */
export interface Routine {
  id: string;
  agent_profile_id: string;
  name: string;
  schedule_rule: string;
  target_behavior: string;
  priority: string;
  active: boolean;
  cron_job_id: string;
  last_run_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRoutineInput {
  agent_profile_id: string;
  name: string;
  schedule_rule: string;
  target_behavior: string;
  priority?: string;
  active?: boolean;
}

/** Every Hermes job destined for a chat — including ones an agent set itself. */
export interface ScheduledJob {
  id: string;
  name: string;
  kind: string;
  expr?: string;
  display?: string;
  run_at?: string;
  next_run_at?: string;
  enabled: boolean;
  state?: string;
  conversation_id: string;
}

export interface DailyTokens {
  date: string;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  sessions: number;
  cost_usd: number;
}

/** Mirrors the API: GET /analytics/daily → messages[] uses `user`/`agent`. */
export interface DailyMessages {
  date: string;
  user: number;
  agent: number;
}

export interface AnalyticsDaily {
  days: number;
  tokens: DailyTokens[] | null;
  messages: DailyMessages[] | null;
}

/** GET /api/v1/repo/log — one commit for the graph. */
export interface RepoCommit {
  hash: string;
  parents?: string[];
  author: string;
  date: string;
  refs?: string[];
  subject: string;
}

/** A typed agent report: a decision it needs, a result, or an insight. */
export interface Brief {
  id: string;
  conversation_id: string;
  agent_profile_id?: string;
  agent_name: string;
  dispatch_id?: string;
  kind: "decision" | "result" | "insight";
  title: string;
  body: string;
  options: string[];
  answer?: string;
  answered_at?: string;
  created_at: string;
}

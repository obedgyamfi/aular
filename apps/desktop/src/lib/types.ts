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
  reports_to?: string | null;
  unread_count?: number;
  last_message?: string | null;
  last_message_at?: string | null;
}

export interface Conversation {
  id: string;
  agent_profile_id: string;
  title: string;
  unread_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: "user" | "agent" | "system";
  sender_id: string;
  content: string;
  content_format: string;
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

export interface Health {
  status: string;
  engine: string;
  /** 0 = unlimited: the org engine is linked and licensed. */
  max_agents: number;
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
    | "tool_call.updated";
  conversation_id?: string;
  data?: any;
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

export interface UsageSummary {
  window: string;
  total_chars: number;
  agent_messages: number;
  user_messages: number;
}

export interface DailyTokens {
  date: string;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  sessions: number;
  cost_usd: number;
}

export interface DailyMessages {
  date: string;
  agent_messages: number;
  user_messages: number;
}

export interface AnalyticsDaily {
  days: number;
  tokens: DailyTokens[] | null;
  messages: DailyMessages[] | null;
}

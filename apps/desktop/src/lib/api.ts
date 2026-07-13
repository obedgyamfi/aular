import type {
  Agent,
  AnalyticsDaily,
  AuthUser,
  Conversation,
  Health,
  Message,
  ModelSettings,
  TokenUsage,
  ToolCall,
  UsageSummary,
} from "./types";

/**
 * Client for the AULAR backend.
 *
 * This talks to the *working* core-api — the one that already runs the
 * organization: dispatch between agents, the knowledge bank, the SLA watchdog,
 * the org dashboard. The desktop app is a new front end on a proven backend,
 * not a second implementation of one.
 *
 * Auth is a session token. The account is real even though execution is local:
 * the org (who your agents are, what they know) belongs to the account, not the
 * machine. When aular-cloud lands, only BASE changes — the contract is the same.
 */
const BASE = import.meta.env.VITE_AULAR_API ?? "http://127.0.0.1:8080";
const TOKEN_KEY = "aular-session";

export function sessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setSessionToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class Unauthorized extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = sessionToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) throw new Unauthorized("not signed in");
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const v1 = <T>(path: string, init?: RequestInit) => call<T>(`/api/v1${path}`, init);

export const api = {
  isUnauthorized: (e: unknown) => e instanceof Unauthorized,

  // ── account ───────────────────────────────────────────────────────────
  health: () => call<Health>("/healthz"),
  me: () => call<AuthUser>("/auth/me"),
  login: async (email: string, password: string) => {
    const out = await call<{ user: AuthUser; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setSessionToken(out.token);
    return out.user;
  },
  signup: async (email: string, password: string, displayName?: string) => {
    const out = await call<{ user: AuthUser; token: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
    setSessionToken(out.token);
    return out.user;
  },
  logout: async () => {
    try {
      await call<void>("/auth/logout", { method: "POST" });
    } finally {
      setSessionToken(null);
    }
  },

  // ── the org ───────────────────────────────────────────────────────────
  listAgents: () => v1<Agent[]>("/agent-profiles"),
  createAgent: (input: Partial<Agent>) =>
    v1<Agent>("/agent-profiles", { method: "POST", body: JSON.stringify(input) }),
  updateAgent: (id: string, patch: Partial<Agent>) =>
    v1<Agent>(`/agent-profiles/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteAgent: (id: string) => v1<void>(`/agent-profiles/${id}`, { method: "DELETE" }),
  markAgentRead: (id: string) => v1<void>(`/agent-profiles/${id}/read`, { method: "POST" }),

  listTemplates: () => v1<Agent[]>("/agent-profile-templates"),
  listTools: () => v1<{ name: string; description: string; risk: string }[]>("/tool-definitions"),

  // ── conversations ─────────────────────────────────────────────────────
  listConversations: (agentId?: string) =>
    v1<Conversation[] | null>(
      `/conversations${agentId ? `?agent_profile_id=${encodeURIComponent(agentId)}` : ""}`,
    ),
  createConversation: (agentId: string, title = "") =>
    v1<Conversation>("/conversations", {
      method: "POST",
      body: JSON.stringify({ agent_profile_id: agentId, title }),
    }),
  listMessages: (conversationId: string, limit = 60) =>
    v1<Message[] | null>(`/conversations/${conversationId}/messages?limit=${limit}`),
  sendMessage: (conversationId: string, content: string) =>
    v1<{ user_message: Message }>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  listToolCalls: (conversationId: string, limit = 100) =>
    v1<ToolCall[] | null>(`/conversations/${conversationId}/tool-calls?limit=${limit}`),

  // ── the dashboard (same endpoints the prototype's Org Overview reads) ──
  getTokenUsage: () => v1<TokenUsage>("/usage/tokens"),
  getUsageSummary: (window = "30d") => v1<UsageSummary>(`/usage/summary?window=${window}`),
  getAnalyticsDaily: (days = 14) => v1<AnalyticsDaily>(`/analytics/daily?days=${days}`),

  // ── model (BYOK) ──────────────────────────────────────────────────────
  getModelSettings: () => v1<ModelSettings>("/settings/model"),
  updateModelSettings: (input: {
    model: string;
    provider: string;
    api_key?: string;
    base_url?: string;
    context_length?: number;
  }) => v1<ModelSettings>("/settings/model", { method: "PUT", body: JSON.stringify(input) }),
};

/** The realtime stream. Auth rides as a query param — a browser WebSocket
 *  cannot set headers. */
export function openRealtime(onEvent: (e: import("./types").RealtimeEvent) => void) {
  const token = sessionToken();
  if (!token) return () => {};

  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout>;

  const connect = () => {
    if (closed) return;
    const url = BASE.replace(/^http/, "ws") + `/ws?session=${encodeURIComponent(token)}`;
    ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data as string));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onopen = () => (retry = 0);
    ws.onclose = () => {
      if (closed) return;
      retry = Math.min(retry + 1, 6);
      timer = setTimeout(connect, retry * 1000);
    };
    ws.onerror = () => ws?.close();
  };
  connect();

  return () => {
    closed = true;
    clearTimeout(timer);
    ws?.close();
  };
}

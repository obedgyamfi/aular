import { createStore, produce } from "solid-js/store";

import { api, openRealtime } from "./api";
import type { Agent, AuthUser, Health, Message, RealtimeEvent, ToolCall } from "./types";

/**
 * The app's state. One store, mutated through named actions — the same shape
 * the old AULAR used, which kept realtime and REST from fighting each other.
 */
export type Register = "chat" | "work" | "org";

interface State {
  register: Register;
  user: AuthUser | null;
  health: Health | null;
  agents: Agent[];
  activeAgentId: string | null;
  /** agent id → its conversation id */
  conversationOf: Record<string, string>;
  /** conversation id → messages, oldest first */
  messages: Record<string, Message[]>;
  /** conversation id → tool calls */
  toolCalls: Record<string, ToolCall[]>;
  /** conversation id → the agent is working right now */
  working: Record<string, boolean>;
  error: string | null;
}

const [state, set] = createStore<State>({
  register: "chat",
  user: null,
  health: null,
  agents: [],
  activeAgentId: null,
  conversationOf: {},
  messages: {},
  toolCalls: {},
  working: {},
  error: null,
});

export { state };

let stopRealtime: (() => void) | null = null;

export const actions = {
  setUser(user: AuthUser | null) {
    set("user", user);
  },

  setRegister(register: Register) {
    set("register", register);
  },

  /** Everything the app needs once signed in. */
  async load() {
    const [health, agents] = await Promise.all([api.health(), api.listAgents()]);
    set({ health, agents, error: null });
    stopRealtime?.();
    stopRealtime = openRealtime(handleEvent);
  },

  async signOut() {
    stopRealtime?.();
    stopRealtime = null;
    await api.logout();
    set({ user: null, agents: [], activeAgentId: null, messages: {}, toolCalls: {} });
  },

  /** Open an agent: resolve (or start) its conversation and pull the history. */
  async openAgent(agentId: string) {
    set("activeAgentId", agentId);
    let convoId = state.conversationOf[agentId];

    if (!convoId) {
      const existing = (await api.listConversations(agentId)) ?? [];
      const convo = existing[0] ?? (await api.createConversation(agentId));
      convoId = convo.id;
      set("conversationOf", agentId, convoId);
    }

    const [msgs, tools] = await Promise.all([
      api.listMessages(convoId),
      api.listToolCalls(convoId),
    ]);
    // The API returns newest-first; the UI reads oldest-first.
    set("messages", convoId, (msgs ?? []).slice().reverse());
    set("toolCalls", convoId, (tools ?? []).slice().reverse());

    void api.markAgentRead(agentId).catch(() => {});
    set("agents", (a) => a.id === agentId, "unread_count", 0);
  },

  /** Send a turn. The reply arrives over the WebSocket, not in the response. */
  async send(content: string) {
    const agentId = state.activeAgentId;
    if (!agentId) return;
    const convoId = state.conversationOf[agentId];
    if (!convoId) return;

    set("working", convoId, true);
    try {
      await api.sendMessage(convoId, content);
    } catch (e) {
      set("working", convoId, false);
      set("error", (e as Error).message);
    }
  },

  async createAgent(input: Partial<Agent>) {
    const agent = await api.createAgent(input);
    set("agents", (list) => [...list, agent]);
    return agent;
  },

  dismissError() {
    set("error", null);
  },
};

/** Realtime → store. Streaming replies grow a message in place. */
function handleEvent(e: RealtimeEvent) {
  const convoId = e.conversation_id ?? e.data?.conversation_id;

  switch (e.type) {
    case "message.created": {
      const msg = e.data as Message;
      if (!convoId) return;
      set(
        produce((s: State) => {
          const list = s.messages[convoId] ?? (s.messages[convoId] = []);
          if (!list.some((m) => m.id === msg.id)) list.push(msg);
          if (msg.sender_type === "agent") s.working[convoId] = false;
          // An agent that isn't open gets an unread badge.
          const agent = s.agents.find((a) => s.conversationOf[a.id] === convoId);
          if (agent && msg.sender_type !== "user" && s.activeAgentId !== agent.id) {
            agent.unread_count = (agent.unread_count ?? 0) + 1;
          }
        }),
      );
      return;
    }

    case "message.updated": {
      const msg = e.data as Message & { streaming?: boolean };
      if (!convoId) return;
      set(
        produce((s: State) => {
          const list = s.messages[convoId] ?? (s.messages[convoId] = []);
          const i = list.findIndex((m) => m.id === msg.id);
          if (i === -1) list.push(msg);
          else list[i] = { ...list[i]!, ...msg };
          if (!msg.streaming) s.working[convoId] = false;
        }),
      );
      return;
    }

    case "agent.activity": {
      if (!convoId) return;
      set("working", convoId, e.data?.state === "working");
      return;
    }

    case "tool_call.started":
    case "tool_call.updated": {
      const tc = e.data as ToolCall;
      if (!tc?.conversation_id) return;
      set(
        produce((s: State) => {
          const list = s.toolCalls[tc.conversation_id] ?? (s.toolCalls[tc.conversation_id] = []);
          const i = list.findIndex((t) => t.id === tc.id);
          if (i === -1) list.push(tc);
          else list[i] = tc;
        }),
      );
      return;
    }

    case "agent.created": {
      const agent = e.data as Agent;
      set("agents", (list) => (list.some((a) => a.id === agent.id) ? list : [...list, agent]));
      return;
    }

    case "agent.updated": {
      const agent = e.data as Agent;
      set("agents", (a) => a.id === agent.id, agent);
      return;
    }
  }
}

// ── selectors ───────────────────────────────────────────────────────────
export const activeConversationId = () =>
  state.activeAgentId ? state.conversationOf[state.activeAgentId] : undefined;

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

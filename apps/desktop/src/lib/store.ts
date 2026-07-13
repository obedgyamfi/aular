import { createStore, produce } from "solid-js/store";

import { api, openRealtime } from "./api";
import type {
  Agent,
  AuthUser,
  Health,
  MediaDescriptor,
  Message,
  ModelSettings,
  RealtimeEvent,
  ToolCall,
} from "./types";

/**
 * The app's state.
 *
 * Shaped like the prototype's store, because that shape was earned: realtime
 * and REST both write here, and keeping per-agent view state (unread, preview,
 * typing) separate from the message log is what stops them fighting.
 */
export type Register = "chat" | "work" | "org" | "calendar" | "settings";

/** The settings section to land on — set by whatever sent you there. */
export type SettingsSection =
  | "general"
  | "appearance"
  | "chats"
  | "model"
  | "usage"
  | "memory"
  | "about";

/** One stop in the view history — what back/forward walk through. */
export interface View {
  register: Register;
  agentId: string | null;
}

/** What the chat list shows beneath an agent's name. */
export interface Preview {
  text: string;
  at: string;
  sender: "user" | "agent" | "system";
}

interface State {
  register: Register;
  settingsSection: SettingsSection;
  user: AuthUser | null;
  health: Health | null;
  model: ModelSettings | null;

  agents: Agent[];
  activeAgentId: string | null;

  /** agent id → conversation id, and the reverse. */
  conversationOf: Record<string, string>;
  agentOf: Record<string, string>;

  messages: Record<string, Message[]>;
  toolCalls: Record<string, ToolCall[]>;

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

const [state, set] = createStore<State>({
  register: "chat",
  settingsSection: "general",
  user: null,
  health: null,
  model: null,
  agents: [],
  activeAgentId: null,
  conversationOf: {},
  agentOf: {},
  messages: {},
  toolCalls: {},
  unread: {},
  preview: {},
  working: {},
  streaming: {},
  replyTo: null,
  attachment: null,
  history: [{ register: "chat", agentId: null }],
  historyAt: 0,
  error: null,
});

export { state };

let stopRealtime: (() => void) | null = null;

/**
 * True while back/forward are replaying a view, so the replay doesn't record
 * itself as a new stop in the history.
 */
let replaying = false;

function pushView(view: View) {
  if (replaying) return;
  const current = state.history[state.historyAt];
  if (current?.register === view.register && current?.agentId === view.agentId) return;

  set(
    produce((s: State) => {
      // Moving somewhere new from a rewound history drops the forward branch —
      // the same rule a browser uses.
      s.history = [...s.history.slice(0, s.historyAt + 1), view].slice(-50);
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

/** The chat list's subtitle. An older event must never overwrite a newer one. */
function bumpPreview(agentId: string, msg: Message) {
  const current = state.preview[agentId];
  if (current && current.at > msg.created_at) return;
  set("preview", agentId, {
    text: msg.content,
    at: msg.created_at,
    sender: msg.sender_type,
  });
}

/** Agent replies, for anything that needs to react to them (notifications). */
type ReplyListener = (message: Message, agentId: string | undefined) => void;
const replyListeners = new Set<ReplyListener>();

export function onAgentReply(fn: ReplyListener): () => void {
  replyListeners.add(fn);
  return () => replyListeners.delete(fn);
}

export const actions = {
  setUser(user: AuthUser | null) {
    set("user", user);
  },

  setRegister(register: Register) {
    set("register", register);
    pushView({ register, agentId: state.activeAgentId });
  },

  /** Open Settings on a particular section — used by the composer's model badge
   *  and anything else that points at a specific setting. */
  openSettings(section: SettingsSection) {
    set("settingsSection", section);
    actions.setRegister("settings");
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
    const [health, agents, convos, model] = await Promise.all([
      api.health().catch(() => null),
      api.listAgents(),
      api.listConversations().then((c) => c ?? []),
      api.getModelSettings().catch(() => null),
    ]);

    set(
      produce((s: State) => {
        s.health = health;
        s.agents = agents;
        s.model = model;
        s.error = null;
        for (const c of convos) {
          s.conversationOf[c.agent_profile_id] = c.id;
          s.agentOf[c.id] = c.agent_profile_id;
          s.unread[c.agent_profile_id] = c.unread_count ?? 0;
          if (c.last_message && c.last_message_at) {
            s.preview[c.agent_profile_id] = {
              text: c.last_message,
              at: c.last_message_at,
              sender: (c.last_message_sender as Preview["sender"]) ?? "agent",
            };
          }
        }
      }),
    );

    stopRealtime?.();
    stopRealtime = openRealtime(handleEvent);
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
    });
  },

  /** Open an agent: resolve (or start) its conversation and pull its history. */
  async openAgent(agentId: string) {
    set("activeAgentId", agentId);
    pushView({ register: state.register, agentId });
    let convoId = state.conversationOf[agentId];

    if (!convoId) {
      const existing = (await api.listConversations(agentId)) ?? [];
      const convo = existing[0] ?? (await api.createConversation(agentId));
      convoId = convo.id;
      set("conversationOf", agentId, convoId);
      set("agentOf", convoId, agentId);
    }

    const [msgs, tools] = await Promise.all([
      api.listMessages(convoId),
      api.listToolCalls(convoId).catch(() => []),
    ]);
    // The API returns newest-first; the UI reads oldest-first.
    set("messages", convoId, (msgs ?? []).slice().reverse());
    set("toolCalls", convoId, (tools ?? []).slice().reverse());

    void api.markAgentRead(agentId).catch(() => {});
    set("unread", agentId, 0);
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
    set("agents", (list) => [...list, agent]);
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
      if (!msg.streaming) clearWorking(convoId);
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
  }
}

// ── selectors ───────────────────────────────────────────────────────────────

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

/** Is this agent working right now? Drives the typing row in the chat list. */
export const agentWorking = (agentId: string): boolean => {
  const convoId = state.conversationOf[agentId];
  return convoId ? !!state.working[convoId] : false;
};

export const canGoBack = (): boolean => state.historyAt > 0;
export const canGoForward = (): boolean => state.historyAt < state.history.length - 1;

export const totalUnread = (): number =>
  Object.values(state.unread).reduce((a, b) => a + b, 0);

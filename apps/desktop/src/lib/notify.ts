import { settings, settingsActions } from "./settings";
import { actions, onAgentReply, state } from "./store";

/**
 * Desktop notifications for agent replies.
 *
 * Only when you've turned them on, only when the window isn't focused, and only
 * for agents you haven't muted — an org that runs on a schedule will talk while
 * you're elsewhere, and that's the whole point of telling you about it.
 *
 * Clicking one brings the window forward and opens that agent's thread.
 */
export function startNotifications(): () => void {
  return onAgentReply((message, agentId) => {
    if (!settings.notifications) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (document.hasFocus()) return;
    if (agentId && settingsActions.isMuted(agentId)) return;

    const agent = state.agents.find((a) => a.id === agentId);
    const body = message.content.replace(/<<<AULAR_CHUNK>>>/g, " ").trim();

    const note = new Notification(agent?.name ?? "AULAR", {
      body: body.length > 180 ? `${body.slice(0, 180)}…` : body,
      tag: agentId ?? message.conversation_id, // one bubble per agent, not per line
    });

    note.onclick = () => {
      window.focus();
      if (agentId) {
        actions.setRegister("chat");
        void actions.openAgent(agentId);
      }
    };
  });
}

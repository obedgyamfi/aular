/**
 * The Hermes gateway's command surface — the curated core of its 135-command
 * registry (the rest are skills, browsable with /commands).
 *
 * These short-circuit at the gateway before any model call, so they cost zero
 * tokens. `needsArgs` means Enter inserts the command for you to complete;
 * otherwise Enter runs it immediately. Tab always inserts.
 */
export interface SlashCommand {
  cmd: string;
  args?: string;
  desc: string;
  needsArgs?: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/status", desc: "Session, model, token and context info" },
  { cmd: "/usage", desc: "Token usage and rate limits for this session" },
  { cmd: "/model", args: "[model] [--provider name]", desc: "Switch model (persists by default)" },
  { cmd: "/new", args: "[name]", desc: "Start a fresh session (clears history)" },
  { cmd: "/retry", desc: "Retry the last message" },
  { cmd: "/undo", args: "[N]", desc: "Back up N user turns and re-prompt" },
  { cmd: "/compress", args: "[here [N]]", desc: "Compress conversation context" },
  { cmd: "/stop", desc: "Kill all running background processes" },
  { cmd: "/approve", args: "[session|always]", desc: "Approve a pending dangerous command" },
  { cmd: "/deny", desc: "Deny a pending dangerous command" },
  { cmd: "/queue", args: "<prompt>", desc: "Queue a prompt for the next turn", needsArgs: true },
  { cmd: "/steer", args: "<prompt>", desc: "Inject guidance after the next tool call", needsArgs: true },
  { cmd: "/background", args: "<prompt>", desc: "Run a prompt in the background", needsArgs: true },
  { cmd: "/goal", args: "[text|show|pause|clear]", desc: "Standing goal worked across turns" },
  { cmd: "/subgoal", args: "[text]", desc: "Add criteria to the active goal" },
  { cmd: "/agents", desc: "Show active agents and running tasks" },
  { cmd: "/branch", args: "[name]", desc: "Branch this session to explore a path" },
  { cmd: "/title", args: "[name]", desc: "Title the current session", needsArgs: true },
  { cmd: "/sessions", desc: "Browse and resume previous sessions" },
  { cmd: "/resume", args: "[name]", desc: "Resume a previously-named session" },
  { cmd: "/rollback", args: "[number]", desc: "List or restore filesystem checkpoints" },
  { cmd: "/reasoning", args: "[level|show|hide]", desc: "Reasoning effort and display" },
  { cmd: "/fast", desc: "Toggle fast mode (priority processing)" },
  { cmd: "/insights", args: "[days]", desc: "Usage insights and analytics" },
  { cmd: "/whoami", desc: "Show your slash-command access level" },
  { cmd: "/version", desc: "Show Hermes Agent version" },
  { cmd: "/commands", args: "[page]", desc: "Browse all 135 commands and skills" },
];

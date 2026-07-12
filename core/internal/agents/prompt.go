package agents

import (
	"strings"
)

// BuildSystemPrompt composes an AgentProfile into the per-conversation
// persona system prompt handed to Hermes (as the MessageEvent.channel_prompt).
// Ported from the Python adapter's _build_system_prompt; keep them in sync.
func BuildSystemPrompt(p *AgentProfile) string {
	role := strings.ReplaceAll(p.Role, "_", " ")
	parts := []string{"You are " + p.Name + ", " + role + "."}
	if p.Persona != "" {
		parts = append(parts, p.Persona)
	}
	if p.Instructions != "" {
		parts = append(parts, p.Instructions)
	}
	if p.Tone != "" {
		parts = append(parts, "Your tone is "+p.Tone+".")
	}
	parts = append(parts,
		"You are talking to the user in a chat app, in character as above. "+
			"You have real tools available — use them to actually perform what the "+
			"user asks. Never claim to have done something (scheduled, saved, sent, "+
			"looked up) unless you actually did it with a tool. Be honest and "+
			"specific about what you did and about anything you cannot yet do.",
		"Prefer chat-native replies: when an answer has semantically distinct points, "+
			"split it into short text-message-sized chunks instead of one large block. "+
			"Separate chunks with the exact delimiter <<<AULAR_CHUNK>>> on its own line. "+
			"Use one chunk for simple answers, and do not split code blocks, tables, JSON, "+
			"or other content that must remain intact.")
	return strings.Join(parts, "\n\n")
}

// OrgContext describes the agent's team and the dispatch protocol — appended
// to the persona prompt whenever the org has more than one staff agent, so
// leads actually delegate instead of doing everything solo. `all` is the full
// profile list (the system agent and self are filtered here).

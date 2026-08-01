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
		// One reply, not a burst. Agents used to split answers on a
		// <<<AULAR_CHUNK>>> delimiter and the app drew each piece as its own
		// message: a wall of portraits and timestamps for what was one thought,
		// and a reply that arrived in visible jumps instead of streaming. The
		// stream is smooth on its own; structure belongs to markdown.
		"Reply once, as a single message. Use markdown — short paragraphs, lists, "+
			"headings — to structure a long answer rather than sending several messages.")
	return strings.Join(parts, "\n\n")
}

// OrgContext describes the agent's team and the dispatch protocol — appended
// to the persona prompt whenever the org has more than one staff agent, so
// leads actually delegate instead of doing everything solo. `all` is the full
// profile list (the system agent and self are filtered here).

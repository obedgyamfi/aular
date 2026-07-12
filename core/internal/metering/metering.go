// Package metering is AULAR's silent usage meter. It records an append-only log
// of meterable activity (user messages sent, agent replies delivered) so there
// is real data for future limits/billing — but the free beta only measures, it
// never enforces. Recording is best-effort and must never block or fail the
// request path that triggered it.
package metering

import "time"

// Event kinds.
const (
	KindUserMessage  = "user_message"
	KindAgentMessage = "agent_message"
)

// Event is a single metered occurrence.
type Event struct {
	UserID         string
	AgentProfileID string // "" when not attributable to a specific agent
	ConversationID string
	MessageID      string // the message metered; enables a later char correction
	Kind           string
	Chars          int
}

// AgentUsage is a per-agent rollup within a window.
type AgentUsage struct {
	AgentProfileID string `json:"agent_profile_id"`
	AgentName      string `json:"agent_name"`
	Messages       int    `json:"messages"`
	Chars          int    `json:"chars"`
}

// Totals is the headline rollup for a window.
type Totals struct {
	Messages      int `json:"messages"`
	UserMessages  int `json:"user_messages"`
	AgentMessages int `json:"agent_messages"`
	Chars         int `json:"chars"`
}

// Summary is the usage view returned to the UI for a time window.
type Summary struct {
	Since    time.Time    `json:"since"`
	Window   string       `json:"window"`
	Totals   Totals       `json:"totals"`
	PerAgent []AgentUsage `json:"per_agent"`
}

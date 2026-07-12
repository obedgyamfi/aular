// Package engine is the seam between the open shell and the AULAR org engine.
//
// The shell in this repository is a complete, working local agent client: you
// can talk to agents, watch their tool calls, and manage a small team. What it
// deliberately does NOT contain is the orchestration engine — agent-to-agent
// dispatch, the report relay, the SLA watchdog, the knowledge bank and
// roadmap, and the organization dashboard. That engine is what AULAR sells.
//
// The shell depends only on this interface. The free build wires the Noop
// implementation below (see cmd/aular-core). The commercial build links the
// real engine and passes a license check. Nothing here is a stub of the paid
// code — it is the honest boundary between the two.
package engine

import (
	"context"
)

// Turn is one agent turn the engine may act on, after the shell has persisted
// and broadcast it.
type Turn struct {
	UserID         string
	ConversationID string
	AgentProfileID string
	MessageID      string
	Content        string
	// Final is true on the last (finalizing) segment of a streamed reply —
	// the point at which a reply can be acted on as a whole.
	Final bool
}

// Prompt is the system prompt being assembled for an agent, which the engine
// enriches with org context (team roster, dispatch protocol, doctrine) and the
// knowledge bank (roadmap, specs, role documents).
type Prompt struct {
	UserID         string
	AgentProfileID string
	Base           string // persona + instructions, built by the shell
}

// Engine is the org layer. Every method must be safe to call on a nil-ish
// (Noop) implementation — the shell never branches on tier.
type Engine interface {
	// Name identifies the linked engine in logs and the About window.
	Name() string

	// EnrichPrompt returns the system prompt an agent should run with. The
	// free engine returns p.Base unchanged.
	EnrichPrompt(ctx context.Context, p Prompt) string

	// OnAgentReply is called after an agent's reply is persisted. The org
	// engine parses dispatch/document blocks here, routes work to teammates,
	// relays reports, and nudges narrated delegation.
	OnAgentReply(ctx context.Context, t Turn)

	// MaxAgents caps how many agent profiles a user may create. The free
	// shell allows a small team; the org engine returns 0 (unlimited).
	MaxAgents() int
}

// Noop is the free-tier engine: agents work, but they don't form an
// organization. This is a real implementation, not a placeholder — the open
// shell ships with it and is fully functional.
type Noop struct{}

func (Noop) Name() string { return "shell (no org engine)" }

func (Noop) EnrichPrompt(_ context.Context, p Prompt) string { return p.Base }

func (Noop) OnAgentReply(context.Context, Turn) {}

// FreeAgentLimit is the number of agents the open shell supports. Beyond this,
// coordination stops being a chat app and starts being an organization — which
// is the product.
const FreeAgentLimit = 3

func (Noop) MaxAgents() int { return FreeAgentLimit }

// Ensure the free engine satisfies the interface at compile time.
var _ Engine = Noop{}

// Package engine is the seam between the open AULAR shell and the org engine.
//
// The shell in this repository is a complete local agent client: you can talk
// to agents, watch their tool calls, and run a small team. What it does NOT
// contain is the organization — agent-to-agent dispatch, the report relay, the
// SLA watchdog, the shared knowledge bank and roadmap. That engine is what
// AULAR sells, and it lives in a separate, private module.
//
// Because the engine is a different Go module, it cannot import the shell's
// internal packages (Go's internal/ rule is path-based). This package is
// therefore a self-contained API: it defines its own types, and the shell
// adapts to them. That constraint is a feature — it forces the boundary to
// stay a real, stable interface rather than a leaky import.
//
//	shell ──▶ Engine   (what the org does to a turn)
//	shell ◀── Host     (what the org may ask the shell to do)
package engine

import (
	"context"
	"database/sql"
	"net/http"
	"time"
)

// ─── Types crossing the boundary ────────────────────────────────────────────

// Agent is a member of the user's organization.
type Agent struct {
	ID        string
	Name      string
	Role      string
	Persona   string
	ReportsTo string // "" = reports to the user
}

// Message is one turn in a conversation.
type Message struct {
	ID         string
	SenderType string // "user" | "agent" | "system"
	Content    string
	CreatedAt  time.Time
}

// Conversation is a thread between the user and one agent.
type Conversation struct {
	ID             string
	UserID         string
	AgentProfileID string
}

// Prompt is a system prompt being assembled for an agent. The engine returns
// the prompt the agent should actually run with.
type Prompt struct {
	UserID         string
	AgentProfileID string
	Base           string // persona + instructions, built by the shell
}

// Turn is an agent reply the engine may act on, after the shell has persisted
// and broadcast it.
type Turn struct {
	UserID         string
	ConversationID string
	AgentProfileID string
	MessageID      string
	// Content is what the user sees: structured blocks stripped out.
	Content string
	// Raw is the reply as the agent actually wrote it, blocks and all. The
	// shell hides blocks from the chat bubble; the engine still needs them,
	// because they ARE the organization — dispatch assignments, documents for
	// the knowledge bank. Strip them before the engine sees them and delegation
	// silently never happens.
	Raw string
	// Final is true on the last segment of a streamed reply — the point at
	// which the reply can be acted on as a whole.
	Final bool
}

// ─── What the engine may ask of the shell ───────────────────────────────────

// Host is the shell, as seen by the engine. Everything the org needs to
// actually move work between agents is here — and nothing else.
type Host interface {
	// DB is the app's database. The engine owns its own tables (dispatches,
	// documents) and migrates them itself; it must not touch the shell's.
	DB() *sql.DB

	// Roster is the user's agents.
	Roster(ctx context.Context, userID string) ([]Agent, error)
	// AgentByName resolves an agent the way a person refers to staff — by
	// name. Returns nil when there's no such teammate.
	AgentByName(ctx context.Context, userID, name string) *Agent

	// Conversation returns a thread, or an error if it doesn't exist.
	Conversation(ctx context.Context, id string) (*Conversation, error)
	// OpenConversation finds (or starts) the user's thread with an agent —
	// how dispatched work reaches a teammate's own session.
	OpenConversation(ctx context.Context, userID, agentID string) (*Conversation, error)
	// RecentMessages returns a conversation's latest messages, newest first.
	RecentMessages(ctx context.Context, conversationID string, limit int) ([]Message, error)

	// PostSystemMessage writes a neutral note into a conversation (a task
	// assignment, a report handoff) and shows it to the user immediately.
	PostSystemMessage(ctx context.Context, conversationID, text string)
	// RunTurn makes an agent work: it delivers content into that agent's own
	// session as a real turn, with the given system prompt. Asynchronous —
	// the reply arrives through the normal delivery path.
	RunTurn(conversationID, userID, systemPrompt, content string)

	// BasePrompt is an agent's own persona prompt, before the engine enriches
	// it. Needed when the engine runs a turn for an agent other than the one
	// whose reply it is handling.
	BasePrompt(ctx context.Context, agentID string) string
}

// ─── What the org does ──────────────────────────────────────────────────────

// Engine is the organization layer. Every method must be safe to call on the
// free implementation, so the shell never branches on tier.
type Engine interface {
	// Name identifies the linked engine in logs and the About window.
	Name() string

	// Attach gives the engine its handle on the shell. Called once at boot,
	// before any other method.
	Attach(h Host)

	// EnrichPrompt returns the system prompt an agent should run with — the
	// team roster, the dispatch protocol, the knowledge bank. The free engine
	// returns p.Base unchanged.
	EnrichPrompt(ctx context.Context, p Prompt) string

	// OnAgentReply is called after an agent's reply is persisted. This is
	// where the org happens: dispatch blocks are routed to teammates, reports
	// are relayed back, and narrated delegation is corrected.
	OnAgentReply(ctx context.Context, t Turn)

	// MaxAgents caps how many agents a user may create; 0 means unlimited.
	MaxAgents() int
}

// ─── Optional: an engine with its own HTTP surface ──────────────────────────

// RouteProvider is an optional Engine extension. An engine that has API
// surfaces of its own — the task board, briefs — returns them here, keyed by
// the /api/v1-relative prefix they own (e.g. "/tasks", "/briefs"). The shell
// mounts each behind its session auth, injects the caller via WithUserID, and
// reports the mounted prefixes as capabilities in /healthz so the UI shows
// only what this build can actually do.
//
// The free engine does not implement this: without an org there are no tasks
// to serve, and the honest answer at those routes is the shell's stub (an
// empty list for reads, 404 for actions).
type RouteProvider interface {
	APIRoutes() map[string]http.Handler
}

// The engine package owns the context key so both modules agree on it without
// the engine importing the shell's internals.
type ctxKey struct{}

// WithUserID stamps the authenticated caller onto a request context before it
// crosses into engine handlers.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, ctxKey{}, userID)
}

// UserID reads the caller stamped by the shell; "" means unauthenticated
// (engine handlers should treat that as impossible — the shell gates first).
func UserID(ctx context.Context) string {
	v, _ := ctx.Value(ctxKey{}).(string)
	return v
}

// ─── The free engine ────────────────────────────────────────────────────────

// FreeAgentLimit is what the open shell supports. Past this, coordination stops
// being a chat app and starts being an organization — which is the product.
const FreeAgentLimit = 3

// Noop is the free-tier engine: agents work, but they do not form an
// organization. This is a real implementation, not a placeholder — the open
// shell ships it and is fully functional.
type Noop struct{}

func (Noop) Name() string                                    { return "shell (no org engine)" }
func (Noop) Attach(Host)                                     {}
func (Noop) EnrichPrompt(_ context.Context, p Prompt) string { return p.Base }
func (Noop) OnAgentReply(context.Context, Turn)              {}
func (Noop) MaxAgents() int                                  { return FreeAgentLimit }

var _ Engine = Noop{}

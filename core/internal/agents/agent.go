package agents

import "time"

// Agent is the single runtime record — today this is "Hermes." Behavior for
// any given conversation comes from the AgentProfile attached to it, not from
// separate per-persona code.
type Agent struct {
	ID        string    `db:"id" json:"id"`
	UserID    string    `db:"user_id" json:"user_id"`
	Name      string    `db:"name" json:"name"`
	Status    string    `db:"status" json:"status"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

// AgentProfile is a persona configuration for an Agent — e.g. Hermes,
// Chronos, Mnemosyne, Athena, Hephaestus, Gaia, Atlas, Echo. Profiles are
// data, seeded from backend/agent-worker/app/profiles/*.yaml, and each shows
// up on the frontend as its own chat user with its own conversations.
type AgentProfile struct {
	ID                string    `db:"id" json:"id"`
	AgentID           string    `db:"agent_id" json:"agent_id"`
	TemplateID        *string   `db:"template_id" json:"template_id,omitempty"`
	ReportsTo         *string   `db:"reports_to" json:"reports_to,omitempty"`
	Name              string    `db:"name" json:"name"`
	Role              string    `db:"role" json:"role"`
	Persona           string    `db:"persona" json:"persona"`
	Instructions      string    `db:"instructions" json:"instructions"`
	Tone              string    `db:"tone" json:"tone"`
	DefaultTools      []string  `db:"default_tools" json:"default_tools"`
	MemoryScope       string    `db:"memory_scope" json:"memory_scope"`
	ModelBackend      string    `db:"model_backend" json:"model_backend"` // "hermes_agent" | "ollama" | "codex_cli"
	ScheduleRule      string    `db:"schedule_rule" json:"schedule_rule"`
	PermissionProfile string    `db:"permission_profile" json:"permission_profile"`
	CreatedAt         time.Time `db:"created_at" json:"created_at"`
	UpdatedAt         time.Time `db:"updated_at" json:"updated_at"`
}

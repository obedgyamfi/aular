package agents

import "time"

// AgentProfileTemplate is an installable, builtin persona catalog entry —
// the 8 Hermes personas (Hermes, Chronos, Mnemosyne, Athena, Hephaestus,
// Gaia, Atlas, Echo) ship as rows here. "Add Agent" from a template copies
// these fields into a new AgentProfile row owned by the user's Agent, with
// AgentProfile.TemplateID set for provenance.
type AgentProfileTemplate struct {
	ID                string    `db:"id" json:"id"`
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

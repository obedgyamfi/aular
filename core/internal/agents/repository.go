package agents

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
)

// Repository is hand-written database/sql SQL rather than sqlc-generated
// code, since sqlc isn't installed on the dev machine yet. Same call shape
// either way — swap the internals for generated code later without
// touching handlers.
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// scanner is satisfied by both *sql.Row and *sql.Rows, letting scanProfile
// and scanTemplate serve both a single-row QueryRowContext and a
// multi-row QueryContext loop.
type scanner interface {
	Scan(dest ...any) error
}

const profileColumns = `id, agent_id, template_id, reports_to, name, role, persona, instructions, tone, default_tools, memory_scope, model_backend, schedule_rule, permission_profile, created_at, updated_at`

// profileColumnsQualified is the same list prefixed with the `ap` alias, for
// queries that JOIN agent_profiles against agents (which shares column names
// like id/name/created_at, making an unqualified list ambiguous).
const profileColumnsQualified = `ap.id, ap.agent_id, ap.template_id, ap.reports_to, ap.name, ap.role, ap.persona, ap.instructions, ap.tone, ap.default_tools, ap.memory_scope, ap.model_backend, ap.schedule_rule, ap.permission_profile, ap.created_at, ap.updated_at`

func scanProfile(row scanner) (*AgentProfile, error) {
	var p AgentProfile
	var toolsRaw []byte
	if err := row.Scan(&p.ID, &p.AgentID, &p.TemplateID, &p.ReportsTo, &p.Name, &p.Role, &p.Persona, &p.Instructions, &p.Tone, &toolsRaw, &p.MemoryScope, &p.ModelBackend, &p.ScheduleRule, &p.PermissionProfile, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return nil, err
	}
	if len(toolsRaw) > 0 {
		if err := json.Unmarshal(toolsRaw, &p.DefaultTools); err != nil {
			return nil, fmt.Errorf("agents: unmarshal default_tools: %w", err)
		}
	}
	return &p, nil
}

func (r *Repository) CreateProfile(ctx context.Context, p *AgentProfile) (*AgentProfile, error) {
	toolsJSON, err := json.Marshal(p.DefaultTools)
	if err != nil {
		return nil, fmt.Errorf("agents: marshal default_tools: %w", err)
	}
	row := r.db.QueryRowContext(ctx, `
		INSERT INTO agent_profiles (id, agent_id, template_id, name, role, persona, instructions, tone, default_tools, memory_scope, model_backend, schedule_rule, permission_profile)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING `+profileColumns,
		uuid.NewString(), p.AgentID, p.TemplateID, p.Name, p.Role, p.Persona, p.Instructions, p.Tone, toolsJSON, p.MemoryScope, p.ModelBackend, p.ScheduleRule, p.PermissionProfile,
	)
	return scanProfile(row)
}

// GetOrCreateSystemProfileForUser ensures every user has the built-in AULAR
// system profile. AULAR is the chat target for overall platform config, design
// direction, and system updates, so it exists outside the normal agent list.
func (r *Repository) GetOrCreateSystemProfileForUser(ctx context.Context, userID string) (*AgentProfile, error) {
	agent, err := r.GetOrCreateAgentForUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	row := r.db.QueryRowContext(ctx, `
		SELECT `+profileColumns+`
		FROM agent_profiles
		WHERE agent_id = ? AND role = 'system'
		ORDER BY CASE WHEN name = 'AULAR' THEN 0 ELSE 1 END, created_at
		LIMIT 1`, agent.ID)
	profile, err := scanProfile(row)
	if err == nil {
		return profile, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	return r.CreateProfile(ctx, &AgentProfile{
		AgentID:           agent.ID,
		Name:              "AULAR",
		Role:              "system",
		Persona:           "System agent for AULAR. Helps configure the platform, coordinate design direction, and surface system updates.",
		Instructions:      "Act as AULAR, the built-in system agent. Help the user configure and steer the AULAR platform, summarize system updates, and coordinate high-level design or behavior changes across agents.",
		Tone:              "clear, concise, systems-minded",
		DefaultTools:      []string{"memory.read", "tasks.read", "notifications.send"},
		MemoryScope:       "user:system",
		ModelBackend:      "hermes_agent",
		ScheduleRule:      "",
		PermissionProfile: "standard",
	})
}

func (r *Repository) ListProfiles(ctx context.Context, userID string) ([]*AgentProfile, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+profileColumnsQualified+`
		FROM agent_profiles ap
		JOIN agents a ON a.id = ap.agent_id
		WHERE a.user_id = ?
		ORDER BY ap.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []*AgentProfile
	for rows.Next() {
		p, err := scanProfile(rows)
		if err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	return profiles, rows.Err()
}

func (r *Repository) GetProfile(ctx context.Context, id string) (*AgentProfile, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+profileColumns+` FROM agent_profiles WHERE id = ?`, id)
	return scanProfile(row)
}

// ProfilePatch carries only the fields being changed by a PATCH request —
// nil means "leave as-is."
type ProfilePatch struct {
	Name         *string
	Role         *string
	Persona      *string
	Instructions *string
	Tone         *string
	DefaultTools *[]string
	MemoryScope  *string
	// ReportsTo semantics: SetReportsTo false = unchanged; true with
	// ReportsTo nil = clear (top level); true with an id = re-parent.
	SetReportsTo      bool
	ReportsTo         *string
	ModelBackend      *string
	ScheduleRule      *string
	PermissionProfile *string
}

// reportsToValue maps the patch's ReportsTo pointer to its SQL value: an id,
// or NULL when clearing (nil / empty string).
func reportsToValue(patch ProfilePatch) any {
	if patch.ReportsTo == nil || *patch.ReportsTo == "" {
		return nil
	}
	return *patch.ReportsTo
}

func (r *Repository) UpdateProfile(ctx context.Context, id string, patch ProfilePatch) (*AgentProfile, error) {
	var toolsJSON []byte
	if patch.DefaultTools != nil {
		b, err := json.Marshal(*patch.DefaultTools)
		if err != nil {
			return nil, fmt.Errorf("agents: marshal default_tools: %w", err)
		}
		toolsJSON = b
	}
	row := r.db.QueryRowContext(ctx, `
		UPDATE agent_profiles SET
			name = COALESCE(?, name),
			role = COALESCE(?, role),
			persona = COALESCE(?, persona),
			instructions = COALESCE(?, instructions),
			tone = COALESCE(?, tone),
			default_tools = COALESCE(?, default_tools),
			memory_scope = COALESCE(?, memory_scope),
			model_backend = COALESCE(?, model_backend),
			schedule_rule = COALESCE(?, schedule_rule),
			permission_profile = COALESCE(?, permission_profile),
			reports_to = CASE WHEN ? THEN ? ELSE reports_to END,
			updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		WHERE id = ?
		RETURNING `+profileColumns,
		patch.Name, patch.Role, patch.Persona, patch.Instructions, patch.Tone, toolsJSON, patch.MemoryScope, patch.ModelBackend, patch.ScheduleRule, patch.PermissionProfile,
		patch.SetReportsTo, reportsToValue(patch), id,
	)
	return scanProfile(row)
}

func (r *Repository) DeleteProfile(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM agent_profiles WHERE id = ?`, id)
	return err
}

const templateColumns = `id, name, role, persona, instructions, tone, default_tools, memory_scope, model_backend, schedule_rule, permission_profile, created_at, updated_at`

func scanTemplate(row scanner) (*AgentProfileTemplate, error) {
	var t AgentProfileTemplate
	var toolsRaw []byte
	if err := row.Scan(&t.ID, &t.Name, &t.Role, &t.Persona, &t.Instructions, &t.Tone, &toolsRaw, &t.MemoryScope, &t.ModelBackend, &t.ScheduleRule, &t.PermissionProfile, &t.CreatedAt, &t.UpdatedAt); err != nil {
		return nil, err
	}
	if len(toolsRaw) > 0 {
		if err := json.Unmarshal(toolsRaw, &t.DefaultTools); err != nil {
			return nil, fmt.Errorf("agents: unmarshal template default_tools: %w", err)
		}
	}
	return &t, nil
}

func (r *Repository) ListTemplates(ctx context.Context) ([]*AgentProfileTemplate, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+templateColumns+` FROM agent_profile_templates ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []*AgentProfileTemplate
	for rows.Next() {
		t, err := scanTemplate(rows)
		if err != nil {
			return nil, err
		}
		templates = append(templates, t)
	}
	return templates, rows.Err()
}

func (r *Repository) GetTemplate(ctx context.Context, id string) (*AgentProfileTemplate, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+templateColumns+` FROM agent_profile_templates WHERE id = ?`, id)
	return scanTemplate(row)
}

// GetOrCreateAgentForUser looks up the single Agent runtime record for a
// user, creating it if this is the user's first AgentProfile. There is no
// user/agent onboarding flow yet (see AGENTS.md) — this is the stand-in.
func (r *Repository) GetOrCreateAgentForUser(ctx context.Context, userID string) (*Agent, error) {
	const agentColumns = `id, user_id, name, status, created_at, updated_at`

	var a Agent
	err := r.db.QueryRowContext(ctx, `SELECT `+agentColumns+` FROM agents WHERE user_id = ? LIMIT 1`, userID).
		Scan(&a.ID, &a.UserID, &a.Name, &a.Status, &a.CreatedAt, &a.UpdatedAt)
	if err == nil {
		return &a, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if err := r.ensureStandInUser(ctx, userID); err != nil {
		return nil, err
	}

	err = r.db.QueryRowContext(ctx, `
		INSERT INTO agents (id, user_id, name, status) VALUES (?, ?, 'Hermes', 'active')
		RETURNING `+agentColumns, uuid.NewString(), userID).
		Scan(&a.ID, &a.UserID, &a.Name, &a.Status, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *Repository) ensureStandInUser(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT OR IGNORE INTO users (id, email, display_name)
		VALUES (?, ?, 'AULAR User')`, userID, userID+"@aular.local")
	return err
}

// ProfileOwnedBy reports whether the profile exists and belongs to the user
// (profiles scope to users through their agents row).
func (r *Repository) ProfileOwnedBy(ctx context.Context, profileID, userID string) (bool, error) {
	var n int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM agent_profiles p
		  JOIN agents a ON a.id = p.agent_id
		 WHERE p.id = ? AND a.user_id = ?`, profileID, userID).Scan(&n)
	return n > 0, err
}

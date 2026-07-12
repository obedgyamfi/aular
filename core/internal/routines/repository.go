package routines

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

const columns = `id, user_id, agent_profile_id, name, schedule_rule, target_behavior, priority, active, cron_job_id, last_run_at, created_at, updated_at`

type scanner interface {
	Scan(dest ...any) error
}

func scanRoutine(row scanner) (*Routine, error) {
	var (
		r       Routine
		agentID sql.NullString
		active  int64
		lastRun sql.NullTime
	)
	if err := row.Scan(
		&r.ID, &r.UserID, &agentID, &r.Name, &r.ScheduleRule, &r.TargetBehavior,
		&r.Priority, &active, &r.CronJobID, &lastRun, &r.CreatedAt, &r.UpdatedAt,
	); err != nil {
		return nil, err
	}
	r.AgentProfileID = agentID.String
	r.Active = active != 0
	if lastRun.Valid {
		r.LastRunAt = &lastRun.Time
	}
	return &r, nil
}

// ListByAgent returns an agent's routines, newest first.
func (r *Repository) ListByAgent(ctx context.Context, agentProfileID string) ([]*Routine, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+columns+` FROM routines WHERE agent_profile_id = ? ORDER BY created_at DESC`,
		agentProfileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Routine
	for rows.Next() {
		rt, err := scanRoutine(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rt)
	}
	return out, rows.Err()
}

func (r *Repository) Get(ctx context.Context, id string) (*Routine, error) {
	return scanRoutine(r.db.QueryRowContext(ctx,
		`SELECT `+columns+` FROM routines WHERE id = ?`, id))
}

func (r *Repository) Create(ctx context.Context, rt *Routine) (*Routine, error) {
	return scanRoutine(r.db.QueryRowContext(ctx, `
		INSERT INTO routines (id, user_id, agent_profile_id, name, schedule_rule, target_behavior, priority, active, cron_job_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING `+columns,
		uuid.NewString(), rt.UserID, nullable(rt.AgentProfileID), rt.Name, rt.ScheduleRule,
		rt.TargetBehavior, rt.Priority, boolToInt(rt.Active), rt.CronJobID))
}

// Update patches the editable fields (name/schedule/behavior/priority) and
// bumps updated_at. It does NOT touch active/cron_job_id — use SetActive.
func (r *Repository) Update(ctx context.Context, id, name, scheduleRule, targetBehavior, priority string) (*Routine, error) {
	return scanRoutine(r.db.QueryRowContext(ctx, `
		UPDATE routines
		SET name = ?, schedule_rule = ?, target_behavior = ?, priority = ?, updated_at = ?
		WHERE id = ?
		RETURNING `+columns,
		name, scheduleRule, targetBehavior, priority, now(), id))
}

// SetActive flips a routine's active flag and records the bridged cron job id
// (empty when deactivating).
func (r *Repository) SetActive(ctx context.Context, id string, active bool, cronJobID string) (*Routine, error) {
	return scanRoutine(r.db.QueryRowContext(ctx, `
		UPDATE routines SET active = ?, cron_job_id = ?, updated_at = ? WHERE id = ?
		RETURNING `+columns,
		boolToInt(active), cronJobID, now(), id))
}

// Delete removes a routine and returns the cron job it was bridged to (so the
// caller can tear it down). sql.ErrNoRows if it didn't exist.
func (r *Repository) Delete(ctx context.Context, id string) (cronJobID string, err error) {
	err = r.db.QueryRowContext(ctx,
		`DELETE FROM routines WHERE id = ? RETURNING cron_job_id`, id).Scan(&cronJobID)
	return cronJobID, err
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func now() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}

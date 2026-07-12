// Package usersruntime is the registry of per-user Hermes runtimes:
// profile name, adapter port, internal token, lifecycle status.
package usersruntime

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type Row struct {
	UserID        string
	ProfileName   string
	AdapterPort   int
	InternalToken string
	Status        string // provisioning | ready | failed | disabled
	HomeChannelID string
	LastActiveAt  *time.Time
}

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

var ErrNotFound = errors.New("usersruntime: not found")

const cols = `user_id, profile_name, adapter_port, internal_token, status, home_channel_id`

func (r *Repository) scan(row *sql.Row) (*Row, error) {
	var rt Row
	err := row.Scan(&rt.UserID, &rt.ProfileName, &rt.AdapterPort, &rt.InternalToken, &rt.Status, &rt.HomeChannelID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &rt, nil
}

func (r *Repository) ForUser(ctx context.Context, userID string) (*Row, error) {
	return r.scan(r.db.QueryRowContext(ctx,
		`SELECT `+cols+` FROM users_runtime WHERE user_id = ?`, userID))
}

func (r *Repository) ByToken(ctx context.Context, token string) (*Row, error) {
	return r.scan(r.db.QueryRowContext(ctx,
		`SELECT `+cols+` FROM users_runtime WHERE internal_token = ?`, token))
}

func (r *Repository) List(ctx context.Context) ([]Row, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+cols+` FROM users_runtime`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var rt Row
		if err := rows.Scan(&rt.UserID, &rt.ProfileName, &rt.AdapterPort, &rt.InternalToken, &rt.Status, &rt.HomeChannelID); err != nil {
			return nil, err
		}
		out = append(out, rt)
	}
	return out, rows.Err()
}

// Create inserts a provisioning row; UNIQUE constraints reject port/name races.
func (r *Repository) Create(ctx context.Context, rt Row) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO users_runtime (user_id, profile_name, adapter_port, internal_token, status, home_channel_id)
		VALUES (?, ?, ?, ?, ?, ?)`,
		rt.UserID, rt.ProfileName, rt.AdapterPort, rt.InternalToken, rt.Status, rt.HomeChannelID)
	return err
}

func (r *Repository) SetStatus(ctx context.Context, userID, status string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users_runtime SET status = ? WHERE user_id = ?`, status, userID)
	return err
}

func (r *Repository) SetHomeChannel(ctx context.Context, userID, channelID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users_runtime SET home_channel_id = ? WHERE user_id = ?`, channelID, userID)
	return err
}

func (r *Repository) Delete(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM users_runtime WHERE user_id = ?`, userID)
	return err
}

func (r *Repository) TouchStarted(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users_runtime SET last_started_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
		       last_active_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		 WHERE user_id = ?`, userID)
	return err
}

func (r *Repository) TouchActive(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users_runtime SET last_active_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		 WHERE user_id = ?`, userID)
	return err
}

// MaxPort returns the highest allocated adapter port (0 when none ≥ floor).
func (r *Repository) MaxPort(ctx context.Context, floor int) (int, error) {
	var p sql.NullInt64
	err := r.db.QueryRowContext(ctx,
		`SELECT MAX(adapter_port) FROM users_runtime WHERE adapter_port >= ?`, floor).Scan(&p)
	return int(p.Int64), err
}

// IdleUsers lists users whose gateway has seen no activity for longer than
// olderThan (the idle reaper's input). The default runtime is excluded — it
// is systemd-managed, not supervised here.
func (r *Repository) IdleUsers(ctx context.Context, olderThan time.Duration) ([]string, error) {
	cutoff := time.Now().Add(-olderThan).UTC().Format("2006-01-02T15:04:05.000Z")
	rows, err := r.db.QueryContext(ctx, `
		SELECT user_id FROM users_runtime
		 WHERE status = 'ready'
		   AND profile_name != '__default__'
		   AND last_active_at IS NOT NULL
		   AND last_active_at < ?`, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

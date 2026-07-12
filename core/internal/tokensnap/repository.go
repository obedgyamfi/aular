// Package tokensnap stores per-session token counters captured at metrics
// reset; dashboards subtract them from Hermes' cumulative session counters.
package tokensnap

import (
	"context"
	"database/sql"
)

type Snapshot struct {
	InputTokens  int64
	OutputTokens int64
	ToolCalls    int64
}

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// ReplaceAll swaps one user's snapshot set atomically.
func (r *Repository) ReplaceAll(ctx context.Context, userID string, snaps map[string]Snapshot) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM metrics_snapshots WHERE user_id = ?`, userID); err != nil {
		return err
	}
	for id, s := range snaps {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO metrics_snapshots (user_id, session_id, input_tokens, output_tokens, tool_calls) VALUES (?, ?, ?, ?, ?)`,
			userID, id, s.InputTokens, s.OutputTokens, s.ToolCalls); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// All returns one user's snapshots keyed by session id.
func (r *Repository) All(ctx context.Context, userID string) (map[string]Snapshot, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT session_id, input_tokens, output_tokens, tool_calls FROM metrics_snapshots WHERE user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]Snapshot{}
	for rows.Next() {
		var id string
		var s Snapshot
		if err := rows.Scan(&id, &s.InputTokens, &s.OutputTokens, &s.ToolCalls); err != nil {
			return nil, err
		}
		out[id] = s
	}
	return out, rows.Err()
}

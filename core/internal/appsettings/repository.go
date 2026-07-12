// Package appsettings is a tiny key/value store for app-level state
// (e.g. the metrics epoch).
package appsettings

import (
	"context"
	"database/sql"
	"errors"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Get(ctx context.Context, userID, key string) (string, error) {
	var v string
	err := r.db.QueryRowContext(ctx,
		`SELECT value FROM app_settings WHERE user_id = ? AND key = ?`, userID, key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return v, err
}

func (r *Repository) Set(ctx context.Context, userID, key, value string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO app_settings (user_id, key, value) VALUES (?, ?, ?)
		ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value,
			updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`, userID, key, value)
	return err
}

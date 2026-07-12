package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

const (
	sessionTTL = 30 * 24 * time.Hour
	// last_seen_at is refreshed at most this often to keep Resolve cheap.
	seenRefreshEvery = 5 * time.Minute
)

var ErrNoSession = errors.New("auth: no valid session")

// Sessions is the auth_sessions repository. This table is the seam a Redis
// store would replace — nothing outside this file touches it.
type Sessions struct {
	db *sql.DB
}

func NewSessions(db *sql.DB) *Sessions {
	return &Sessions{db: db}
}

func sqlTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

// Create mints a session for userID and returns the raw token (stored hashed).
func (s *Sessions) Create(ctx context.Context, userID, userAgent, ip string) (string, error) {
	token, err := NewToken()
	if err != nil {
		return "", err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO auth_sessions (token_hash, user_id, expires_at, user_agent, ip)
		VALUES (?, ?, ?, ?, ?)`,
		HashToken(token), userID, sqlTime(time.Now().Add(sessionTTL)), userAgent, ip)
	if err != nil {
		return "", err
	}
	return token, nil
}

// Resolve maps a raw token to its user id, sliding expiry forward on use.
func (s *Sessions) Resolve(ctx context.Context, token string) (string, error) {
	if token == "" {
		return "", ErrNoSession
	}
	hash := HashToken(token)
	var userID string
	var expires, lastSeen string
	err := s.db.QueryRowContext(ctx, `
		SELECT user_id, expires_at, last_seen_at FROM auth_sessions WHERE token_hash = ?`,
		hash).Scan(&userID, &expires, &lastSeen)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNoSession
	}
	if err != nil {
		return "", err
	}
	exp, err := time.Parse(time.RFC3339, expires)
	if err != nil || time.Now().After(exp) {
		_, _ = s.db.ExecContext(ctx, `DELETE FROM auth_sessions WHERE token_hash = ?`, hash)
		return "", ErrNoSession
	}
	if seen, err := time.Parse(time.RFC3339, lastSeen); err != nil || time.Since(seen) > seenRefreshEvery {
		now := time.Now()
		_, _ = s.db.ExecContext(ctx, `
			UPDATE auth_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?`,
			sqlTime(now), sqlTime(now.Add(sessionTTL)), hash)
	}
	return userID, nil
}

func (s *Sessions) Delete(ctx context.Context, token string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM auth_sessions WHERE token_hash = ?`, HashToken(token))
	return err
}

func (s *Sessions) DeleteAllForUser(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM auth_sessions WHERE user_id = ?`, userID)
	return err
}

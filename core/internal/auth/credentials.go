package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Credentials reads/writes user_credentials and resolves logins by email.
type Credentials struct {
	db *sql.DB
}

func NewCredentials(db *sql.DB) *Credentials {
	return &Credentials{db: db}
}

var ErrBadLogin = errors.New("auth: invalid email or password")

// SetPassword upserts the argon2id hash for a user.
func (c *Credentials) SetPassword(ctx context.Context, userID, password string) error {
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	_, err = c.db.ExecContext(ctx, `
		INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)
		ON CONFLICT (user_id) DO UPDATE SET password_hash = excluded.password_hash,
			updated_at = ?`, userID, hash, sqlTime(time.Now()))
	return err
}

// VerifyLogin resolves email → user id iff the password matches. A uniform
// ErrBadLogin covers unknown email, no credentials, and wrong password.
func (c *Credentials) VerifyLogin(ctx context.Context, email, password string) (string, error) {
	var userID, hash string
	err := c.db.QueryRowContext(ctx, `
		SELECT u.id, cr.password_hash
		  FROM users u JOIN user_credentials cr ON cr.user_id = u.id
		 WHERE u.email = ?`, email).Scan(&userID, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		// Burn comparable time so unknown emails aren't distinguishable.
		VerifyPassword(password, dummyPHC)
		return "", ErrBadLogin
	}
	if err != nil {
		return "", err
	}
	if !VerifyPassword(password, hash) {
		return "", ErrBadLogin
	}
	return userID, nil
}

// A syntactically valid hash of an unguessable value, for timing equalization.
var dummyPHC = func() string {
	h, _ := HashPassword("aular-dummy-timing-equalizer")
	return h
}()

package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"strings"
	"time"
)

// Invites gates signup on a single-use code (AULAR_SIGNUP_MODE=invite).
type Invites struct {
	db *sql.DB
}

func NewInvites(db *sql.DB) *Invites {
	return &Invites{db: db}
}

var ErrBadInvite = errors.New("auth: invalid or already-used invite code")

// Mint creates a fresh single-use code.
func (i *Invites) Mint(ctx context.Context, createdBy string) (string, error) {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	code := strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
	_, err := i.db.ExecContext(ctx,
		`INSERT INTO invite_codes (code, created_by) VALUES (?, ?)`, code, createdBy)
	return code, err
}

// Redeem consumes a code for userID; ErrBadInvite if unknown or already used.
func (i *Invites) Redeem(ctx context.Context, code, userID string) error {
	res, err := i.db.ExecContext(ctx, `
		UPDATE invite_codes SET used_by = ?, used_at = ?
		 WHERE code = ? AND used_by IS NULL`,
		userID, sqlTime(time.Now()), strings.TrimSpace(strings.ToLower(code)))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrBadInvite
	}
	return nil
}

package users

import (
	"context"
	"database/sql"
	"errors"

	"github.com/google/uuid"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

var ErrNotFound = errors.New("users: not found")

func (r *Repository) Get(ctx context.Context, id string) (*User, error) {
	return r.one(ctx, `WHERE id = ?`, id)
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (*User, error) {
	return r.one(ctx, `WHERE email = ?`, email)
}

func (r *Repository) one(ctx context.Context, where string, arg any) (*User, error) {
	u := &User{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, email, display_name, timezone, locale, created_at, updated_at
		  FROM users `+where, arg).
		Scan(&u.ID, &u.Email, &u.DisplayName, &u.Timezone, &u.Locale, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

// Create inserts a fresh account; schema defaults fill the rest.
// Email uniqueness is enforced by the schema.
// First returns the earliest-created user — on a desktop install, the
// person the machine belongs to. ErrNotFound when nobody signed up yet.
func (r *Repository) First(ctx context.Context) (*User, error) {
	u := &User{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, email, display_name, timezone, locale, created_at, updated_at
		  FROM users ORDER BY created_at ASC LIMIT 1`).
		Scan(&u.ID, &u.Email, &u.DisplayName, &u.Timezone, &u.Locale, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *Repository) Create(ctx context.Context, email, displayName string) (*User, error) {
	id := uuid.NewString()
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)`, id, email, displayName)
	if err != nil {
		return nil, err
	}
	return r.Get(ctx, id)
}

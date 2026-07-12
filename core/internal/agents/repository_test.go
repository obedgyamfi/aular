package agents

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func testRepo(t *testing.T) *Repository {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	stmts := []string{
		`PRAGMA foreign_keys = ON`,
		`CREATE TABLE users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			display_name TEXT NOT NULL,
			timezone TEXT NOT NULL DEFAULT 'UTC',
			locale TEXT NOT NULL DEFAULT 'en-US',
			preferences TEXT NOT NULL DEFAULT '{}',
			notification_settings TEXT NOT NULL DEFAULT '{}',
			created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		)`,
		`CREATE TABLE agents (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'active',
			created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		)`,
		`CREATE TABLE agent_profiles (
			id TEXT PRIMARY KEY,
			agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
			template_id TEXT,
			reports_to TEXT,
			name TEXT NOT NULL,
			role TEXT NOT NULL,
			persona TEXT NOT NULL DEFAULT '',
			instructions TEXT NOT NULL DEFAULT '',
			tone TEXT NOT NULL DEFAULT '',
			default_tools TEXT NOT NULL DEFAULT '[]',
			memory_scope TEXT NOT NULL DEFAULT 'user',
			model_backend TEXT NOT NULL DEFAULT 'ollama',
			schedule_rule TEXT NOT NULL DEFAULT '',
			permission_profile TEXT NOT NULL DEFAULT 'standard',
			created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		)`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("exec schema: %v", err)
		}
	}
	return NewRepository(db)
}

func TestGetOrCreateSystemProfileCreatesMissingStandInUser(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()

	profile, err := repo.GetOrCreateSystemProfileForUser(ctx, "user-dev")
	if err != nil {
		t.Fatalf("get or create system profile: %v", err)
	}
	if profile.Name != "AULAR" || profile.Role != "system" {
		t.Fatalf("unexpected system profile: %#v", profile)
	}

	again, err := repo.GetOrCreateSystemProfileForUser(ctx, "user-dev")
	if err != nil {
		t.Fatalf("get existing system profile: %v", err)
	}
	if again.ID != profile.ID {
		t.Fatalf("expected existing profile %q, got %q", profile.ID, again.ID)
	}
}

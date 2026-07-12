// Package db wraps the SQLite connection used by every repository.
package db

import (
	"context"
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// Connect opens a SQLite database at path (e.g. the AULAR_DB_PATH env var)
// and verifies it with a ping. Foreign key enforcement is off by default in
// SQLite -- turned on via the _pragma DSN param, since the schema relies on
// ON DELETE CASCADE/SET NULL. MaxOpenConns is pinned to 1: SQLite only
// really supports one writer at a time, and pinning avoids SQLITE_BUSY
// errors outright rather than tuning around them -- fine at this app's
// scale (single user).
func Connect(ctx context.Context, path string) (*sql.DB, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)", path)

	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("db: open: %w", err)
	}
	sqlDB.SetMaxOpenConns(1)

	if err := sqlDB.PingContext(ctx); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("db: ping: %w", err)
	}
	return sqlDB, nil
}

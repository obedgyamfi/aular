// Package server boots the AULAR shell: database, HTTP API, and the org
// engine that was linked at build time. It is deliberately thin — the domain
// lives in internal/, and everything organizational lives behind engine.Engine.
package server

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/pressly/goose/v3"

	core "github.com/obedgyamfi/aular/core"
	"github.com/obedgyamfi/aular/core/engine"
	"github.com/obedgyamfi/aular/core/internal/httpapi"
	"github.com/obedgyamfi/aular/core/internal/infra/config"
	"github.com/obedgyamfi/aular/core/internal/infra/db"
)

// Run starts the API with the given engine and blocks until the process is
// asked to stop. Tauri supervises this as a sidecar and kills it on quit.
func Run(eng engine.Engine) error {
	ctx := context.Background()

	// The desktop app keeps its data in the OS's app-data directory, not the
	// working directory — a double-clicked app has no meaningful cwd.
	if os.Getenv("AULAR_DB_PATH") == "" {
		if dir, err := os.UserConfigDir(); err == nil {
			appDir := filepath.Join(dir, "aular")
			if err := os.MkdirAll(appDir, 0o755); err == nil {
				os.Setenv("AULAR_DB_PATH", filepath.Join(appDir, "aular.db"))
			}
		}
	}

	// A desktop app must be zero-config: no one is going to set environment
	// variables before double-clicking an icon. The internal token is a secret
	// shared with the local Hermes plugin, so the app mints one on first run
	// and keeps it in its own data directory.
	if os.Getenv("AULAR_INTERNAL_TOKEN") == "" {
		tok, err := internalToken()
		if err != nil {
			return err
		}
		os.Setenv("AULAR_INTERNAL_TOKEN", tok)
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if p := os.Getenv("AULAR_PORT"); p != "" {
		cfg.Port = p
	}

	sqlDB, err := db.Connect(ctx, cfg.DBPath)
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	if err := migrate(sqlDB); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	srv := httpapi.NewServer(cfg, sqlDB, eng)

	httpSrv := &http.Server{
		Addr:              "127.0.0.1:" + cfg.Port,
		Handler:           allowWebview(srv.Router()),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Tauri sends SIGTERM when the window closes; shut down cleanly so SQLite
	// is never left mid-write.
	stopCtx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-stopCtx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(shutdown)
	}()

	log.Printf("aular-core listening on %s (engine: %s, agent limit: %d)",
		httpSrv.Addr, eng.Name(), eng.MaxAgents())
	if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// internalToken loads (or creates) the secret the app shares with its local
// Hermes runtime. Stored 0600 beside the database, never in the repo.
func internalToken() (string, error) {
	dir := filepath.Dir(os.Getenv("AULAR_DB_PATH"))
	if dir == "" || dir == "." {
		dir = "."
	}
	path := filepath.Join(dir, "internal-token")
	if b, err := os.ReadFile(path); err == nil && len(b) > 0 {
		return strings.TrimSpace(string(b)), nil
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	tok := hex.EncodeToString(raw)
	if err := os.WriteFile(path, []byte(tok), 0o600); err != nil {
		return "", err
	}
	return tok, nil
}

// migrate brings the database up to the embedded schema. Runs on every launch;
// it is a no-op once the database is current.
func migrate(sqlDB *sql.DB) error {
	goose.SetBaseFS(core.Migrations)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("sqlite3"); err != nil {
		return err
	}
	return goose.Up(sqlDB, "migrations")
}

// allowWebview lets the app's own window talk to the backend. The listener is
// bound to loopback, so the only callers that can reach it are the Tauri
// webview and a local dev server — but a browser still needs to be told so in
// a header, or every fetch fails as an opaque CORS error with nothing in the
// log to explain it.
func allowWebview(next http.Handler) http.Handler {
	allowed := map[string]bool{
		"http://localhost:1420":   true,
		"http://127.0.0.1:1420":   true,
		"tauri://localhost":       true,
		"http://tauri.localhost":  true,
		"https://tauri.localhost": true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

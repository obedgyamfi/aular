// Package server boots the AULAR shell: database, HTTP API, and the org
// engine that was linked at build time. It is deliberately thin — the domain
// lives in internal/, and everything organizational lives behind engine.Engine.
package server

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

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

	srv := httpapi.NewServer(cfg, sqlDB, eng)

	httpSrv := &http.Server{
		Addr:              "127.0.0.1:" + cfg.Port,
		Handler:           srv.Router(),
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

// Package server boots the shell's HTTP API. It is deliberately thin: the
// interesting behavior lives either in the domain packages (chat, agents,
// Hermes bridge) or behind the engine.Engine seam.
package server

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/obedgyamfi/aular/core/engine"
)

// localOnly allows the webview to call the backend. The listener is already
// bound to loopback, so the only origins that can reach it are the Tauri
// window (tauri://, http://tauri.localhost) and a local dev server — but the
// browser still needs to be told that in a header, or every fetch fails
// silently as an opaque CORS error.
func localOnly(next http.Handler) http.Handler {
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
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Run starts the API with the given engine and blocks until the process is
// asked to stop. Tauri supervises this as a sidecar and kills it on quit.
func Run(eng engine.Engine) error {
	port := os.Getenv("AULAR_PORT")
	if port == "" {
		port = "8787"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","engine":%q,"max_agents":%d}`, eng.Name(), eng.MaxAgents())
	})

	srv := &http.Server{
		Addr:              "127.0.0.1:" + port,
		Handler:           localOnly(mux),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Tauri sends SIGTERM when the window closes; shut down cleanly so the
	// SQLite file is never left mid-write.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()

	log.Printf("aular-core listening on %s (engine: %s)", srv.Addr, eng.Name())
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

package realtime

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// The packaged window's origin is a bare host (http://localhost on
// Linux/macOS webviews, http://tauri.localhost on Windows WebView2) while the
// sidecar answers on 127.0.0.1 — a cross-origin upgrade. These dials are the
// exact handshakes the shipped app performs; if the origin list regresses,
// the app silently loses realtime and replies only appear on refetch.
func TestServeAcceptsWebviewOrigins(t *testing.T) {
	hub := NewHub()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = hub.Serve(w, r, "user-1")
	}))
	defer srv.Close()
	wsURL := "ws" + srv.URL[len("http"):]

	for _, origin := range []string{
		"http://localhost",       // packaged window, Linux/macOS
		"tauri://localhost",      // packaged window, macOS custom scheme
		"http://tauri.localhost", // packaged window, Windows
		"http://localhost:1420",  // dev server
	} {
		t.Run(origin, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
				HTTPHeader: http.Header{"Origin": []string{origin}},
			})
			if err != nil {
				t.Fatalf("origin %q refused: %v", origin, err)
			}
			conn.Close(websocket.StatusNormalClosure, "")
		})
	}
}

func TestServeRefusesForeignOrigins(t *testing.T) {
	hub := NewHub()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = hub.Serve(w, r, "user-1")
	}))
	defer srv.Close()
	wsURL := "ws" + srv.URL[len("http"):]

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"https://evil.example"}},
	})
	if err == nil {
		conn.Close(websocket.StatusNormalClosure, "")
		t.Fatal("a foreign website's origin was allowed to open the socket")
	}
}

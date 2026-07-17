// Package realtime is the WebSocket broadcast gateway. Events route by
// owner: every connection belongs to a user (established at upgrade), and
// an event only reaches that user's connections. There's no finer
// per-conversation subscription filtering.
package realtime

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/coder/websocket"
)

// Event is the envelope pushed to the owner's connected clients. UserID is
// routing metadata only — it is never serialized to the wire.
type Event struct {
	Type           string `json:"type"`
	ConversationID string `json:"conversation_id,omitempty"`
	Data           any    `json:"data"`
	UserID         string `json:"-"`
}

type client struct {
	conn   *websocket.Conn
	send   chan []byte
	userID string
}

type Hub struct {
	mu      sync.Mutex
	clients map[*client]struct{}
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*client]struct{})}
}

// Broadcast fans an event out to the owning user's connections. Never
// blocks on a slow client — a full send buffer just drops the message for
// that client. An event without a UserID is dropped (fail closed) so a
// missed call site can't leak across accounts.
func (h *Hub) Broadcast(event Event) {
	if event.UserID == "" {
		log.Printf("realtime: dropping unrouted %s event (no user id)", event.Type)
		return
	}
	payload, err := json.Marshal(event)
	if err != nil {
		log.Printf("realtime: marshal event: %v", err)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if c.userID != event.UserID {
			continue
		}
		select {
		case c.send <- payload:
		default:
			log.Printf("realtime: client send buffer full, dropping event")
		}
	}
}

// Serve upgrades the request to a WebSocket connection and blocks until the
// client disconnects, registering it with the hub (as userID's connection)
// for the duration.
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request, userID string) error {
	// The web client is served from a different origin
	// (localhost:3001) than this API (localhost:8080) in local dev, so the
	// default same-origin check needs localhost patterns; tunnel access is
	// same-origin (the tunnel proxy fronts both) and passes on its own.
	// Session auth is the cookie/?session= (handlers_ws.go); the origin
	// check keeps other websites from riding a logged-in browser.
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: wsOriginPatterns(),
	})
	if err != nil {
		return err
	}
	defer conn.CloseNow()

	c := &client{conn: conn, send: make(chan []byte, 16), userID: userID}
	h.register(c)
	defer h.unregister(c)

	ctx := r.Context()
	done := make(chan struct{})

	// Writer: drains the send buffer to the connection.
	go func() {
		defer close(done)
		for payload := range c.send {
			if err := conn.Write(ctx, websocket.MessageText, payload); err != nil {
				return
			}
		}
	}()

	// Reader: we don't expect inbound messages, but must keep reading to
	// process control frames and detect disconnects.
	for {
		if _, _, err := conn.Read(ctx); err != nil {
			close(c.send)
			<-done
			return nil
		}
	}
}

func (h *Hub) register(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = struct{}{}
}

func (h *Hub) unregister(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, c)
}

// wsOriginPatterns lists cross-origin hosts allowed to open the socket.
// Override with AULAR_WS_ORIGINS (comma-separated host patterns).
//
// Patterns match the Origin's *host* — bare, no scheme, and no port unless
// the origin carries one. The packaged window's origin is http://localhost
// (Linux/macOS webviews) or http://tauri.localhost (Windows WebView2): bare
// hosts, which "localhost:*" misses. Without the bare entries the upgrade is
// refused and the app silently loses realtime — replies only surface when a
// refetch happens to run.
func wsOriginPatterns() []string {
	if v := os.Getenv("AULAR_WS_ORIGINS"); v != "" {
		return strings.Split(v, ",")
	}
	return []string{
		"localhost",       // the packaged window (Linux, macOS webviews)
		"localhost:*",     // the dev server
		"tauri.localhost", // the packaged window (Windows WebView2)
		"127.0.0.1",
		"127.0.0.1:*",
	}
}

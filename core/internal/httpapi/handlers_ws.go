package httpapi

import (
	"log"
	"net/http"

	"github.com/obedgyamfi/aular/core/internal/auth"
)

// GET /ws — authenticated by the session cookie (same-site upgrades carry
// it), a ?session= query param for clients that can't (browsers' native
// WebSocket API can't set headers), or the legacy ?token= static token when
// AULAR_DEV_STATIC_AUTH is on.
func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	userID := s.resolveUser(r)
	if userID == "" {
		if tok := r.URL.Query().Get("session"); tok != "" {
			if id, err := s.sessions.Resolve(r.Context(), tok); err == nil {
				userID = id
			}
		}
	}
	if userID == "" && s.cfg.DevStaticAuth && r.URL.Query().Get("token") == s.cfg.APIToken {
		userID = s.cfg.UserID
	}
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "missing or invalid session")
		return
	}
	r = r.WithContext(auth.WithUserID(r.Context(), userID))
	// websocket.Accept already writes its own HTTP error response on
	// failure (e.g. bad upgrade headers) — just log, don't write again.
	if err := s.hub.Serve(w, r, userID); err != nil {
		log.Printf("httpapi: websocket session ended: %v", err)
	}
}

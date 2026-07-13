package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/obedgyamfi/aular/core/internal/auth"
)

const sessionCookie = "aular_session"

// sessionToken pulls the session token from the cookie or, for non-browser
// clients, a bearer Authorization header.
func sessionToken(r *http.Request) string {
	if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
		return c.Value
	}
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

// resolveUser authenticates a request: session cookie / bearer session token,
// falling back to the legacy static token only under AULAR_DEV_STATIC_AUTH.
// Returns "" when unauthenticated.
func (s *Server) resolveUser(r *http.Request) string {
	tok := sessionToken(r)
	if tok != "" {
		if userID, err := s.sessions.Resolve(r.Context(), tok); err == nil {
			return userID
		}
		if s.cfg.DevStaticAuth && tok == s.cfg.APIToken {
			return s.cfg.UserID
		}
	}
	return ""
}

// sessionAuth guards /api/v1: it resolves the caller's session and stamps
// the user id onto the request context (read via s.ctxUserID / auth.UserID).
func (s *Server) sessionAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := s.resolveUser(r)
		if userID == "" {
			writeError(w, http.StatusUnauthorized, "not signed in")
			return
		}
		next.ServeHTTP(w, r.WithContext(auth.WithUserID(r.Context(), userID)))
	})
}

// AppOrigins are the origins the desktop app itself speaks from: the webview
// (tauri://) and, during UI development, the Vite server. The backend listens
// on loopback only, so nothing else can reach it in the first place.
var AppOrigins = map[string]bool{
	"http://localhost:1420":   true,
	"http://127.0.0.1:1420":   true,
	"tauri://localhost":       true,
	"http://tauri.localhost":  true,
	"https://tauri.localhost": true,
}

// originCheck rejects state-changing requests from pages that aren't ours.
//
// Note what this is NOT for: the app authenticates with a Bearer token, which
// a browser never attaches on its own, so classic CSRF doesn't apply. This is
// depth — it stops a random web page a user has open from poking the loopback
// API. The app's own origins are always allowed (an earlier version wasn't,
// and silently rejected every login the desktop app made).
func originCheck(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
			origin := r.Header.Get("Origin")
			if origin != "" && !AppOrigins[origin] {
				switch r.Header.Get("Sec-Fetch-Site") {
				case "", "same-origin", "same-site", "none":
				default:
					writeError(w, http.StatusForbidden, "cross-site request rejected")
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

// ctxUserID is how every handler learns whose data to touch: the user id
// stamped on the context (by sessionAuth for API calls, or by the internal
// delivery entry points from the conversation's owner).
func (s *Server) ctxUserID(ctx context.Context) string {
	if id := auth.UserID(ctx); id != "" {
		return id
	}
	return s.cfg.UserID
}

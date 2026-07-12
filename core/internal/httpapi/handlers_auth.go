package httpapi

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/obedgyamfi/aular/core/internal/auth"
	"github.com/obedgyamfi/aular/core/internal/users"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type meResponse struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	DisplayName   string `json:"display_name"`
	SignupEnabled bool   `json:"signup_enabled"`
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.cfg.CookieSecure,
	})
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// POST /auth/login
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}
	userID, err := s.credentials.VerifyLogin(r.Context(), req.Email, req.Password)
	if errors.Is(err, auth.ErrBadLogin) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "login: "+err.Error())
		return
	}
	token, err := s.sessions.Create(r.Context(), userID, r.UserAgent(), clientIP(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "session: "+err.Error())
		return
	}
	s.setSessionCookie(w, token, int((30 * 24 * time.Hour).Seconds()))
	// First login on a new account (or a retry after a failed provision):
	// bring up their own Hermes runtime in the background. The UI works
	// immediately; the first agent turn waits on the gateway if needed.
	s.ensureRuntimeAsync(userID)
	u, err := s.usersRepo.Get(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user: "+err.Error())
		return
	}
	// The token is echoed for non-browser clients (curl, scripts) that prefer
	// Authorization: Bearer over the cookie jar.
	writeJSON(w, http.StatusOK, map[string]any{
		"user":  meResponse{ID: u.ID, Email: u.Email, DisplayName: u.DisplayName},
		"token": token,
	})
}

// POST /auth/logout
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if tok := sessionToken(r); tok != "" {
		_ = s.sessions.Delete(r.Context(), tok)
	}
	s.setSessionCookie(w, "", -1)
	w.WriteHeader(http.StatusNoContent)
}

// GET /auth/me — 401 body still reports whether signup is open so the login
// page knows which form to show.
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	signupOpen := s.cfg.SignupMode != "closed"
	userID := s.resolveUser(r)
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"error":          "not signed in",
			"signup_enabled": signupOpen,
		})
		return
	}
	u, err := s.usersRepo.Get(r.Context(), userID)
	if errors.Is(err, users.ErrNotFound) {
		s.setSessionCookie(w, "", -1)
		writeError(w, http.StatusUnauthorized, "account no longer exists")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, meResponse{
		ID: u.ID, Email: u.Email, DisplayName: u.DisplayName, SignupEnabled: signupOpen,
	})
}

type signupRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
	InviteCode  string `json:"invite_code"`
}

// POST /auth/signup — create an account (gated by AULAR_SIGNUP_MODE:
// closed | invite | open), then provision its own Hermes runtime in the
// background. A new account starts with nothing but its AULAR system agent —
// the org is theirs to build.
func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	if s.cfg.SignupMode == "closed" {
		writeError(w, http.StatusForbidden, "signup is not open on this instance")
		return
	}
	var req signupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		writeError(w, http.StatusBadRequest, "a valid email is required")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	if s.cfg.SignupMode == "invite" && strings.TrimSpace(req.InviteCode) == "" {
		writeError(w, http.StatusBadRequest, "an invite code is required")
		return
	}

	ctx := r.Context()
	if _, err := s.usersRepo.GetByEmail(ctx, req.Email); err == nil {
		writeError(w, http.StatusConflict, "an account with that email already exists")
		return
	}

	display := strings.TrimSpace(req.DisplayName)
	if display == "" {
		display = strings.SplitN(req.Email, "@", 2)[0]
	}
	u, err := s.usersRepo.Create(ctx, req.Email, display)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create account: "+err.Error())
		return
	}
	if s.cfg.SignupMode == "invite" {
		if err := s.invites.Redeem(ctx, req.InviteCode, u.ID); err != nil {
			// Roll the account back so a bad code can't leave a husk behind.
			_, _ = s.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, u.ID)
			writeError(w, http.StatusForbidden, "invalid or already-used invite code")
			return
		}
	}
	if err := s.credentials.SetPassword(ctx, u.ID, req.Password); err != nil {
		writeError(w, http.StatusInternalServerError, "set password: "+err.Error())
		return
	}

	token, err := s.sessions.Create(ctx, u.ID, r.UserAgent(), clientIP(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "session: "+err.Error())
		return
	}
	s.setSessionCookie(w, token, int((30 * 24 * time.Hour).Seconds()))
	s.ensureRuntimeAsync(u.ID) // their own Hermes profile + gateway
	writeJSON(w, http.StatusCreated, map[string]any{
		"user":  meResponse{ID: u.ID, Email: u.Email, DisplayName: u.DisplayName},
		"token": token,
	})
}

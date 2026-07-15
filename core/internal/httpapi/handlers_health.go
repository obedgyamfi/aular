package httpapi

import (
	"net/http"
	"sort"
	"strings"

	"github.com/obedgyamfi/aular/core/engine"
)

// GET /healthz — liveness, plus what the UI needs to present the app honestly:
// which engine is linked, the agent cap it imposes (0 = unlimited), which org
// surfaces this build actually serves, and whether the door is open. The auth
// screen reads `signup` to offer account creation and `has_accounts` to open
// a fresh install on "create account" instead of a sign-in nobody can pass.
func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	hasAccounts, err := s.credentials.HasAny(r.Context())
	if err != nil {
		hasAccounts = true // fail toward the quieter screen
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "ok",
		"engine":       s.engine.Name(),
		"max_agents":   s.engine.MaxAgents(),
		"capabilities": s.engineCapabilities(),
		"signup":       s.cfg.SignupMode,
		"has_accounts": hasAccounts,
	})
}

// engineCapabilities derives the capability list from the routes the engine
// mounts — one source of truth, no flag to drift.
func (s *Server) engineCapabilities() []string {
	caps := []string{}
	if rp, ok := s.engine.(engine.RouteProvider); ok {
		for prefix := range rp.APIRoutes() {
			caps = append(caps, strings.TrimPrefix(prefix, "/"))
		}
	}
	sort.Strings(caps)
	return caps
}

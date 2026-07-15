package httpapi

import (
	"net/http"
	"sort"
	"strings"

	"github.com/obedgyamfi/aular/core/engine"
)

// GET /healthz — liveness, plus what the UI needs to present the app honestly:
// which engine is linked, the agent cap it imposes (0 = unlimited), and which
// org surfaces this build actually serves. The UI shows the task board and
// briefs only when they're listed — same client, honest against any backend.
func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "ok",
		"engine":       s.engine.Name(),
		"max_agents":   s.engine.MaxAgents(),
		"capabilities": s.engineCapabilities(),
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

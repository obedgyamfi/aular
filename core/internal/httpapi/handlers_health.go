package httpapi

import "net/http"

// GET /healthz — liveness, plus what the UI needs to present the app honestly:
// which engine is linked, and the agent cap it imposes (0 = unlimited).
func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":     "ok",
		"engine":     s.engine.Name(),
		"max_agents": s.engine.MaxAgents(),
	})
}

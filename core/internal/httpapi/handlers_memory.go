package httpapi

import "net/http"

// GET /api/v1/memory — what the AULAR agents remember: user facts/preferences
// plus learned skills, read live from the Hermes memory graph. Read-only; the
// store is owned by the Hermes runtime, not core-api.
func (s *Server) handleGetMemory(w http.ResponseWriter, r *http.Request) {
	graph, err := s.userMemory(r.Context()).Read(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, "read memory: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, graph)
}

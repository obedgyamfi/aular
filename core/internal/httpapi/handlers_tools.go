package httpapi

import "net/http"

// GET /api/v1/tool-definitions — the registry the "Add Agent" screen
// renders as a tool checklist.
func (s *Server) handleListToolDefinitions(w http.ResponseWriter, r *http.Request) {
	defs, err := s.toolsRepo.ListDefinitions(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list tool definitions: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, defs)
}

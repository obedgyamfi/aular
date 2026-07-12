package httpapi

import "net/http"

// GET /api/v1/agent-profile-templates — the installable builtin persona
// gallery (Hermes, Chronos, Mnemosyne, Athena, Hephaestus, Gaia, Atlas, Echo).
func (s *Server) handleListTemplates(w http.ResponseWriter, r *http.Request) {
	templates, err := s.agentsRepo.ListTemplates(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list templates: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, templates)
}

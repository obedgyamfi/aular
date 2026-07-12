package httpapi

import (
	"net/http"

	"github.com/obedgyamfi/aular/core/internal/modelconfig"
)

// GET /api/v1/settings/model — current model/provider AULAR's agents run on,
// with the API key redacted (only key_set is reported).
func (s *Server) handleGetModelSettings(w http.ResponseWriter, r *http.Request) {
	cfg, err := modelconfig.ReadFrom(s.userHome(r.Context()))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "read model settings: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

type modelSettingsRequest struct {
	Model         string `json:"model"`
	Provider      string `json:"provider"`
	BaseURL       string `json:"base_url"`
	APIMode       string `json:"api_mode"`
	ContextLength int    `json:"context_length"`
	APIKey        string `json:"api_key"` // optional; only written when non-empty
}

// PUT /api/v1/settings/model — bring your own provider/model/key. Edits only the
// Hermes model block + upserts the key in .env; takes effect on gateway restart.
func (s *Server) handleUpdateModelSettings(w http.ResponseWriter, r *http.Request) {
	var req modelSettingsRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Model == "" || req.Provider == "" {
		writeError(w, http.StatusBadRequest, "model and provider are required")
		return
	}

	cfg := modelconfig.Config{
		Model:         req.Model,
		Provider:      req.Provider,
		BaseURL:       req.BaseURL,
		APIMode:       req.APIMode,
		ContextLength: req.ContextLength,
		KeyEnvVar:     modelconfig.KeyEnvForProvider(req.Provider),
	}
	reloadRequired, err := modelconfig.WriteTo(s.userHome(r.Context()), cfg, req.APIKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "apply model settings: "+err.Error())
		return
	}

	applied, err := modelconfig.ReadFrom(s.userHome(r.Context()))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "reread model settings: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"reload_required": reloadRequired,
		"config":          applied,
	})
}

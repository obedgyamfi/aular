package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/obedgyamfi/aular/core/internal/agents"
)

// GET /api/v1/agent-profiles — this user's installed "contacts."
func (s *Server) handleListProfiles(w http.ResponseWriter, r *http.Request) {
	if _, err := s.agentsRepo.GetOrCreateSystemProfileForUser(r.Context(), s.ctxUserID(r.Context())); err != nil {
		writeError(w, http.StatusInternalServerError, "ensure system profile: "+err.Error())
		return
	}

	profiles, err := s.agentsRepo.ListProfiles(r.Context(), s.ctxUserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list profiles: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, profiles)
}

type createProfileRequest struct {
	Name              string   `json:"name"`
	Role              string   `json:"role"`
	Persona           string   `json:"persona"`
	Instructions      string   `json:"instructions"`
	Tone              string   `json:"tone"`
	DefaultTools      []string `json:"default_tools"`
	MemoryScope       string   `json:"memory_scope"`
	ModelBackend      string   `json:"model_backend"`
	ScheduleRule      string   `json:"schedule_rule"`
	PermissionProfile string   `json:"permission_profile"`
	TemplateID        *string  `json:"template_id,omitempty"`
}

// POST /api/v1/agent-profiles — "Add Agent," either from scratch or from a
// template (client sends template_id, having pre-filled the form from
// GET /agent-profile-templates).
func (s *Server) handleCreateProfile(w http.ResponseWriter, r *http.Request) {
	var req createProfileRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// The one place the edition boundary is enforced. The engine decides the
	// cap (0 = unlimited); the shell just honours it, so a licensed build
	// needs no code change here.
	if err := s.enforceAgentLimit(r.Context()); err != nil {
		writeError(w, http.StatusPaymentRequired, err.Error())
		return
	}
	if req.Name == "" || req.Role == "" {
		writeError(w, http.StatusBadRequest, "name and role are required")
		return
	}
	if req.ModelBackend == "" {
		req.ModelBackend = "ollama"
	}

	ctx := r.Context()
	agent, err := s.agentsRepo.GetOrCreateAgentForUser(ctx, s.ctxUserID(ctx))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "resolve agent: "+err.Error())
		return
	}

	created, err := s.agentsRepo.CreateProfile(ctx, &agents.AgentProfile{
		AgentID:           agent.ID,
		TemplateID:        req.TemplateID,
		Name:              req.Name,
		Role:              req.Role,
		Persona:           req.Persona,
		Instructions:      req.Instructions,
		Tone:              req.Tone,
		DefaultTools:      req.DefaultTools,
		MemoryScope:       req.MemoryScope,
		ModelBackend:      req.ModelBackend,
		ScheduleRule:      req.ScheduleRule,
		PermissionProfile: req.PermissionProfile,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create profile: "+err.Error())
		return
	}
	s.broadcastAgentCreated(r.Context(), created)
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !s.requireProfile(w, r, id) {
		return
	}
	profile, err := s.agentsRepo.GetProfile(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "agent profile not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "get profile: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

type updateProfileRequest struct {
	Name              *string   `json:"name"`
	Role              *string   `json:"role"`
	Persona           *string   `json:"persona"`
	Instructions      *string   `json:"instructions"`
	Tone              *string   `json:"tone"`
	DefaultTools      *[]string `json:"default_tools"`
	MemoryScope       *string   `json:"memory_scope"`
	ModelBackend      *string   `json:"model_backend"`
	ScheduleRule      *string   `json:"schedule_rule"`
	PermissionProfile *string   `json:"permission_profile"`
	// Org hierarchy: "" clears (top level), an id re-parents. Omitted = unchanged.
	ReportsTo *string `json:"reports_to"`
}

func (s *Server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !s.requireProfile(w, r, id) {
		return
	}
	var req updateProfileRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.ReportsTo != nil && *req.ReportsTo != "" {
		if msg := s.validateReportsTo(r.Context(), id, *req.ReportsTo); msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}
	}

	updated, err := s.agentsRepo.UpdateProfile(r.Context(), id, agents.ProfilePatch{
		Name:              req.Name,
		Role:              req.Role,
		Persona:           req.Persona,
		Instructions:      req.Instructions,
		Tone:              req.Tone,
		DefaultTools:      req.DefaultTools,
		MemoryScope:       req.MemoryScope,
		ModelBackend:      req.ModelBackend,
		ScheduleRule:      req.ScheduleRule,
		PermissionProfile: req.PermissionProfile,
		SetReportsTo:      req.ReportsTo != nil,
		ReportsTo:         req.ReportsTo,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "agent profile not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "update profile: "+err.Error())
		return
	}
	s.broadcastAgentUpdated(r.Context(), updated)
	// Behavior-shaping edits refresh the agent's live sessions so the change
	// takes effect immediately — a long session otherwise keeps acting on its
	// own in-context momentum even after the prompt updates.
	if req.Persona != nil || req.Instructions != nil || req.Role != nil || req.Tone != nil || req.DefaultTools != nil {
		s.refreshAgentSessions(r.Context(), updated)
	}
	writeJSON(w, http.StatusOK, updated)
}

// refreshAgentSessions sends Hermes' /new into each of the agent's
// conversations, resetting session context (the AULAR chat history is
// untouched — it lives in core-api's DB).
func (s *Server) refreshAgentSessions(ctx context.Context, profile *agents.AgentProfile) {
	if profile.Role == "system" {
		return
	}
	filter := profile.ID
	convos, err := s.conversationsRepo.ListConversations(ctx, s.ctxUserID(ctx), &filter)
	if err != nil {
		return
	}
	for _, c := range convos {
		s.postSystemMessage(ctx, c.ID, "♻️ "+profile.Name+"'s role was updated — session refreshed so the changes take effect.")
		s.triggerTurn(c.ID, s.ctxUserID(ctx), s.agentPrompt(ctx, profile), "/new")
	}
}

// validateReportsTo rejects re-parenting that would break the org tree:
// unknown target, self-reporting, or a cycle (the target is already a
// descendant of the profile being moved). Returns "" when valid.
func (s *Server) validateReportsTo(ctx context.Context, id, target string) string {
	if target == id {
		return "an agent cannot report to itself"
	}
	// Walk up from the target; hitting `id` means target sits below it.
	cur := target
	for range 32 {
		p, err := s.agentsRepo.GetProfile(ctx, cur)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				if cur == target {
					return "reports_to target does not exist"
				}
				return "" // broken ancestor link — treat as top of chain
			}
			return "resolve reports_to chain: " + err.Error()
		}
		if p.ReportsTo == nil || *p.ReportsTo == "" {
			return ""
		}
		if *p.ReportsTo == id {
			return "that would create a reporting cycle"
		}
		cur = *p.ReportsTo
	}
	return "reporting chain too deep"
}

// POST /api/v1/agent-profiles/{id}/read — mark all of this agent's
// conversations read, clearing its sidebar unread badge.
func (s *Server) handleMarkAgentRead(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !s.requireProfile(w, r, id) {
		return
	}
	if err := s.conversationsRepo.MarkReadByAgent(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "mark agent read: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDeleteProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !s.requireProfile(w, r, id) {
		return
	}
	if err := s.agentsRepo.DeleteProfile(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "delete profile: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

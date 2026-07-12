package httpapi

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/obedgyamfi/aular/core/internal/conversations"
)

// GET /api/v1/conversations?agent_profile_id=<optional>
func (s *Server) handleListConversations(w http.ResponseWriter, r *http.Request) {
	var agentProfileID *string
	if v := r.URL.Query().Get("agent_profile_id"); v != "" {
		agentProfileID = &v
	}

	convos, err := s.conversationsRepo.ListConversations(r.Context(), s.ctxUserID(r.Context()), agentProfileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list conversations: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, convos)
}

type createConversationRequest struct {
	AgentProfileID string `json:"agent_profile_id"`
	Title          string `json:"title"`
}

// POST /api/v1/conversations — one contact's chat thread, e.g. opening a new
// conversation with an installed AgentProfile.
func (s *Server) handleCreateConversation(w http.ResponseWriter, r *http.Request) {
	var req createConversationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AgentProfileID == "" {
		writeError(w, http.StatusBadRequest, "agent_profile_id is required")
		return
	}

	ctx := r.Context()
	if !s.requireProfileAs(w, r, req.AgentProfileID, http.StatusBadRequest) {
		return
	}

	created, err := s.conversationsRepo.CreateConversation(ctx, &conversations.Conversation{
		UserID:         s.ctxUserID(r.Context()),
		AgentProfileID: req.AgentProfileID,
		Title:          req.Title,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create conversation: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetConversation(w http.ResponseWriter, r *http.Request) {
	convo := s.requireConversation(w, r, chi.URLParam(r, "id"))
	if convo == nil {
		return
	}
	writeJSON(w, http.StatusOK, convo)
}

type updateConversationRequest struct {
	Title           *string   `json:"title"`
	ContextTags     *[]string `json:"context_tags"`
	LinkedProjectID *string   `json:"linked_project_id"`
	LinkedTaskID    *string   `json:"linked_task_id"`
}

func (s *Server) handleUpdateConversation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateConversationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if s.requireConversation(w, r, id) == nil {
		return
	}

	updated, err := s.conversationsRepo.UpdateConversation(r.Context(), id, conversations.ConversationPatch{
		Title:           req.Title,
		ContextTags:     req.ContextTags,
		LinkedProjectID: req.LinkedProjectID,
		LinkedTaskID:    req.LinkedTaskID,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "conversation not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "update conversation: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteConversation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if s.requireConversation(w, r, id) == nil {
		return
	}
	if err := s.conversationsRepo.DeleteConversation(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "delete conversation: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/conversations/{id}/read — mark the conversation read up to now,
// clearing its unread count. Called when the user opens/views it.
func (s *Server) handleMarkRead(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if s.requireConversation(w, r, id) == nil {
		return
	}
	if err := s.conversationsRepo.MarkRead(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "mark read: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

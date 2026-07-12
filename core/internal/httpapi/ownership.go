package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"

	"github.com/obedgyamfi/aular/core/internal/conversations"
)

// requireConversation is the ownership gate for every /conversations/{id}/*
// route: it resolves the conversation and 404s (never 403 — no existence
// leak) unless it belongs to the request's user. Returns nil after writing
// the error response.
func (s *Server) requireConversation(w http.ResponseWriter, r *http.Request, id string) *conversations.Conversation {
	convo, err := s.conversationsRepo.GetConversation(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && convo.UserID != s.ctxUserID(r.Context())) {
		writeError(w, http.StatusNotFound, "conversation not found")
		return nil
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "resolve conversation: "+err.Error())
		return nil
	}
	return convo
}

// requireProfile is the same gate for /agent-profiles/{id}/* routes —
// profiles scope to a user through their agents row.
func (s *Server) requireProfile(w http.ResponseWriter, r *http.Request, profileID string) bool {
	return s.requireProfileAs(w, r, profileID, http.StatusNotFound)
}

// requireProfileAs is requireProfile with a caller-chosen error status (e.g.
// 400 when the profile id arrived in a request body rather than the path).
func (s *Server) requireProfileAs(w http.ResponseWriter, r *http.Request, profileID string, status int) bool {
	owned, err := s.agentsRepo.ProfileOwnedBy(r.Context(), profileID, s.ctxUserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "resolve profile: "+err.Error())
		return false
	}
	if !owned {
		writeError(w, status, "agent profile not found")
		return false
	}
	return true
}

// ownedConversationSet is the request user's conversation ids — the filter
// for anything derived from Hermes' (shared) session store.
func (s *Server) ownedConversationSet(ctx context.Context) (map[string]bool, error) {
	convos, err := s.conversationsRepo.ListConversations(ctx, s.ctxUserID(ctx), nil)
	if err != nil {
		return nil, err
	}
	owned := make(map[string]bool, len(convos))
	for _, c := range convos {
		owned[c.ID] = true
	}
	return owned, nil
}

// conversationOwner resolves a conversation's owning user id ("" when the
// conversation is unknown) — the routing key for realtime broadcasts fired
// from internal endpoints that only carry a conversation id.
func (s *Server) conversationOwner(ctx context.Context, conversationID string) string {
	convo, err := s.conversationsRepo.GetConversation(ctx, conversationID)
	if err != nil {
		return ""
	}
	return convo.UserID
}

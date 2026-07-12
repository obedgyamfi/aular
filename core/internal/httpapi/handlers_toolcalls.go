package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/obedgyamfi/aular/core/internal/realtime"
	"github.com/obedgyamfi/aular/core/internal/toolcalls"
)

type internalToolEventRequest struct {
	ConversationID string          `json:"conversation_id"`
	ToolName       string          `json:"tool_name"`
	Preview        string          `json:"preview"`
	Args           json.RawMessage `json:"args"`
	Result         string          `json:"result"` // clipped result snippet, may be empty
	Index          int             `json:"index"`
}

// POST /internal/tool-event — the Hermes aular plugin reports a tool
// invocation the agent just started (see docs/event-schema.md for how the
// events escape Hermes). Persists a "running" ToolCall attributed to the
// conversation's agent and broadcasts tool_call.started for the Work register.
func (s *Server) handleInternalToolEvent(w http.ResponseWriter, r *http.Request) {
	var req internalToolEventRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ConversationID == "" || req.ToolName == "" {
		writeError(w, http.StatusBadRequest, "conversation_id and tool_name are required")
		return
	}
	if !s.internalCallerOwns(r.Context(), r.Header.Get("X-Aular-Internal-Token"), req.ConversationID) {
		writeError(w, http.StatusUnauthorized, "invalid internal token")
		return
	}

	ctx := r.Context()
	// Attribute to the conversation's agent + owner, same pattern as
	// /internal/deliver. The tool_calls row requires a user_id, so an unknown
	// conversation is a 404 rather than an orphan row.
	convo, err := s.conversationsRepo.GetConversation(ctx, req.ConversationID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "conversation not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "resolve conversation: "+err.Error())
		return
	}

	payload, err := json.Marshal(map[string]any{
		"preview": req.Preview,
		"args":    req.Args,
		"index":   req.Index,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "encode request payload: "+err.Error())
		return
	}
	var response json.RawMessage
	if req.Result != "" {
		if response, err = json.Marshal(map[string]string{"snippet": req.Result}); err != nil {
			writeError(w, http.StatusInternalServerError, "encode response payload: "+err.Error())
			return
		}
	}

	tc, err := s.toolCallsRepo.Create(ctx, &toolcalls.ToolCall{
		UserID:          convo.UserID,
		AgentProfileID:  convo.AgentProfileID,
		ConversationID:  req.ConversationID,
		ToolName:        req.ToolName,
		RequestPayload:  payload,
		ResponsePayload: response,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "persist tool call: "+err.Error())
		return
	}

	s.hub.Broadcast(realtime.Event{
		Type:           "tool_call.started",
		ConversationID: req.ConversationID,
		Data:           tc,
		UserID:         s.conversationOwner(r.Context(), req.ConversationID),
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "recorded", "tool_call_id": tc.ID})
}

// settleToolCalls flips a conversation's running tool calls to "settled" (the
// turn's reply finalized) and broadcasts each as tool_call.updated. Best-effort
// side channel of deliver/edit — failures are logged, never surfaced.
func (s *Server) settleToolCalls(ctx context.Context, conversationID string) {
	if conversationID == "" {
		return
	}
	settled, err := s.toolCallsRepo.SettleRunning(ctx, conversationID)
	if err != nil {
		log.Printf("toolcalls: settle for conversation %s: %v", conversationID, err)
		return
	}
	owner := s.ctxUserID(ctx)
	for _, tc := range settled {
		s.hub.Broadcast(realtime.Event{
			Type:           "tool_call.updated",
			ConversationID: conversationID,
			Data:           tc,
			UserID:         owner,
		})
	}
}

// GET /api/v1/conversations/{id}/tool-calls — newest-first history for the
// Work register's session feed.
func (s *Server) handleListToolCalls(w http.ResponseWriter, r *http.Request) {
	conversationID := chi.URLParam(r, "id")
	if s.requireConversation(w, r, conversationID) == nil {
		return
	}
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	list, err := s.toolCallsRepo.ListByConversation(r.Context(), conversationID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list tool calls: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

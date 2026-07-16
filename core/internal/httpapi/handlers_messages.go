package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/obedgyamfi/aular/core/agentspec"
	"github.com/obedgyamfi/aular/core/internal/infra/aularadapter"
	"github.com/obedgyamfi/aular/core/internal/messages"
	"github.com/obedgyamfi/aular/core/internal/metering"
	"github.com/obedgyamfi/aular/core/internal/realtime"
)

const (
	defaultMessageLimit = 50
	maxMessageLimit     = 200
)

// GET /api/v1/conversations/{id}/messages?limit=&before_id=
func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	conversationID := chi.URLParam(r, "id")

	limit := defaultMessageLimit
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > maxMessageLimit {
		limit = maxMessageLimit
	}

	var beforeID *string
	if v := r.URL.Query().Get("before_id"); v != "" {
		beforeID = &v
	}

	if s.requireConversation(w, r, conversationID) == nil {
		return
	}
	msgs, err := s.messagesRepo.ListMessages(r.Context(), conversationID, limit, beforeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list messages: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, msgs)
}

type createMessageRequest struct {
	Content          string         `json:"content"`
	ContentFormat    string         `json:"content_format"`
	ReplyToMessageID *string        `json:"reply_to_message_id"`
	Media            []mediaPayload `json:"media"`
}

type createMessageResponse struct {
	UserMessage *messages.Message `json:"user_message"`
}

// POST /api/v1/conversations/{id}/messages — persists the user's message,
// broadcasts it, and hands it to the Hermes aular platform adapter. Returns
// the user message immediately; the agent's reply (and any later cron/async
// push) arrives asynchronously via /internal/deliver → WebSocket. The agent
// runs a real tool loop that can take a while, so we deliberately do NOT
// block the HTTP request on it.
func (s *Server) handleCreateMessage(w http.ResponseWriter, r *http.Request) {
	conversationID := chi.URLParam(r, "id")

	var req createMessageRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Content == "" && len(req.Media) == 0 {
		writeError(w, http.StatusBadRequest, "content or media is required")
		return
	}
	if req.ContentFormat == "" {
		req.ContentFormat = "text"
	}

	ctx := r.Context()

	convo := s.requireConversation(w, r, conversationID)
	if convo == nil {
		return
	}

	userMsg, err := s.messagesRepo.CreateMessage(ctx, &messages.Message{
		ConversationID:    conversationID,
		SenderType:        "user",
		SenderID:          s.ctxUserID(r.Context()),
		Content:           req.Content,
		ContentFormat:     req.ContentFormat,
		ReplyToMessageID:  req.ReplyToMessageID,
		StructuredPayload: mediaStructuredPayload(req.Media),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create message: "+err.Error())
		return
	}
	s.hub.Broadcast(realtime.Event{Type: "message.created", ConversationID: conversationID, Data: userMsg, UserID: convo.UserID})
	s.recordUsage(metering.KindUserMessage, convo.UserID, convo.AgentProfileID, conversationID, userMsg.ID, userMsg.Content)

	profile, err := s.agentsRepo.GetProfile(ctx, convo.AgentProfileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "resolve agent profile: "+err.Error())
		return
	}

	// Hand off to the aular adapter. Fire-and-forget with a background context
	// (not the request context, which is cancelled when this handler returns):
	// the adapter accepts the message quickly and the reply comes back over WS.
	// Let the agent know an attachment came in (best-effort text note; full
	// multimodal ingestion is a later step).
	deliverContent := req.Content
	if len(req.Media) > 0 {
		names := make([]string, 0, len(req.Media))
		for _, m := range req.Media {
			names = append(names, m.Name)
		}
		note := "[User attached: " + strings.Join(names, ", ") + "]"
		if deliverContent == "" {
			deliverContent = note
		} else {
			deliverContent = deliverContent + "\n\n" + note
		}
	}

	systemPrompt := s.agentPrompt(ctx, profile)
	// The AULAR system agent doubles as the agent builder: give it the protocol
	// for interviewing the user and emitting a spec block, plus the live tool
	// catalog so it only picks real, valid tools.
	if profile.Role == "system" {
		defs, _ := s.toolsRepo.ListDefinitions(ctx)
		profiles, _ := s.agentsRepo.ListProfiles(ctx, s.ctxUserID(ctx))
		systemPrompt += agentspec.BuilderProtocol(toolCatalog(defs), agentRoster(profiles))
	}
	go func() {
		bg := context.Background()
		if err := s.deliverTo(bg, convo.UserID, aularadapter.InboundRequest{
			ConversationID: conversationID,
			UserID:         s.ctxUserID(ctx),
			Content:        deliverContent,
			SystemPrompt:   systemPrompt,
		}); err != nil {
			log.Printf("httpapi: aular adapter deliver failed: %v", err)
			// Surface the failure into the chat so it isn't silently dropped —
			// in words about what it means, not the dial error (the log keeps
			// that). This is the first thing a broken install actually shows.
			if m, e := s.messagesRepo.CreateMessage(bg, &messages.Message{
				ConversationID: conversationID,
				SenderType:     "system",
				Content: "⚠ This message couldn't reach the agent runtime — it doesn't " +
					"seem to be running. Restarting AULAR usually brings it back; if " +
					"not, check Settings → Model that a runtime is installed.",
				ContentFormat: "text",
			}); e == nil {
				s.hub.Broadcast(realtime.Event{Type: "message.created", ConversationID: conversationID, Data: m, UserID: convo.UserID})
			}
		}
	}()

	writeJSON(w, http.StatusCreated, createMessageResponse{UserMessage: userMsg})
}

// DELETE /api/v1/conversations/{id}/messages/{mid} — removes a message and
// broadcasts a message.deleted event so every connected client drops it live.
func (s *Server) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	messageID := chi.URLParam(r, "mid")
	if s.requireConversation(w, r, chi.URLParam(r, "id")) == nil {
		return
	}

	conversationID, err := s.messagesRepo.DeleteMessage(r.Context(), messageID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "message not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "delete message: "+err.Error())
		return
	}

	s.hub.Broadcast(realtime.Event{
		Type:           "message.deleted",
		ConversationID: conversationID,
		Data:           map[string]string{"id": messageID, "conversation_id": conversationID},
		UserID:         s.ctxUserID(r.Context()),
	})
	w.WriteHeader(http.StatusNoContent)
}

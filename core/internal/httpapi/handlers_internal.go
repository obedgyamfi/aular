package httpapi

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	"github.com/obedgyamfi/aular/core/internal/agentspec"
	"github.com/obedgyamfi/aular/core/internal/auth"
	"github.com/obedgyamfi/aular/core/internal/messages"
	"github.com/obedgyamfi/aular/core/internal/metering"
	"github.com/obedgyamfi/aular/core/internal/realtime"
)

type internalMediaAttachmentRequest struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	MimeType   string `json:"mime_type"`
	Size       string `json:"size"`
	DataBase64 string `json:"data_base64"`
	URL        string `json:"url"`
}

type internalDeliverRequest struct {
	ConversationID string                           `json:"conversation_id"`
	Content        string                           `json:"content"`
	Media          []internalMediaAttachmentRequest `json:"media"`
}

type mediaPayload struct {
	URL      string `json:"url"`
	Name     string `json:"name,omitempty"`
	Kind     string `json:"kind,omitempty"`
	MimeType string `json:"mime_type,omitempty"`
	Size     string `json:"size,omitempty"`
}

type internalActivityRequest struct {
	ConversationID string `json:"conversation_id"`
	State          string `json:"state"` // "working" (agent is processing) or "idle"
	Label          string `json:"label"` // optional human label, e.g. "using tools"
}

// POST /internal/activity — the Hermes aular adapter pings this while an agent
// is actively processing a turn (from its send_typing hook). It broadcasts a
// transient agent.activity event so the UI can show a live "typing…"/presence
// state. Nothing is persisted; if the ping never comes the UI still falls back
// to its optimistic per-conversation pending state.
func (s *Server) handleInternalActivity(w http.ResponseWriter, r *http.Request) {
	var req internalActivityRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ConversationID == "" {
		writeError(w, http.StatusBadRequest, "conversation_id is required")
		return
	}
	if !s.internalCallerOwns(r.Context(), r.Header.Get("X-Aular-Internal-Token"), req.ConversationID) {
		writeError(w, http.StatusUnauthorized, "invalid internal token")
		return
	}
	if req.State == "" {
		req.State = "working"
	}
	s.hub.Broadcast(realtime.Event{
		Type:           "agent.activity",
		ConversationID: req.ConversationID,
		Data: map[string]string{
			"conversation_id": req.ConversationID,
			"state":           req.State,
			"label":           req.Label,
		},
		UserID: s.conversationOwner(r.Context(), req.ConversationID),
	})
	w.WriteHeader(http.StatusNoContent)
}

type internalEditRequest struct {
	ConversationID string `json:"conversation_id"`
	MessageID      string `json:"message_id"`
	Content        string `json:"content"`
	Finalize       bool   `json:"finalize"` // last edit of a streamed reply
}

// messageUpdatedPayload flattens the updated message alongside a transient
// `streaming` flag so the UI can grow the bubble in place and show/hide a
// live cursor. `streaming` is true until the finalizing edit arrives.
type messageUpdatedPayload struct {
	*messages.Message
	Streaming bool `json:"streaming"`
}

// POST /internal/edit — the Hermes aular adapter calls this repeatedly while an
// agent reply streams in, replacing the growing message's text. Each call
// updates the row and broadcasts message.updated so the browser edits the
// bubble in place (token-by-token) instead of waiting for the whole turn.
func (s *Server) handleInternalEdit(w http.ResponseWriter, r *http.Request) {
	var req internalEditRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MessageID == "" {
		writeError(w, http.StatusBadRequest, "message_id is required")
		return
	}
	if !s.internalCallerOwns(r.Context(), r.Header.Get("X-Aular-Internal-Token"), req.ConversationID) {
		writeError(w, http.StatusUnauthorized, "invalid internal token")
		return
	}

	ctx := r.Context()
	// Hide any agent create/edit block from the displayed bubble; apply it once
	// the block is complete and this is the finalizing edit of a streamed reply.
	specKind, blockJSON, cleaned, complete := agentspec.ExtractSpec(req.Content)

	msg, err := s.messagesRepo.UpdateMessageContent(ctx, req.MessageID, cleaned)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "message not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "update message: "+err.Error())
		return
	}
	// Block application below acts on behalf of the conversation's owner.
	if convo, err := s.conversationsRepo.GetConversation(ctx, msg.ConversationID); err == nil {
		ctx = auth.WithUserID(ctx, convo.UserID)
	}

	if req.Finalize && complete {
		if confirmation := s.applyAgentBlock(ctx, msg.ConversationID, msg.ID, specKind, blockJSON, cleaned); confirmation != "" {
			// The reply was block-only — give the bubble a confirmation to show.
			if u, e := s.messagesRepo.UpdateMessageContent(ctx, msg.ID, confirmation); e == nil {
				msg = u
			}
		}
	}
	// The reply was metered at its first partial (in /internal/deliver); on the
	// finalizing edit, correct its char count to the full delivered length.
	// A finalized reply also means the turn's tool phase is over — settle any
	// running tool calls (see docs/event-schema.md).
	if req.Finalize {
		s.updateUsageChars(msg.ID, msg.Content)
		s.settleToolCalls(ctx, msg.ConversationID)
		// If this conversation owes dispatch reports, (re)schedule the relay
		// now that a reply segment is final.
		// Hand the finalized reply to the org engine. In the free shell this
		// does nothing; with the org engine linked, this is where dispatch
		// blocks are routed, reports relayed, and stalled work chased.
		s.notifyEngine(ctx, msg.ConversationID, msg.ID, msg.Content, true)
	}

	s.hub.Broadcast(realtime.Event{
		Type:           "message.updated",
		ConversationID: msg.ConversationID,
		Data:           messageUpdatedPayload{Message: msg, Streaming: !req.Finalize},
		UserID:         s.ctxUserID(ctx),
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated", "message_id": msg.ID})
}

// mediaStructuredPayload wraps already-stored attachment descriptors (from a
// user upload) into the {"media": [...]} structured_payload shape the frontend
// renders. Returns nil when there's nothing to attach.
func mediaStructuredPayload(media []mediaPayload) json.RawMessage {
	if len(media) == 0 {
		return nil
	}
	b, err := json.Marshal(map[string][]mediaPayload{"media": media})
	if err != nil {
		return nil
	}
	return b
}

func mediaKind(mimeType string) string {
	switch {
	case strings.HasPrefix(mimeType, "image/"):
		return "image"
	case strings.HasPrefix(mimeType, "video/"):
		return "video"
	case strings.HasPrefix(mimeType, "audio/"):
		return "audio"
	default:
		return "document"
	}
}

func safeMediaExt(name, mimeType string) string {
	ext := strings.ToLower(filepath.Ext(name))
	if ext != "" && len(ext) <= 12 {
		return ext
	}
	if exts, err := mime.ExtensionsByType(mimeType); err == nil && len(exts) > 0 {
		return exts[0]
	}
	return ".bin"
}

func (s *Server) storeDeliveredMedia(items []internalMediaAttachmentRequest) ([]mediaPayload, error) {
	if len(items) == 0 {
		return nil, nil
	}
	if err := os.MkdirAll(s.cfg.MediaDir, 0o755); err != nil {
		return nil, fmt.Errorf("create media dir: %w", err)
	}

	media := make([]mediaPayload, 0, len(items))
	for _, item := range items {
		name := filepath.Base(strings.TrimSpace(item.Name))
		if name == "." || name == string(filepath.Separator) || name == "" {
			name = "attachment"
		}
		mimeType := strings.TrimSpace(item.MimeType)
		kind := strings.TrimSpace(item.Kind)

		if item.URL != "" && item.DataBase64 == "" {
			if kind == "" {
				kind = mediaKind(mimeType)
			}
			media = append(media, mediaPayload{URL: item.URL, Name: name, Kind: kind, MimeType: mimeType, Size: item.Size})
			continue
		}

		data, err := base64.StdEncoding.DecodeString(item.DataBase64)
		if err != nil {
			return nil, fmt.Errorf("decode media %q: %w", name, err)
		}
		if mimeType == "" {
			mimeType = http.DetectContentType(data)
		}
		if kind == "" {
			kind = mediaKind(mimeType)
		}

		filename := uuid.NewString() + safeMediaExt(name, mimeType)
		path := filepath.Join(s.cfg.MediaDir, filename)
		if err := os.WriteFile(path, data, 0o644); err != nil {
			return nil, fmt.Errorf("write media %q: %w", name, err)
		}
		media = append(media, mediaPayload{
			URL:      "/media/" + filename,
			Name:     name,
			Kind:     kind,
			MimeType: mimeType,
			Size:     fmt.Sprintf("%d", len(data)),
		})
	}
	return media, nil
}

// POST /internal/deliver — the Hermes aular platform adapter calls this to
// deliver an agent message into a conversation: both the live reply to a user
// turn AND async pushes (a cron reminder firing, a long job completing). It
// persists the message and broadcasts it over the WebSocket, so the browser
// shows it whether or not the user is actively waiting.
func (s *Server) handleInternalDeliver(w http.ResponseWriter, r *http.Request) {
	var req internalDeliverRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// The token identifies the calling gateway; it may only touch its own
	// user's conversations.
	if !s.internalCallerOwns(r.Context(), r.Header.Get("X-Aular-Internal-Token"), req.ConversationID) {
		writeError(w, http.StatusUnauthorized, "invalid internal token")
		return
	}
	// Strip any agent create/edit block from the visible message (the whole
	// reply may be delivered at once when streaming is off).
	specKind, blockJSON, cleaned, specComplete := agentspec.ExtractSpec(req.Content)
	req.Content = cleaned
	if req.ConversationID == "" || (req.Content == "" && len(req.Media) == 0 && !specComplete) {
		writeError(w, http.StatusBadRequest, "conversation_id and content or media are required")
		return
	}

	ctx := r.Context()

	// Resolve the conversation's agent profile as the sender (best-effort), plus
	// its owner so the delivery can be metered.
	senderID := ""
	ownerID := ""
	if convo, err := s.conversationsRepo.GetConversation(ctx, req.ConversationID); err == nil {
		senderID = convo.AgentProfileID
		ownerID = convo.UserID
		// Everything downstream of a delivery (spec/dispatch/doc blocks,
		// relays) acts on behalf of the conversation's owner.
		ctx = auth.WithUserID(ctx, convo.UserID)
	} else if !errors.Is(err, sql.ErrNoRows) {
		// Non-not-found error: the conversation lookup itself failed.
		writeError(w, http.StatusInternalServerError, "resolve conversation: "+err.Error())
		return
	}

	media, err := s.storeDeliveredMedia(req.Media)
	if err != nil {
		writeError(w, http.StatusBadRequest, "store media: "+err.Error())
		return
	}
	structuredPayload := json.RawMessage(`{}`)
	contentFormat := "text"
	if len(media) > 0 {
		payload, err := json.Marshal(map[string][]mediaPayload{"media": media})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "encode media payload: "+err.Error())
			return
		}
		structuredPayload = payload
		contentFormat = "media"
	}

	msg, err := s.messagesRepo.CreateMessage(ctx, &messages.Message{
		ConversationID:    req.ConversationID,
		SenderType:        "agent",
		SenderID:          senderID,
		Content:           req.Content,
		ContentFormat:     contentFormat,
		StructuredPayload: structuredPayload,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "persist message: "+err.Error())
		return
	}
	s.hub.Broadcast(realtime.Event{Type: "message.created", ConversationID: req.ConversationID, Data: msg, UserID: ownerID})
	// Meter the delivered reply once. With streaming on, the reply is created
	// here (first partial) and only grown by /internal/edit afterward, so this
	// counts one agent message per turn — no double counting.
	s.recordUsage(metering.KindAgentMessage, ownerID, senderID, req.ConversationID, msg.ID, req.Content)
	// A whole-reply delivery (non-streaming turn or async cron push) ends the
	// turn's tool phase; streamed replies settle on their finalizing edit
	// instead. Settling here too is harmless for streaming: the first partial
	// arrives after the tool phase in the common case, and any tool that starts
	// later is re-reported and settles at finalize.
	s.settleToolCalls(ctx, req.ConversationID)
	s.notifyEngine(ctx, req.ConversationID, msg.ID, req.Content, true)

	if specComplete {
		if confirmation := s.applyAgentBlock(ctx, req.ConversationID, msg.ID, specKind, blockJSON, cleaned); confirmation != "" {
			if u, e := s.messagesRepo.UpdateMessageContent(ctx, msg.ID, confirmation); e == nil {
				s.hub.Broadcast(realtime.Event{Type: "message.updated", ConversationID: req.ConversationID, Data: messageUpdatedPayload{Message: u, Streaming: false}, UserID: ownerID})
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "delivered", "message_id": msg.ID})
}

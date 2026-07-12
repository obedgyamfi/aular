package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/obedgyamfi/aular/core/internal/modelconfig"
)

type conversationContextResponse struct {
	Model         string `json:"model"`
	Provider      string `json:"provider"`
	ContextLength int    `json:"context_length"`
	// Rough live estimate: conversation chars / 4 + prompt overhead. The
	// authoritative number is Hermes' /status; this keeps a meter moving
	// between flushes.
	EstContextTokens int64 `json:"est_context_tokens"`
	// Last-flushed session accounting (lags live activity).
	SessionInputTokens  int64 `json:"session_input_tokens"`
	SessionOutputTokens int64 `json:"session_output_tokens"`
	SessionFlushed      bool  `json:"session_flushed"`
}

// GET /api/v1/conversations/{id}/context — model + context-window info for
// the composer status bar.
func (s *Server) handleConversationContext(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	convID := chi.URLParam(r, "id")
	if s.requireConversation(w, r, convID) == nil {
		return
	}

	resp := conversationContextResponse{}
	if cfg, err := modelconfig.ReadFrom(s.userHome(ctx)); err == nil {
		resp.Model = cfg.Model
		resp.Provider = cfg.Provider
		resp.ContextLength = cfg.ContextLength
	}
	if resp.ContextLength == 0 {
		resp.ContextLength = 128000 // conservative fallback when unset
	}

	if chars, err := s.messagesRepo.TotalChars(ctx, convID); err == nil {
		resp.EstContextTokens = chars/4 + 3000 // + persona/org prompt overhead
	}

	// Latest flushed Hermes session for this conversation, if any.
	if rows, err := s.userState(ctx).ListSessions(ctx); err == nil {
		var bestStart float64
		for _, sess := range rows {
			if sess.ChatID == convID && sess.StartedAt >= bestStart {
				bestStart = sess.StartedAt
				resp.SessionInputTokens = sess.InputTokens
				resp.SessionOutputTokens = sess.OutputTokens
				resp.SessionFlushed = true
			}
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

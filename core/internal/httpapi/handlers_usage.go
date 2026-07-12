package httpapi

import (
	"context"
	"log"
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/obedgyamfi/aular/core/internal/infra/hermesstate"
	"github.com/obedgyamfi/aular/core/internal/metering"
	"github.com/obedgyamfi/aular/core/internal/tokensnap"
)

// recordUsage logs a metered event without ever blocking or failing the caller
// — "silent" metering. It runs on a background context so it isn't cancelled
// when the triggering HTTP handler returns. messageID links the event to its
// message so a streamed reply's char count can be corrected on finalize.
func (s *Server) recordUsage(kind, userID, agentProfileID, conversationID, messageID, content string) {
	if s.meteringRepo == nil || userID == "" {
		return
	}
	e := metering.Event{
		UserID:         userID,
		AgentProfileID: agentProfileID,
		ConversationID: conversationID,
		MessageID:      messageID,
		Kind:           kind,
		Chars:          utf8.RuneCountInString(content),
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.meteringRepo.Record(ctx, e); err != nil {
			log.Printf("httpapi: record usage (%s): %v", kind, err)
		}
	}()
}

// updateUsageChars corrects a metered message's char count once its final text
// is known (a streamed reply finalizing). Best-effort, off the request path.
func (s *Server) updateUsageChars(messageID, content string) {
	if s.meteringRepo == nil || messageID == "" {
		return
	}
	chars := utf8.RuneCountInString(content)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.meteringRepo.SetChars(ctx, messageID, chars); err != nil {
			log.Printf("httpapi: update usage chars: %v", err)
		}
	}()
}

// parseWindow maps a ?window= label to a start time. Defaults to 30 days.
func parseWindow(v string) (label string, since time.Time) {
	now := time.Now().UTC()
	switch v {
	case "24h":
		return "24h", now.Add(-24 * time.Hour)
	case "7d":
		return "7d", now.AddDate(0, 0, -7)
	case "all":
		return "all", time.Time{}
	case "30d", "":
		return "30d", now.AddDate(0, 0, -30)
	default:
		return "30d", now.AddDate(0, 0, -30)
	}
}

// GET /api/v1/usage/summary?window=30d — the user's metered usage for a window.
// Read-only; the beta surfaces this as informational (no limits enforced).
func (s *Server) handleUsageSummary(w http.ResponseWriter, r *http.Request) {
	label, since := parseWindow(r.URL.Query().Get("window"))
	if e := s.metricsEpoch(r.Context()); !e.IsZero() && e.After(since) {
		since = e
	}
	summary, err := s.meteringRepo.Summary(r.Context(), s.ctxUserID(r.Context()), label, since)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "usage summary: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// metricsEpoch is the baseline usage/token dashboards count from ("reset
// metrics"). Zero time = never reset.
func (s *Server) metricsEpoch(ctx context.Context) time.Time {
	v, err := s.appSettings.Get(ctx, s.ctxUserID(ctx), "metrics_epoch")
	if err != nil || v == "" {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return time.Time{}
	}
	return t
}

// tokenSnaps loads the reset-time session snapshots as the hermesstate type.
func (s *Server) tokenSnaps(ctx context.Context) (map[string]hermesstate.Snapshot, error) {
	raw, err := s.tokenSnapRepo.All(ctx, s.ctxUserID(ctx))
	if err != nil {
		return nil, err
	}
	out := make(map[string]hermesstate.Snapshot, len(raw))
	for id, v := range raw {
		out[id] = hermesstate.Snapshot{InputTokens: v.InputTokens, OutputTokens: v.OutputTokens, ToolCalls: v.ToolCalls}
	}
	return out, nil
}

// POST /api/v1/usage/reset — start the metrics from zero: sets the message
// epoch AND snapshots every Hermes session's counters, so dashboards show
// growth since this moment even for sessions that keep running. History is
// filtered, never deleted.
func (s *Server) handleUsageReset(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := s.ctxUserID(ctx)
	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.appSettings.Set(ctx, userID, "metrics_epoch", now); err != nil {
		writeError(w, http.StatusInternalServerError, "set metrics epoch: "+err.Error())
		return
	}
	rows, err := s.userState(ctx).ListSessions(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "snapshot sessions: "+err.Error())
		return
	}
	// Snapshot only sessions in the user's own conversations — a reset must
	// never move another account's baseline.
	owned, err := s.ownedConversationSet(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "resolve conversations: "+err.Error())
		return
	}
	snaps := make(map[string]tokensnap.Snapshot, len(rows))
	for _, sess := range rows {
		if !owned[sess.ChatID] {
			continue
		}
		snaps[sess.ID] = tokensnap.Snapshot{InputTokens: sess.InputTokens, OutputTokens: sess.OutputTokens, ToolCalls: sess.ToolCalls}
	}
	if err := s.tokenSnapRepo.ReplaceAll(ctx, userID, snaps); err != nil {
		writeError(w, http.StatusInternalServerError, "store snapshots: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"metrics_epoch": now, "sessions_snapshotted": len(snaps)})
}

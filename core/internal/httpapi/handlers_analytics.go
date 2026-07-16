package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/obedgyamfi/aular/core/internal/infra/hermesstate"
	"github.com/obedgyamfi/aular/core/internal/metering"
)

type analyticsDailyResponse struct {
	Days     int                       `json:"days"`
	Tokens   []hermesstate.DailyTokens `json:"tokens"`
	Messages []metering.DailyCount     `json:"messages"`
}

// GET /api/v1/analytics/daily?days=14 — the org dashboard's time series:
// per-day token/tool-call/session accounting from Hermes' session store plus
// per-day message volume from the metering log.
func (s *Server) handleAnalyticsDaily(w http.ResponseWriter, r *http.Request) {
	days := 14
	if v := r.URL.Query().Get("days"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 90 {
			days = n
		}
	}
	snaps, _ := s.tokenSnaps(r.Context())
	owned, err := s.ownedConversationSet(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "resolve conversations: "+err.Error())
		return
	}
	tokens, err := s.userState(r.Context()).UsageDaily(r.Context(), days, snaps, owned)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "daily tokens: "+err.Error())
		return
	}
	since := time.Now().UTC().AddDate(0, 0, -days)
	if e := s.metricsEpoch(r.Context()); !e.IsZero() && e.After(since) {
		since = e
	}
	messages, err := s.meteringRepo.Daily(r.Context(), s.ctxUserID(r.Context()), since)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "daily messages: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analyticsDailyResponse{Days: days, Tokens: tokens, Messages: messages})
}

package httpapi

import "net/http"

// GET /api/v1/schedule/jobs — every Hermes scheduled job that delivers into
// an AULAR conversation, including reminders/routines agents created
// themselves with their cronjob tool (which never touch the routines table).
// Read live from Hermes' cron store; the Calendar register merges these with
// AULAR routines.
func (s *Server) handleListScheduledJobs(w http.ResponseWriter, r *http.Request) {
	jobs, err := s.userCron(r.Context()).List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list scheduled jobs: "+err.Error())
		return
	}
	// The cron store is shared until Phase 4 — only show jobs that deliver
	// into the caller's own conversations.
	owned, err := s.ownedConversationSet(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "resolve conversations: "+err.Error())
		return
	}
	mine := jobs[:0]
	for _, j := range jobs {
		if owned[j.ConversationID] {
			mine = append(mine, j)
		}
	}
	writeJSON(w, http.StatusOK, mine)
}

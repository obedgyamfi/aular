package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/obedgyamfi/aular/core/internal/agents"
	"github.com/obedgyamfi/aular/core/internal/conversations"
	"github.com/obedgyamfi/aular/core/internal/routines"
)

type routineRequest struct {
	AgentProfileID string `json:"agent_profile_id"`
	Name           string `json:"name"`
	ScheduleRule   string `json:"schedule_rule"`
	TargetBehavior string `json:"target_behavior"`
	Priority       string `json:"priority"`
	Active         *bool  `json:"active"`
}

// GET /api/v1/routines?agent_profile_id=<id> — an agent's scheduled routines.
func (s *Server) handleListRoutines(w http.ResponseWriter, r *http.Request) {
	agentProfileID := r.URL.Query().Get("agent_profile_id")
	if agentProfileID == "" {
		writeError(w, http.StatusBadRequest, "agent_profile_id is required")
		return
	}
	if !s.requireProfile(w, r, agentProfileID) {
		return
	}
	list, err := s.routinesRepo.ListByAgent(r.Context(), agentProfileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list routines: "+err.Error())
		return
	}
	if list == nil {
		list = []*routines.Routine{}
	}
	writeJSON(w, http.StatusOK, list)
}

// POST /api/v1/routines — create a routine; if active, bridge it to a real
// Hermes cron job that runs the behavior on schedule and delivers into the
// agent's chat.
func (s *Server) handleCreateRoutine(w http.ResponseWriter, r *http.Request) {
	var req routineRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AgentProfileID == "" || req.Name == "" || req.ScheduleRule == "" || req.TargetBehavior == "" {
		writeError(w, http.StatusBadRequest, "agent_profile_id, name, schedule_rule and target_behavior are required")
		return
	}

	ctx := r.Context()
	if !s.requireProfileAs(w, r, req.AgentProfileID, http.StatusBadRequest) {
		return
	}
	agent, err := s.agentsRepo.GetProfile(ctx, req.AgentProfileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "resolve agent profile: "+err.Error())
		return
	}

	priority := req.Priority
	if priority == "" {
		priority = "normal"
	}

	rt, err := s.routinesRepo.Create(ctx, &routines.Routine{
		UserID:         s.ctxUserID(r.Context()),
		AgentProfileID: req.AgentProfileID,
		Name:           req.Name,
		ScheduleRule:   req.ScheduleRule,
		TargetBehavior: req.TargetBehavior,
		Priority:       priority,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create routine: "+err.Error())
		return
	}

	// Default to active unless explicitly created paused.
	if req.Active == nil || *req.Active {
		bridged, err := s.activateRoutine(ctx, rt, agent)
		if err != nil {
			// The routine exists but couldn't be scheduled — surface it so the
			// user knows, leaving the (inactive) routine in place to retry.
			writeError(w, http.StatusBadGateway, "routine created but scheduling failed: "+err.Error())
			return
		}
		rt = bridged
	}
	writeJSON(w, http.StatusCreated, rt)
}

// PATCH /api/v1/routines/{id} — edit fields and/or toggle active. Any change
// re-syncs the bridged cron job so schedule/behavior edits take effect.
func (s *Server) handleUpdateRoutine(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()

	cur, err := s.routinesRepo.Get(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "routine not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "get routine: "+err.Error())
		return
	}
	if cur.UserID != s.ctxUserID(ctx) {
		writeError(w, http.StatusNotFound, "routine not found")
		return
	}

	var req routineRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	updated, err := s.routinesRepo.Update(ctx, id,
		coalesce(req.Name, cur.Name),
		coalesce(req.ScheduleRule, cur.ScheduleRule),
		coalesce(req.TargetBehavior, cur.TargetBehavior),
		coalesce(req.Priority, cur.Priority),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update routine: "+err.Error())
		return
	}

	desiredActive := cur.Active
	if req.Active != nil {
		desiredActive = *req.Active
	}

	// Tear down any existing cron job, then rebuild if it should be active so
	// edited schedule/behavior take effect.
	if cur.CronJobID != "" {
		_ = s.userCron(ctx).Remove(ctx, cur.CronJobID)
	}
	if desiredActive {
		agent, err := s.agentsRepo.GetProfile(ctx, updated.AgentProfileID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "resolve agent profile: "+err.Error())
			return
		}
		bridged, err := s.activateRoutine(ctx, updated, agent)
		if err != nil {
			writeError(w, http.StatusBadGateway, "reschedule failed: "+err.Error())
			return
		}
		updated = bridged
	} else {
		updated, err = s.routinesRepo.SetActive(ctx, id, false, "")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "deactivate routine: "+err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, updated)
}

// DELETE /api/v1/routines/{id} — remove the routine and tear down its cron job.
func (s *Server) handleDeleteRoutine(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()
	if cur, err := s.routinesRepo.Get(ctx, id); err != nil || cur.UserID != s.ctxUserID(ctx) {
		writeError(w, http.StatusNotFound, "routine not found")
		return
	}
	cronJobID, err := s.routinesRepo.Delete(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "routine not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "delete routine: "+err.Error())
		return
	}
	if cronJobID != "" {
		_ = s.userCron(ctx).Remove(ctx, cronJobID)
	}
	w.WriteHeader(http.StatusNoContent)
}

// activateRoutine bridges a routine to a Hermes cron job delivering into the
// agent's conversation, and records the job id.
func (s *Server) activateRoutine(ctx context.Context, rt *routines.Routine, agent *agents.AgentProfile) (*routines.Routine, error) {
	convID, err := s.resolveAgentConversation(ctx, rt.AgentProfileID)
	if err != nil {
		return nil, fmt.Errorf("resolve conversation: %w", err)
	}
	jobID, err := s.cronForConversation(ctx, convID).Create(ctx, "AULAR · "+rt.Name, rt.ScheduleRule, s.buildRoutinePrompt(ctx, agent, rt), convID)
	if err != nil {
		return nil, err
	}
	return s.routinesRepo.SetActive(ctx, rt.ID, true, jobID)
}

// resolveAgentConversation returns the agent's existing thread, creating one if
// none exists — the cron job delivers its output here.
func (s *Server) resolveAgentConversation(ctx context.Context, agentProfileID string) (string, error) {
	filter := agentProfileID
	convos, err := s.conversationsRepo.ListConversations(ctx, s.ctxUserID(ctx), &filter)
	if err != nil {
		return "", err
	}
	if len(convos) > 0 {
		return convos[0].ID, nil
	}
	created, err := s.conversationsRepo.CreateConversation(ctx, &conversations.Conversation{
		UserID:         s.ctxUserID(ctx),
		AgentProfileID: agentProfileID,
	})
	if err != nil {
		return "", err
	}
	return created.ID, nil
}

func (s *Server) buildRoutinePrompt(ctx context.Context, agent *agents.AgentProfile, rt *routines.Routine) string {
	return fmt.Sprintf(
		"%s\n\nThis is your scheduled routine %q. Carry it out now using your tools "+
			"and report the result concisely in chat. You may delegate parts of it "+
			"with a dispatch block, exactly as your team protocol describes.\n\nTask: %s",
		s.agentPrompt(ctx, agent), rt.Name, rt.TargetBehavior,
	)
}

func coalesce(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

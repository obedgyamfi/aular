package httpapi

import (
	"net/http"
	"sort"
)

// agentTokenUsage rolls the Hermes session accounting up to an agent.
type agentTokenUsage struct {
	AgentProfileID string `json:"agent_profile_id"`
	AgentName      string `json:"agent_name"`
	Sessions       int    `json:"sessions"`
	InputTokens    int64  `json:"input_tokens"`
	OutputTokens   int64  `json:"output_tokens"`
	ToolCalls      int64  `json:"tool_calls"`
}

type tokenUsageResponse struct {
	Totals   agentTokenUsage   `json:"totals"`
	PerAgent []agentTokenUsage `json:"per_agent"`
}

// GET /api/v1/usage/tokens — real token + tool-call accounting per agent, read
// live from Hermes' session store (all-time; Hermes flushes session rows on
// lifecycle boundaries, so the active session may not be counted yet). This is
// the honest unit the cost dashboard needs — chars (usage/summary) only
// measure chat volume.
func (s *Server) handleUsageTokens(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	snaps, _ := s.tokenSnaps(ctx)
	perConv, err := s.userState(ctx).UsageByConversation(ctx, snaps)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "hermes token usage: "+err.Error())
		return
	}

	// conversation → agent, via AULAR's own conversations table.
	convAgent := map[string]string{}
	if convos, err := s.conversationsRepo.ListConversations(ctx, s.ctxUserID(ctx), nil); err == nil {
		for _, c := range convos {
			convAgent[c.ID] = c.AgentProfileID
		}
	}
	agentName := map[string]string{}
	if profiles, err := s.agentsRepo.ListProfiles(ctx, s.ctxUserID(ctx)); err == nil {
		for _, p := range profiles {
			agentName[p.ID] = p.Name
		}
	}

	byAgent := map[string]*agentTokenUsage{}
	resp := tokenUsageResponse{PerAgent: []agentTokenUsage{}}
	for _, u := range perConv {
		agentID := convAgent[u.ConversationID]
		if agentID == "" {
			// Not one of this user's conversations (another account's, or
			// since-deleted) — with a shared Hermes store, skip entirely.
			continue
		}
		resp.Totals.Sessions += u.Sessions
		resp.Totals.InputTokens += u.InputTokens
		resp.Totals.OutputTokens += u.OutputTokens
		resp.Totals.ToolCalls += u.ToolCalls
		a := byAgent[agentID]
		if a == nil {
			a = &agentTokenUsage{AgentProfileID: agentID, AgentName: agentName[agentID]}
			byAgent[agentID] = a
		}
		a.Sessions += u.Sessions
		a.InputTokens += u.InputTokens
		a.OutputTokens += u.OutputTokens
		a.ToolCalls += u.ToolCalls
	}
	for _, a := range byAgent {
		resp.PerAgent = append(resp.PerAgent, *a)
	}
	sort.Slice(resp.PerAgent, func(i, j int) bool {
		ti := resp.PerAgent[i].InputTokens + resp.PerAgent[i].OutputTokens
		tj := resp.PerAgent[j].InputTokens + resp.PerAgent[j].OutputTokens
		if ti != tj {
			return ti > tj
		}
		return resp.PerAgent[i].AgentProfileID < resp.PerAgent[j].AgentProfileID
	})
	writeJSON(w, http.StatusOK, resp)
}

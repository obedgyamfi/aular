package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"strings"

	"github.com/obedgyamfi/aular/core/internal/agents"
	"github.com/obedgyamfi/aular/core/internal/agentspec"
	"github.com/obedgyamfi/aular/core/internal/realtime"
	"github.com/obedgyamfi/aular/core/internal/tools"
)

// toolCatalog reduces tool definitions to the name+risk the builder prompt needs.
func toolCatalog(defs []*tools.ToolDefinition) []agentspec.ToolLite {
	out := make([]agentspec.ToolLite, 0, len(defs))
	for _, d := range defs {
		out = append(out, agentspec.ToolLite{Name: d.Name, Risk: d.RiskLevel})
	}
	return out
}

// agentRoster reduces profiles to the id/name/role the editor prompt needs,
// excluding the AULAR system agent (which must never be edited by chat).
func agentRoster(profiles []*agents.AgentProfile) []agentspec.AgentLite {
	out := make([]agentspec.AgentLite, 0, len(profiles))
	for _, p := range profiles {
		if p.Role == "system" {
			continue
		}
		out = append(out, agentspec.AgentLite{ID: p.ID, Name: p.Name, Role: p.Role})
	}
	return out
}

// broadcastAgentCreated notifies clients so a newly created profile shows up in
// the sidebar live (used by both manual creation and chat-built agents).
func (s *Server) broadcastAgentCreated(ctx context.Context, p *agents.AgentProfile) {
	s.hub.Broadcast(realtime.Event{Type: "agent.created", Data: p, UserID: s.ctxUserID(ctx)})
}

// broadcastAgentUpdated notifies clients so an edited profile updates live.
func (s *Server) broadcastAgentUpdated(ctx context.Context, p *agents.AgentProfile) {
	s.hub.Broadcast(realtime.Event{Type: "agent.updated", Data: p, UserID: s.ctxUserID(ctx)})
}

// applyAgentBlock builds or edits an agent from a completed structured block.
// It returns a confirmation string only when the visible message was block-only
// (so the caller can give the empty bubble something to show).
func (s *Server) applyAgentBlock(ctx context.Context, conversationID, messageID string, kind agentspec.BlockKind, blockJSON, cleaned string) string {
	var built *agents.AgentProfile
	var verb string
	switch kind {
	case agentspec.BlockCreate:
		built, verb = s.maybeBuildAgentFromSpec(ctx, conversationID, messageID, blockJSON), "Created"
	case agentspec.BlockEdit:
		built, verb = s.maybeEditAgentFromSpec(ctx, conversationID, messageID, blockJSON), "Updated"
	case agentspec.BlockDispatch, agentspec.BlockDoc:
		// Org blocks. The engine handles these in OnAgentReply; the shell only
		// strips them from the visible bubble. With no engine linked they are
		// inert, which is correct: the free shell has no org to dispatch into.
		return ""
	default:
		return ""
	}
	if built != nil && cleaned == "" {
		return verb + " **" + built.Name + "**. It's ready in your agent list."
	}
	return ""
}

// maybeEditAgentFromSpec applies a completed edit block to an existing agent,
// once. Only fires for the AULAR system-agent conversation; never edits the
// system agent itself. Returns the updated profile or nil (handled gracefully).
func (s *Server) maybeEditAgentFromSpec(ctx context.Context, conversationID, messageID, editJSON string) *agents.AgentProfile {
	s.specMu.Lock()
	if s.specDone[messageID] {
		s.specMu.Unlock()
		return nil
	}
	s.specDone[messageID] = true
	s.specMu.Unlock()

	convo, err := s.conversationsRepo.GetConversation(ctx, conversationID)
	if err != nil {
		return nil
	}
	profile, err := s.agentsRepo.GetProfile(ctx, convo.AgentProfileID)
	if err != nil || profile.Role != "system" {
		return nil
	}

	edit, err := agentspec.ParseEdit(editJSON)
	if err != nil {
		log.Printf("agentedit: bad edit json: %v", err)
		return nil
	}
	target := s.resolveTargetAgent(ctx, edit.TargetID, edit.TargetName)
	if target == nil {
		log.Printf("agentedit: target not found (id=%q name=%q)", edit.TargetID, edit.TargetName)
		return nil
	}
	if target.Role == "system" {
		return nil // never edit the system agent by chat
	}

	patch := agents.ProfilePatch{
		Name:         edit.Name,
		Role:         edit.Role,
		Persona:      edit.Persona,
		Instructions: edit.Instructions,
		Tone:         edit.Tone,
	}
	if edit.DefaultTools != nil {
		defs, _ := s.toolsRepo.ListDefinitions(ctx)
		filtered := agentspec.SanitizeTools(*edit.DefaultTools, toolCatalog(defs))
		patch.DefaultTools = &filtered
	}
	updated, err := s.agentsRepo.UpdateProfile(ctx, target.ID, patch)
	if err != nil {
		log.Printf("agentedit: update profile: %v", err)
		return nil
	}
	s.broadcastAgentUpdated(ctx, updated)
	return updated
}

// resolveTargetAgent finds the agent to edit by id first, then by name.
func (s *Server) resolveTargetAgent(ctx context.Context, id, name string) *agents.AgentProfile {
	if id != "" {
		if p, err := s.agentsRepo.GetProfile(ctx, id); err == nil {
			return p
		}
	}
	if name != "" {
		if profiles, err := s.agentsRepo.ListProfiles(ctx, s.ctxUserID(ctx)); err == nil {
			for _, p := range profiles {
				if strings.EqualFold(p.Name, name) {
					return p
				}
			}
		}
	}
	return nil
}

// maybeBuildAgentFromSpec turns a completed spec block into a real agent, once.
// It only fires for the AULAR system-agent conversation. Returns the created
// profile (or nil if it wasn't built — wrong conversation, already built, or an
// invalid spec, all handled gracefully so a chat never hard-fails).
func (s *Server) maybeBuildAgentFromSpec(ctx context.Context, conversationID, messageID, draftJSON string) *agents.AgentProfile {
	// Create-once guard across the streamed reply's deliver + finalizing edit.
	s.specMu.Lock()
	if s.specDone[messageID] {
		s.specMu.Unlock()
		return nil
	}
	s.specDone[messageID] = true
	s.specMu.Unlock()

	// Only the system agent builds agents.
	convo, err := s.conversationsRepo.GetConversation(ctx, conversationID)
	if err != nil {
		return nil
	}
	profile, err := s.agentsRepo.GetProfile(ctx, convo.AgentProfileID)
	if err != nil || profile.Role != "system" {
		return nil
	}

	draft, err := agentspec.ParseDraft(draftJSON)
	if err != nil {
		log.Printf("agentbuild: bad spec json: %v", err)
		return nil
	}
	defs, _ := s.toolsRepo.ListDefinitions(ctx)
	draft = agentspec.Sanitize(draft, toolCatalog(defs))
	if !draft.Valid() {
		log.Printf("agentbuild: incomplete spec (name/role missing)")
		return nil
	}

	agent, err := s.agentsRepo.GetOrCreateAgentForUser(ctx, s.ctxUserID(ctx))
	if err != nil {
		log.Printf("agentbuild: resolve agent: %v", err)
		return nil
	}
	created, err := s.agentsRepo.CreateProfile(ctx, &agents.AgentProfile{
		AgentID:           agent.ID,
		Name:              draft.Name,
		Role:              draft.Role,
		Persona:           draft.Persona,
		Instructions:      draft.Instructions,
		Tone:              draft.Tone,
		DefaultTools:      draft.DefaultTools,
		MemoryScope:       draft.MemoryScope,
		ModelBackend:      draft.ModelBackend,
		ScheduleRule:      draft.ScheduleRule,
		PermissionProfile: draft.PermissionProfile,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		log.Printf("agentbuild: create profile: %v", err)
		return nil
	}
	s.broadcastAgentCreated(ctx, created)
	return created
}

package httpapi

import (
	"context"
	"database/sql"

	"github.com/obedgyamfi/aular/core/engine"
	"github.com/obedgyamfi/aular/core/internal/agents"
)

// Server implements engine.Host: the set of things the org engine is allowed
// to ask the shell to do. This file is the entire surface the engine sees —
// if something isn't here, the engine cannot reach it.

var _ engine.Host = (*Server)(nil)

func (s *Server) DB() *sql.DB { return s.db }

func (s *Server) Roster(ctx context.Context, userID string) ([]engine.Agent, error) {
	profiles, err := s.agentsRepo.ListProfiles(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]engine.Agent, 0, len(profiles))
	for _, p := range profiles {
		out = append(out, engine.Agent{
			ID:        p.ID,
			Name:      p.Name,
			Role:      p.Role,
			Persona:   p.Persona,
			ReportsTo: deref(p.ReportsTo),
		})
	}
	return out, nil
}

func (s *Server) AgentByName(ctx context.Context, userID, name string) *engine.Agent {
	p := s.profileByName(ctx, userID, name)
	if p == nil {
		return nil
	}
	return &engine.Agent{
		ID:        p.ID,
		Name:      p.Name,
		Role:      p.Role,
		Persona:   p.Persona,
		ReportsTo: deref(p.ReportsTo),
	}
}

func (s *Server) Conversation(ctx context.Context, id string) (*engine.Conversation, error) {
	c, err := s.conversationsRepo.GetConversation(ctx, id)
	if err != nil {
		return nil, err
	}
	return &engine.Conversation{ID: c.ID, UserID: c.UserID, AgentProfileID: c.AgentProfileID}, nil
}

func (s *Server) OpenConversation(ctx context.Context, userID, agentID string) (*engine.Conversation, error) {
	c, err := s.findOrCreateConversation(ctx, userID, agentID)
	if err != nil {
		return nil, err
	}
	return &engine.Conversation{ID: c.ID, UserID: c.UserID, AgentProfileID: c.AgentProfileID}, nil
}

func (s *Server) RecentMessages(ctx context.Context, conversationID string, limit int) ([]engine.Message, error) {
	msgs, err := s.messagesRepo.ListMessages(ctx, conversationID, limit, nil)
	if err != nil {
		return nil, err
	}
	out := make([]engine.Message, 0, len(msgs))
	for _, m := range msgs {
		out = append(out, engine.Message{
			ID:         m.ID,
			SenderType: m.SenderType,
			Content:    m.Content,
			CreatedAt:  m.CreatedAt,
		})
	}
	return out, nil
}

func (s *Server) PostSystemMessage(ctx context.Context, conversationID, text string) {
	s.postSystemMessage(ctx, conversationID, text)
}

func (s *Server) RunTurn(conversationID, userID, systemPrompt, content string) {
	s.triggerTurn(conversationID, userID, systemPrompt, content)
}

// BasePrompt is the agent's own persona prompt — deliberately NOT enriched, or
// the engine would recurse through itself when preparing a teammate's turn.
func (s *Server) BasePrompt(ctx context.Context, agentID string) string {
	p, err := s.agentsRepo.GetProfile(ctx, agentID)
	if err != nil {
		return ""
	}
	return agents.BuildSystemPrompt(p)
}

// deref flattens the shell's optional reports_to into the engine's plain
// string ("" = reports to the user).
func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

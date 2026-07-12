package httpapi

import (
	"context"
	"fmt"
	"log"

	"github.com/obedgyamfi/aular/core/engine"
	"github.com/obedgyamfi/aular/core/internal/agents"
	"github.com/obedgyamfi/aular/core/internal/conversations"
	"github.com/obedgyamfi/aular/core/internal/infra/aularadapter"
	"github.com/obedgyamfi/aular/core/internal/messages"
	"github.com/obedgyamfi/aular/core/internal/realtime"
)

// Turn plumbing: how a prompt is assembled and how an agent is made to run.
// The shell owns the mechanics; the engine owns what the prompt *says* beyond
// the agent's own persona (see engine.Engine.EnrichPrompt).

// agentPrompt builds the system prompt for an agent: its persona and
// instructions, then whatever the linked engine adds — a team roster, the
// dispatch protocol, the knowledge bank. The free engine adds nothing, and the
// agent behaves like a capable individual rather than a member of an org.
func (s *Server) agentPrompt(ctx context.Context, profile *agents.AgentProfile) string {
	base := agents.BuildSystemPrompt(profile)
	return s.engine.EnrichPrompt(ctx, engine.Prompt{
		UserID:         s.ctxUserID(ctx),
		AgentProfileID: profile.ID,
		Base:           base,
	})
}

// triggerTurn runs an agent turn in a conversation, fire-and-forget. The reply
// arrives asynchronously through /internal/deliver, exactly as if the user had
// typed the message themselves.
func (s *Server) triggerTurn(conversationID, userID, prompt, content string) {
	go func() {
		bg := context.Background()
		if err := s.deliverTo(bg, userID, aularadapter.InboundRequest{
			ConversationID: conversationID,
			UserID:         userID,
			Content:        content,
			SystemPrompt:   prompt,
		}); err != nil {
			log.Printf("httpapi: trigger turn failed: %v", err)
		}
	}()
}

// postSystemMessage writes a neutral system note into a conversation and
// broadcasts it — how the app narrates something it did on the user's behalf.
func (s *Server) postSystemMessage(ctx context.Context, conversationID, text string) {
	convo, err := s.conversationsRepo.GetConversation(ctx, conversationID)
	if err != nil {
		return
	}
	msg, err := s.messagesRepo.CreateMessage(ctx, &messages.Message{
		ConversationID: conversationID,
		SenderType:     "system",
		Content:        text,
		ContentFormat:  "text",
	})
	if err != nil {
		log.Printf("httpapi: post system message: %v", err)
		return
	}
	s.hub.Broadcast(realtime.Event{
		Type:           "message.created",
		ConversationID: conversationID,
		Data:           msg,
		UserID:         convo.UserID,
	})
}

// findOrCreateConversation returns the user's conversation with an agent,
// creating it if this is the first contact.
func (s *Server) findOrCreateConversation(ctx context.Context, userID, agentProfileID string) (*conversations.Conversation, error) {
	existing, err := s.conversationsRepo.ListConversations(ctx, userID, &agentProfileID)
	if err != nil {
		return nil, err
	}
	if len(existing) > 0 {
		return existing[0], nil
	}
	return s.conversationsRepo.CreateConversation(ctx, &conversations.Conversation{
		UserID:         userID,
		AgentProfileID: agentProfileID,
	})
}

// profileByName resolves one of the user's agents by name — the engine routes
// dispatched work by agent name, because that is how a person refers to staff.
func (s *Server) profileByName(ctx context.Context, userID, name string) *agents.AgentProfile {
	profiles, err := s.agentsRepo.ListProfiles(ctx, userID)
	if err != nil {
		return nil
	}
	for _, p := range profiles {
		if p.Name == name {
			return p
		}
	}
	return nil
}

// notifyEngine hands a finalized agent reply to the org engine. The free
// engine ignores it; the licensed engine routes dispatched work, relays
// reports, and corrects narrated delegation. Runs off the delivery path so a
// slow engine can never stall a reply reaching the user.
func (s *Server) notifyEngine(ctx context.Context, conversationID, messageID, content string, final bool) {
	convo, err := s.conversationsRepo.GetConversation(ctx, conversationID)
	if err != nil {
		return
	}
	turn := engine.Turn{
		UserID:         convo.UserID,
		ConversationID: conversationID,
		AgentProfileID: convo.AgentProfileID,
		MessageID:      messageID,
		Content:        content,
		Final:          final,
	}
	go s.engine.OnAgentReply(context.Background(), turn)
}

// enforceAgentLimit stops the free shell at its agent cap. The message names
// what's missing rather than nagging: the ceiling is the organization, and the
// organization is the product.
func (s *Server) enforceAgentLimit(ctx context.Context) error {
	max := s.engine.MaxAgents()
	if max == 0 {
		return nil // unlimited: the org engine is linked and licensed
	}
	profiles, err := s.agentsRepo.ListProfiles(ctx, s.ctxUserID(ctx))
	if err != nil {
		return nil // never block on a bookkeeping failure
	}
	staff := 0
	for _, p := range profiles {
		if p.Role != "system" { // the AULAR system agent doesn't count against you
			staff++
		}
	}
	if staff >= max {
		return fmt.Errorf(
			"this build supports %d agents. Agents that delegate work to each other, "+
				"share a roadmap, and run on a schedule are AULAR Pro", max)
	}
	return nil
}

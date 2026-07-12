package conversations

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

type scanner interface {
	Scan(dest ...any) error
}

const conversationColumns = `id, user_id, agent_profile_id, title, context_tags, linked_project_id, linked_task_id, last_read_at, created_at, updated_at`

func scanConversation(row scanner) (*Conversation, error) {
	var c Conversation
	var tagsRaw []byte
	if err := row.Scan(&c.ID, &c.UserID, &c.AgentProfileID, &c.Title, &tagsRaw, &c.LinkedProjectID, &c.LinkedTaskID, &c.LastReadAt, &c.CreatedAt, &c.UpdatedAt); err != nil {
		return nil, err
	}
	if len(tagsRaw) > 0 {
		if err := json.Unmarshal(tagsRaw, &c.ContextTags); err != nil {
			return nil, fmt.Errorf("conversations: unmarshal context_tags: %w", err)
		}
	}
	return &c, nil
}

func (r *Repository) CreateConversation(ctx context.Context, c *Conversation) (*Conversation, error) {
	tagsJSON, err := json.Marshal(c.ContextTags)
	if err != nil {
		return nil, fmt.Errorf("conversations: marshal context_tags: %w", err)
	}
	row := r.db.QueryRowContext(ctx, `
		INSERT INTO conversations (id, user_id, agent_profile_id, title, context_tags, linked_project_id, linked_task_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		RETURNING `+conversationColumns,
		uuid.NewString(), c.UserID, c.AgentProfileID, c.Title, tagsJSON, c.LinkedProjectID, c.LinkedTaskID,
	)
	return scanConversation(row)
}

// ListConversations orders by most recent activity (latest message, falling
// back to the conversation's own created_at when it has no messages yet) and
// includes unread_count: agent/system messages newer than last_read_at.
func (r *Repository) ListConversations(ctx context.Context, userID string, agentProfileID *string) ([]*Conversation, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+conversationColumns+`,
			(SELECT COUNT(*) FROM messages m
			 WHERE m.conversation_id = c.id
			   AND m.sender_type != 'user'
			   AND (c.last_read_at IS NULL OR m.created_at > c.last_read_at)) AS unread_count,
			(SELECT m.content     FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message,
			(SELECT m.created_at  FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_at,
			(SELECT m.sender_type FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_sender
		FROM conversations c
		WHERE c.user_id = ?
		  AND (? IS NULL OR c.agent_profile_id = ?)
		ORDER BY COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id), c.created_at) DESC`,
		userID, agentProfileID, agentProfileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conversations []*Conversation
	for rows.Next() {
		var c Conversation
		var tagsRaw []byte
		if err := rows.Scan(&c.ID, &c.UserID, &c.AgentProfileID, &c.Title, &tagsRaw, &c.LinkedProjectID, &c.LinkedTaskID, &c.LastReadAt, &c.CreatedAt, &c.UpdatedAt, &c.UnreadCount, &c.LastMessage, &c.LastMessageAt, &c.LastMessageSender); err != nil {
			return nil, err
		}
		if len(tagsRaw) > 0 {
			if err := json.Unmarshal(tagsRaw, &c.ContextTags); err != nil {
				return nil, fmt.Errorf("conversations: unmarshal context_tags: %w", err)
			}
		}
		conversations = append(conversations, &c)
	}
	return conversations, rows.Err()
}

// MarkRead stamps last_read_at = now, so agent messages up to this point stop
// counting as unread. Called when the user opens/views a conversation.
func (r *Repository) MarkRead(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE conversations SET last_read_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?`, id)
	return err
}

// MarkReadByAgent marks every conversation of an agent read. The UI shows one
// thread per agent (the most recent), so opening the agent should clear the
// whole agent's badge, not just that one thread.
func (r *Repository) MarkReadByAgent(ctx context.Context, agentProfileID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE conversations SET last_read_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE agent_profile_id = ?`, agentProfileID)
	return err
}

func (r *Repository) GetConversation(ctx context.Context, id string) (*Conversation, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+conversationColumns+` FROM conversations WHERE id = ?`, id)
	return scanConversation(row)
}

type ConversationPatch struct {
	Title           *string
	ContextTags     *[]string
	LinkedProjectID *string
	LinkedTaskID    *string
}

func (r *Repository) UpdateConversation(ctx context.Context, id string, patch ConversationPatch) (*Conversation, error) {
	var tagsJSON []byte
	if patch.ContextTags != nil {
		b, err := json.Marshal(*patch.ContextTags)
		if err != nil {
			return nil, fmt.Errorf("conversations: marshal context_tags: %w", err)
		}
		tagsJSON = b
	}
	row := r.db.QueryRowContext(ctx, `
		UPDATE conversations SET
			title = COALESCE(?, title),
			context_tags = COALESCE(?, context_tags),
			linked_project_id = COALESCE(?, linked_project_id),
			linked_task_id = COALESCE(?, linked_task_id),
			updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		WHERE id = ?
		RETURNING `+conversationColumns,
		patch.Title, tagsJSON, patch.LinkedProjectID, patch.LinkedTaskID, id,
	)
	return scanConversation(row)
}

func (r *Repository) DeleteConversation(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM conversations WHERE id = ?`, id)
	return err
}

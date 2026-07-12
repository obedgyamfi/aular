package conversations

import "time"

type Conversation struct {
	ID              string     `db:"id" json:"id"`
	UserID          string     `db:"user_id" json:"user_id"`
	AgentProfileID  string     `db:"agent_profile_id" json:"agent_profile_id"`
	Title           string     `db:"title" json:"title"`
	ContextTags     []string   `db:"context_tags" json:"context_tags"`
	LinkedProjectID *string    `db:"linked_project_id" json:"linked_project_id,omitempty"`
	LinkedTaskID    *string    `db:"linked_task_id" json:"linked_task_id,omitempty"`
	LastReadAt      *time.Time `db:"last_read_at" json:"last_read_at,omitempty"`
	CreatedAt       time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time  `db:"updated_at" json:"updated_at"`
	// UnreadCount is computed by the list query (count of agent/system
	// messages newer than last_read_at), not a stored column.
	UnreadCount int `db:"-" json:"unread_count"`
	// Last-message preview for the sidebar (computed by the list query).
	LastMessage       *string    `db:"-" json:"last_message,omitempty"`
	LastMessageAt     *time.Time `db:"-" json:"last_message_at,omitempty"`
	LastMessageSender *string    `db:"-" json:"last_message_sender,omitempty"`
}

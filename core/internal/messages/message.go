package messages

import (
	"encoding/json"
	"time"
)

type Message struct {
	ID                string          `db:"id" json:"id"`
	ConversationID    string          `db:"conversation_id" json:"conversation_id"`
	SenderType        string          `db:"sender_type" json:"sender_type"` // "user" | "agent" | "system"
	SenderID          string          `db:"sender_id" json:"sender_id"`
	Content           string          `db:"content" json:"content"`
	ContentFormat     string          `db:"content_format" json:"content_format"`
	StructuredPayload json.RawMessage `db:"structured_payload" json:"structured_payload,omitempty"`
	ReplyToMessageID  *string         `db:"reply_to_message_id" json:"reply_to_message_id,omitempty"`
	CreatedAt         time.Time       `db:"created_at" json:"created_at"`
}

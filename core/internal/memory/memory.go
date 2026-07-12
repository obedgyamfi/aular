package memory

import "time"

type MemoryItem struct {
	ID              string    `db:"id" json:"id"`
	UserID          string    `db:"user_id" json:"user_id"`
	AgentProfileID  string    `db:"agent_profile_id" json:"agent_profile_id"`
	Key             string    `db:"key" json:"key"`
	Value           string    `db:"value" json:"value"`
	Scope           string    `db:"scope" json:"scope"`
	Confidence      float64   `db:"confidence" json:"confidence"`
	SourceMessageID string    `db:"source_message_id" json:"source_message_id"`
	SourceEventID   string    `db:"source_event_id" json:"source_event_id"`
	CreatedAt       time.Time `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time `db:"updated_at" json:"updated_at"`
}

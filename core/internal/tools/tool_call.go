package tools

import "time"

type ToolCall struct {
	ID              string    `db:"id" json:"id"`
	UserID          string    `db:"user_id" json:"user_id"`
	AgentProfileID  string    `db:"agent_profile_id" json:"agent_profile_id"`
	ConversationID  string    `db:"conversation_id" json:"conversation_id"`
	ToolName        string    `db:"tool_name" json:"tool_name"`
	RequestPayload  []byte    `db:"request_payload" json:"request_payload"`
	ResponsePayload []byte    `db:"response_payload" json:"response_payload"`
	Status          string    `db:"status" json:"status"`
	ApprovalState   string    `db:"approval_state" json:"approval_state"`
	CreatedAt       time.Time `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time `db:"updated_at" json:"updated_at"`
}

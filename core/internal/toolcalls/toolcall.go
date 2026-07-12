// Package toolcalls records agent tool invocations reported by the Hermes
// aular platform plugin, backing the Work register's live session feed. See
// docs/event-schema.md for the honest-status semantics: Hermes only surfaces
// tool *starts* to platform adapters, so calls are "running" until the turn's
// reply finalizes, then "settled" (never "succeeded" — we don't know).
package toolcalls

import (
	"encoding/json"
	"time"
)

const (
	StatusRunning = "running"
	StatusSettled = "settled"
)

type ToolCall struct {
	ID              string          `db:"id" json:"id"`
	UserID          string          `db:"user_id" json:"user_id"`
	AgentProfileID  string          `db:"agent_profile_id" json:"agent_profile_id"`
	ConversationID  string          `db:"conversation_id" json:"conversation_id"`
	ToolName        string          `db:"tool_name" json:"tool_name"`
	RequestPayload  json.RawMessage `db:"request_payload" json:"request_payload"`
	ResponsePayload json.RawMessage `db:"response_payload" json:"response_payload"`
	Status          string          `db:"status" json:"status"`
	ApprovalState   string          `db:"approval_state" json:"approval_state"`
	CreatedAt       time.Time       `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time       `db:"updated_at" json:"updated_at"`
}

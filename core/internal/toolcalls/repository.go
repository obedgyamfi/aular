package toolcalls

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/google/uuid"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

const columns = `id, user_id, agent_profile_id, conversation_id, tool_name,
	request_payload, response_payload, status, approval_state, created_at, updated_at`

func scanToolCall(row interface{ Scan(...any) error }) (*ToolCall, error) {
	var tc ToolCall
	var agent, conv sql.NullString
	var req, resp string
	if err := row.Scan(&tc.ID, &tc.UserID, &agent, &conv, &tc.ToolName,
		&req, &resp, &tc.Status, &tc.ApprovalState, &tc.CreatedAt, &tc.UpdatedAt); err != nil {
		return nil, err
	}
	tc.AgentProfileID = agent.String
	tc.ConversationID = conv.String
	tc.RequestPayload = json.RawMessage(req)
	tc.ResponsePayload = json.RawMessage(resp)
	return &tc, nil
}

// Create inserts a reported tool invocation (status "running" unless set).
func (r *Repository) Create(ctx context.Context, tc *ToolCall) (*ToolCall, error) {
	if tc.Status == "" {
		tc.Status = StatusRunning
	}
	if tc.ApprovalState == "" {
		tc.ApprovalState = "not_required"
	}
	if len(tc.RequestPayload) == 0 {
		tc.RequestPayload = json.RawMessage(`{}`)
	}
	if len(tc.ResponsePayload) == 0 {
		tc.ResponsePayload = json.RawMessage(`{}`)
	}
	id := uuid.NewString()
	var agent, conv any
	if tc.AgentProfileID != "" {
		agent = tc.AgentProfileID
	}
	if tc.ConversationID != "" {
		conv = tc.ConversationID
	}
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO tool_calls (id, user_id, agent_profile_id, conversation_id, tool_name,
		    request_payload, response_payload, status, approval_state)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, tc.UserID, agent, conv, tc.ToolName,
		string(tc.RequestPayload), string(tc.ResponsePayload), tc.Status, tc.ApprovalState)
	if err != nil {
		return nil, err
	}
	return r.get(ctx, id)
}

func (r *Repository) get(ctx context.Context, id string) (*ToolCall, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+columns+` FROM tool_calls WHERE id = ?`, id)
	return scanToolCall(row)
}

// SettleRunning marks every running call of a conversation settled (the turn's
// reply finalized — see package doc) and returns the updated rows so the
// caller can broadcast them.
func (r *Repository) SettleRunning(ctx context.Context, conversationID string) ([]*ToolCall, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id FROM tool_calls WHERE conversation_id = ? AND status = ?`,
		conversationID, StatusRunning)
	if err != nil {
		return nil, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}

	settled := make([]*ToolCall, 0, len(ids))
	for _, id := range ids {
		if _, err := r.db.ExecContext(ctx,
			`UPDATE tool_calls SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
			  WHERE id = ? AND status = ?`,
			StatusSettled, id, StatusRunning); err != nil {
			return nil, err
		}
		tc, err := r.get(ctx, id)
		if err != nil {
			return nil, err
		}
		settled = append(settled, tc)
	}
	return settled, nil
}

// ListByConversation returns a conversation's calls, newest first.
func (r *Repository) ListByConversation(ctx context.Context, conversationID string, limit int) ([]*ToolCall, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	// rowid tie-break: parallel batch inserts share a created_at millisecond,
	// and uuid order is random — insertion order is the real chronology.
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+columns+` FROM tool_calls WHERE conversation_id = ?
		  ORDER BY created_at DESC, rowid DESC LIMIT ?`,
		conversationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]*ToolCall, 0, limit)
	for rows.Next() {
		tc, err := scanToolCall(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, tc)
	}
	return list, rows.Err()
}

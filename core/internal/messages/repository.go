package messages

import (
	"context"
	"database/sql"

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

const messageColumns = `id, conversation_id, sender_type, sender_id, content, content_format, structured_payload, reply_to_message_id, created_at`

func scanMessage(row scanner) (*Message, error) {
	var m Message
	var payloadRaw []byte
	if err := row.Scan(&m.ID, &m.ConversationID, &m.SenderType, &m.SenderID, &m.Content, &m.ContentFormat, &payloadRaw, &m.ReplyToMessageID, &m.CreatedAt); err != nil {
		return nil, err
	}
	if len(payloadRaw) > 0 {
		m.StructuredPayload = payloadRaw
	}
	return &m, nil
}

func (r *Repository) CreateMessage(ctx context.Context, m *Message) (*Message, error) {
	var payload []byte
	if len(m.StructuredPayload) > 0 {
		payload = m.StructuredPayload
	}
	row := r.db.QueryRowContext(ctx, `
		INSERT INTO messages (id, conversation_id, sender_type, sender_id, content, content_format, structured_payload, reply_to_message_id)
		VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, '{}'), ?)
		RETURNING `+messageColumns,
		uuid.NewString(), m.ConversationID, m.SenderType, m.SenderID, m.Content, m.ContentFormat, payload, m.ReplyToMessageID,
	)
	return scanMessage(row)
}

// UpdateMessageContent replaces a message's text (and, when the format
// changes, its content_format) in place — used by streaming agent replies that
// grow a bubble token-by-token via repeated /internal/edit calls. Returns the
// updated row so the caller can broadcast it. sql.ErrNoRows if it's gone.
func (r *Repository) UpdateMessageContent(ctx context.Context, id, content string) (*Message, error) {
	row := r.db.QueryRowContext(ctx, `
		UPDATE messages SET content = ? WHERE id = ?
		RETURNING `+messageColumns,
		content, id)
	return scanMessage(row)
}

// DeleteMessage removes a message and returns the conversation it belonged to
// (for the realtime broadcast); sql.ErrNoRows if it didn't exist. It requires
// the conversation id too, so a caller can only delete messages inside a
// conversation it already proved it owns.
func (r *Repository) DeleteMessage(ctx context.Context, id, conversationID string) (string, error) {
	var convID string
	err := r.db.QueryRowContext(ctx,
		`DELETE FROM messages WHERE id = ? AND conversation_id = ? RETURNING conversation_id`,
		id, conversationID).Scan(&convID)
	return convID, err
}

// ListMessages returns up to limit messages older than beforeID (cursor
// pagination), newest-first — callers reverse for chronological display.
func (r *Repository) ListMessages(ctx context.Context, conversationID string, limit int, beforeID *string) ([]*Message, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+messageColumns+`
		FROM messages
		WHERE conversation_id = ?
		  AND (? IS NULL OR created_at < (SELECT created_at FROM messages WHERE id = ?))
		ORDER BY created_at DESC
		LIMIT ?`,
		conversationID, beforeID, beforeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []*Message
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// TotalChars sums the content length of a conversation's messages — the
// input for the composer's context-size estimate.
func (r *Repository) TotalChars(ctx context.Context, conversationID string) (int64, error) {
	var n sql.NullInt64
	err := r.db.QueryRowContext(ctx,
		`SELECT SUM(LENGTH(content)) FROM messages WHERE conversation_id = ?`,
		conversationID).Scan(&n)
	return n.Int64, err
}

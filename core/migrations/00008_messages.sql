-- +goose Up
CREATE TABLE messages (
    id                   TEXT PRIMARY KEY,
    conversation_id      TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type          TEXT NOT NULL, -- 'user' | 'agent' | 'system'
    sender_id            TEXT NOT NULL DEFAULT '',
    content              TEXT NOT NULL DEFAULT '',
    content_format       TEXT NOT NULL DEFAULT 'text',
    structured_payload   TEXT NOT NULL DEFAULT '{}',
    reply_to_message_id  TEXT REFERENCES messages(id) ON DELETE SET NULL,
    created_at           DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- +goose Down
DROP TABLE messages;

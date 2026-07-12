-- +goose Up
CREATE TABLE memories (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_profile_id   TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
    key                TEXT NOT NULL,
    value              TEXT NOT NULL DEFAULT '',
    scope              TEXT NOT NULL DEFAULT 'user',
    confidence         REAL NOT NULL DEFAULT 1.0,
    source_message_id  TEXT REFERENCES messages(id) ON DELETE SET NULL,
    source_event_id    TEXT,
    created_at         DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at         DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_memories_user_id ON memories(user_id);
CREATE INDEX idx_memories_agent_profile_id ON memories(agent_profile_id);

-- +goose Down
DROP TABLE memories;

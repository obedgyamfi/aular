-- +goose Up
CREATE TABLE tool_calls (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_profile_id   TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
    conversation_id    TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    tool_name          TEXT NOT NULL,
    request_payload    TEXT NOT NULL DEFAULT '{}',
    response_payload   TEXT NOT NULL DEFAULT '{}',
    status             TEXT NOT NULL DEFAULT 'created', -- created|pending_approval|queued|running|succeeded|failed|denied
    approval_state     TEXT NOT NULL DEFAULT 'not_required',
    created_at         DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at         DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_tool_calls_user_id ON tool_calls(user_id);
CREATE INDEX idx_tool_calls_conversation_id ON tool_calls(conversation_id);

-- +goose Down
DROP TABLE tool_calls;

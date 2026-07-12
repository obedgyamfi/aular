-- +goose Up
CREATE TABLE conversations (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_profile_id  TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
    title             TEXT NOT NULL DEFAULT '',
    context_tags      TEXT NOT NULL DEFAULT '[]',
    linked_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    linked_task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    created_at        DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at        DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_agent_profile_id ON conversations(agent_profile_id);

-- +goose Down
DROP TABLE conversations;

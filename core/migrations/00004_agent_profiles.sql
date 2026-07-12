-- +goose Up
CREATE TABLE agent_profiles (
    id                  TEXT PRIMARY KEY,
    agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    role                TEXT NOT NULL,
    persona             TEXT NOT NULL DEFAULT '',
    instructions        TEXT NOT NULL DEFAULT '',
    tone                TEXT NOT NULL DEFAULT '',
    default_tools       TEXT NOT NULL DEFAULT '[]',
    memory_scope        TEXT NOT NULL DEFAULT '',
    model_backend       TEXT NOT NULL DEFAULT 'ollama', -- 'ollama' | 'codex_cli'
    schedule_rule       TEXT NOT NULL DEFAULT '',
    permission_profile  TEXT NOT NULL DEFAULT '',
    created_at          DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (agent_id, name)
);

CREATE INDEX idx_agent_profiles_agent_id ON agent_profiles(agent_id);

-- +goose Down
DROP TABLE agent_profiles;

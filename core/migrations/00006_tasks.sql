-- +goose Up
CREATE TABLE tasks (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
    agent_profile_id  TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
    title             TEXT NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    status            TEXT NOT NULL DEFAULT 'draft',
    priority          TEXT NOT NULL DEFAULT 'normal',
    due_at            DATETIME,
    estimate_minutes  INTEGER,
    recurrence_rule   TEXT NOT NULL DEFAULT '',
    created_at        DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at        DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);

-- +goose Down
DROP TABLE tasks;

-- +goose Up
CREATE TABLE projects (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    objective      TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'active',
    priority       TEXT NOT NULL DEFAULT 'normal',
    linked_agents  TEXT NOT NULL DEFAULT '[]',
    created_at     DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at     DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_projects_user_id ON projects(user_id);

-- +goose Down
DROP TABLE projects;

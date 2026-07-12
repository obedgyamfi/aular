-- +goose Up
CREATE TABLE audit_events (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_type   TEXT NOT NULL, -- 'user' | 'agent' | 'system'
    actor_id     TEXT NOT NULL DEFAULT '',
    action_type  TEXT NOT NULL,
    target_type  TEXT NOT NULL,
    target_id    TEXT NOT NULL DEFAULT '',
    metadata     TEXT NOT NULL DEFAULT '{}',
    created_at   DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_audit_events_user_id ON audit_events(user_id);

-- +goose Down
DROP TABLE audit_events;

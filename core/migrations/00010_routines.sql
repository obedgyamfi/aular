-- +goose Up
CREATE TABLE routines (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    schedule_rule    TEXT NOT NULL DEFAULT '',
    target_behavior  TEXT NOT NULL DEFAULT '',
    priority         TEXT NOT NULL DEFAULT 'normal',
    active           INTEGER NOT NULL DEFAULT 1,
    created_at       DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at       DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_routines_user_id ON routines(user_id);

-- +goose Down
DROP TABLE routines;

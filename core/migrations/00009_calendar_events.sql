-- +goose Up
CREATE TABLE calendar_events (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type      TEXT NOT NULL DEFAULT 'manual',
    title            TEXT NOT NULL,
    start_at         DATETIME NOT NULL,
    end_at           DATETIME NOT NULL,
    timezone         TEXT NOT NULL DEFAULT 'UTC',
    location         TEXT NOT NULL DEFAULT '',
    participants     TEXT NOT NULL DEFAULT '[]',
    reminder_policy  TEXT NOT NULL DEFAULT '{}',
    status           TEXT NOT NULL DEFAULT 'confirmed',
    created_at       DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at       DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX idx_calendar_events_start_at ON calendar_events(start_at);

-- +goose Down
DROP TABLE calendar_events;

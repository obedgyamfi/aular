-- +goose Up
CREATE TABLE users (
    id                     TEXT PRIMARY KEY,
    email                  TEXT NOT NULL UNIQUE,
    display_name           TEXT NOT NULL,
    timezone               TEXT NOT NULL DEFAULT 'UTC',
    locale                 TEXT NOT NULL DEFAULT 'en-US',
    preferences            TEXT NOT NULL DEFAULT '{}',
    notification_settings  TEXT NOT NULL DEFAULT '{}',
    created_at             DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at             DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- +goose Down
DROP TABLE users;

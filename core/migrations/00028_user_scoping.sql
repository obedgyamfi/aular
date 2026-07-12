-- +goose Up
-- Multi-user scoping for the two tables that were app-global. Existing rows
-- (the metrics epoch + benchmark snapshots) belong to the original dev user.
CREATE TABLE app_settings_new (
    user_id    TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, key)
);
INSERT INTO app_settings_new (user_id, key, value, updated_at)
    SELECT 'user-dev', key, value, updated_at FROM app_settings;
DROP TABLE app_settings;
ALTER TABLE app_settings_new RENAME TO app_settings;

CREATE TABLE metrics_snapshots_new (
    user_id       TEXT NOT NULL,
    session_id    TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    tool_calls    INTEGER NOT NULL DEFAULT 0,
    taken_at      DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, session_id)
);
INSERT INTO metrics_snapshots_new (user_id, session_id, input_tokens, output_tokens, tool_calls)
    SELECT 'user-dev', session_id, input_tokens, output_tokens, tool_calls FROM metrics_snapshots;
DROP TABLE metrics_snapshots;
ALTER TABLE metrics_snapshots_new RENAME TO metrics_snapshots;

-- +goose Down
-- Collapses back to global (keeps user-dev's rows).
CREATE TABLE app_settings_old (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO app_settings_old (key, value, updated_at)
    SELECT key, value, updated_at FROM app_settings WHERE user_id = 'user-dev';
DROP TABLE app_settings;
ALTER TABLE app_settings_old RENAME TO app_settings;

CREATE TABLE metrics_snapshots_old (
    session_id    TEXT PRIMARY KEY,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    tool_calls    INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO metrics_snapshots_old (session_id, input_tokens, output_tokens, tool_calls)
    SELECT session_id, input_tokens, output_tokens, tool_calls FROM metrics_snapshots WHERE user_id = 'user-dev';
DROP TABLE metrics_snapshots;
ALTER TABLE metrics_snapshots_old RENAME TO metrics_snapshots;

-- +goose Up
-- Small app-level key/value settings. First use: metrics_epoch — the
-- timestamp usage/token dashboards count from (a "reset metrics" baseline),
-- since Hermes' session store is read-only history we must filter, not wipe.
CREATE TABLE app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- +goose Down
DROP TABLE app_settings;

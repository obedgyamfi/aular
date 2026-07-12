-- +goose Up
-- Each user's Hermes runtime: profile directory, adapter port, and the
-- internal token its gateway authenticates with. The original account is
-- adopted onto the default ~/.hermes runtime by `userctl adopt-default`
-- (its token comes from the environment, so not seeded here).
CREATE TABLE users_runtime (
    user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    profile_name    TEXT NOT NULL UNIQUE,  -- '__default__' = ~/.hermes itself
    adapter_port    INTEGER NOT NULL UNIQUE,
    internal_token  TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL DEFAULT 'provisioning', -- provisioning|ready|failed|disabled
    home_channel_id TEXT NOT NULL DEFAULT '',
    created_at      DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_started_at DATETIME,
    last_active_at  DATETIME
);

-- +goose Down
DROP TABLE users_runtime;

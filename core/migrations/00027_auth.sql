-- +goose Up
-- Real login accounts. Credentials live apart from users so a passkey table
-- can sit beside them later; sessions store only a hash of the opaque token
-- (the token itself exists nowhere at rest).
CREATE TABLE user_credentials (
    user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    updated_at    DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE auth_sessions (
    token_hash   TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at   DATETIME NOT NULL,
    last_seen_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    user_agent   TEXT NOT NULL DEFAULT '',
    ip           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);

-- Signup gating (AULAR_SIGNUP_MODE=invite). Minted by `userctl invite`.
CREATE TABLE invite_codes (
    code       TEXT PRIMARY KEY,
    created_by TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    used_by    TEXT,
    used_at    DATETIME
);

-- +goose Down
DROP TABLE invite_codes;
DROP TABLE auth_sessions;
DROP TABLE user_credentials;

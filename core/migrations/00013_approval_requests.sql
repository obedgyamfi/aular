-- +goose Up
CREATE TABLE approval_requests (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_profile_id   TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
    tool_call_id       TEXT NOT NULL REFERENCES tool_calls(id) ON DELETE CASCADE,
    requested_action   TEXT NOT NULL,
    risk_level         TEXT NOT NULL DEFAULT 'low',
    status             TEXT NOT NULL DEFAULT 'requested', -- requested|approved|denied|expired
    approved_by        TEXT,
    approved_at        DATETIME,
    created_at         DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_approval_requests_user_id ON approval_requests(user_id);
CREATE INDEX idx_approval_requests_tool_call_id ON approval_requests(tool_call_id);

-- +goose Down
DROP TABLE approval_requests;

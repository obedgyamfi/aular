-- +goose Up
-- Agent-to-agent work dispatches: a task routed from one agent's conversation
-- into another's (parsed from an <<<AULAR_DISPATCH>>> block in the sender's
-- reply). status: open (worker still on it) | answered (report relayed back).
-- depth caps relay chains (human turn = 0) so leads can re-dispatch on results
-- without unbounded loops.
CREATE TABLE dispatches (
    id                     TEXT PRIMARY KEY,
    user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    from_agent_name        TEXT NOT NULL,
    to_conversation_id     TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    to_agent_profile_id    TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
    to_agent_name          TEXT NOT NULL,
    task                   TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'open', -- open|answered
    depth                  INTEGER NOT NULL DEFAULT 0,
    created_at             DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    answered_at            DATETIME
);

CREATE INDEX idx_dispatches_to_conv ON dispatches(to_conversation_id, status);
CREATE INDEX idx_dispatches_from_conv ON dispatches(from_conversation_id);

-- +goose Down
DROP TABLE dispatches;

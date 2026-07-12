-- +goose Up
-- Silent metering: an append-only log of meterable activity (a message sent by
-- the user, a reply delivered by an agent). Groundwork for future usage limits
-- / billing — the free beta records but never enforces. Deliberately FK-free so
-- a usage record survives deletion of its agent/conversation (deleting a chat
-- must not undercount what was used).
CREATE TABLE usage_events (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL,
    agent_profile_id   TEXT,
    conversation_id    TEXT,
    -- The message this event meters. Lets a streamed agent reply (created from
    -- its first partial, then grown by edits) have its char count corrected to
    -- the final length when the stream finalizes.
    message_id         TEXT,
    kind               TEXT NOT NULL,          -- 'user_message' | 'agent_message'
    chars              INTEGER NOT NULL DEFAULT 0,
    created_at         DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_usage_events_user_created ON usage_events(user_id, created_at);
CREATE INDEX idx_usage_events_agent ON usage_events(agent_profile_id);
CREATE INDEX idx_usage_events_message ON usage_events(message_id);

-- +goose Down
DROP TABLE usage_events;

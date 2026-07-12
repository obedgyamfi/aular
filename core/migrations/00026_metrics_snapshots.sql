-- +goose Up
-- Per-session token counters captured at metrics reset. Usage dashboards show
-- current − snapshot, so sessions that keep running across a reset are counted
-- correctly (Hermes session rows are cumulative and can't be wiped).
CREATE TABLE metrics_snapshots (
    session_id    TEXT PRIMARY KEY,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    tool_calls    INTEGER NOT NULL DEFAULT 0
);

-- +goose Down
DROP TABLE metrics_snapshots;

-- +goose Up
-- SLA watchdog bookkeeping: when an open dispatch was last nudged (worker
-- reminded) and escalated (sender told to chase/reassign), so each fires once.
ALTER TABLE dispatches ADD COLUMN nudged_at DATETIME;
ALTER TABLE dispatches ADD COLUMN escalated_at DATETIME;

-- +goose Down
ALTER TABLE dispatches DROP COLUMN nudged_at;
ALTER TABLE dispatches DROP COLUMN escalated_at;

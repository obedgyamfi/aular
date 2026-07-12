-- +goose Up
-- Org hierarchy: which agent this profile reports to (NULL = top level,
-- rendered under the system agent). Validated in Go (existing profile, no
-- cycles) — SQLite ADD COLUMN can't carry an enforceable self-FK here.
ALTER TABLE agent_profiles ADD COLUMN reports_to TEXT;

-- +goose Down
ALTER TABLE agent_profiles DROP COLUMN reports_to;

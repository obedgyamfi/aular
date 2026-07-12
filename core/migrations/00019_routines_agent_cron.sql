-- +goose Up
-- Scope routines to an agent (whose persona runs the scheduled behavior) and
-- track the Hermes cron job the routine is bridged to, plus its last run.
ALTER TABLE routines ADD COLUMN agent_profile_id TEXT REFERENCES agent_profiles(id) ON DELETE CASCADE;
ALTER TABLE routines ADD COLUMN cron_job_id TEXT NOT NULL DEFAULT '';
ALTER TABLE routines ADD COLUMN last_run_at DATETIME;
CREATE INDEX idx_routines_agent_profile_id ON routines(agent_profile_id);

-- +goose Down
DROP INDEX idx_routines_agent_profile_id;
ALTER TABLE routines DROP COLUMN last_run_at;
ALTER TABLE routines DROP COLUMN cron_job_id;
ALTER TABLE routines DROP COLUMN agent_profile_id;

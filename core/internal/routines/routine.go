package routines

import "time"

type Routine struct {
	ID             string `db:"id" json:"id"`
	UserID         string `db:"user_id" json:"user_id"`
	AgentProfileID string `db:"agent_profile_id" json:"agent_profile_id"`
	Name           string `db:"name" json:"name"`
	ScheduleRule   string `db:"schedule_rule" json:"schedule_rule"`
	TargetBehavior string `db:"target_behavior" json:"target_behavior"`
	Priority       string `db:"priority" json:"priority"`
	Active         bool   `db:"active" json:"active"`
	// CronJobID is the Hermes cron job this routine is bridged to (empty when
	// inactive/unbridged). LastRunAt is set from the cron job when known.
	CronJobID string     `db:"cron_job_id" json:"cron_job_id"`
	LastRunAt *time.Time `db:"last_run_at" json:"last_run_at"`
	CreatedAt time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt time.Time  `db:"updated_at" json:"updated_at"`
}

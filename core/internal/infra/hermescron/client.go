// Package hermescron bridges AULAR routines to real Hermes scheduled jobs by
// shelling out to the `hermes cron` CLI. An active routine becomes a cron job
// that runs its behavior on schedule and delivers the result into the agent's
// AULAR conversation (deliver target aular:<conversation_id>), using the same
// proactive-push path the adapter already handles.
package hermescron

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type Client struct {
	bin string
	// home is the Hermes profile this client acts on ("" = the process
	// default, i.e. ~/.hermes). Set it to run cron against one user's runtime.
	home string
}

func NewClient() *Client {
	bin := os.Getenv("HERMES_BIN")
	if bin == "" {
		bin = "hermes"
	}
	return &Client{bin: bin}
}

// ForHome returns a client bound to a profile's Hermes home: the CLI runs
// with HERMES_HOME set, and the job store is read from that profile.
func (c *Client) ForHome(home string) *Client {
	return &Client{bin: c.bin, home: home}
}

// `hermes cron create` prints "Created job: <hex id>" on success.
var createdRe = regexp.MustCompile(`Created job:\s*([0-9a-fA-F]+)`)

// Create schedules a job that runs `prompt` on `schedule` (e.g. "30m",
// "every 2h", "0 9 * * *") and delivers into conversationID. Returns the job id.
func (c *Client) Create(ctx context.Context, name, schedule, prompt, conversationID string) (string, error) {
	out, err := c.run(ctx,
		"cron", "create",
		"--name", name,
		"--deliver", "aular:"+conversationID,
		schedule, prompt,
	)
	if err != nil {
		return "", err
	}
	m := createdRe.FindStringSubmatch(out)
	if m == nil {
		return "", fmt.Errorf("hermescron: could not parse job id from output: %s", strings.TrimSpace(out))
	}
	return m[1], nil
}

func (c *Client) Pause(ctx context.Context, jobID string) error {
	_, err := c.run(ctx, "cron", "pause", jobID)
	return err
}

func (c *Client) Resume(ctx context.Context, jobID string) error {
	_, err := c.run(ctx, "cron", "resume", jobID)
	return err
}

// Remove deletes a job. A missing job is not treated as an error so routine
// deletion stays idempotent even if the job was already gone.
func (c *Client) Remove(ctx context.Context, jobID string) error {
	out, err := c.run(ctx, "cron", "remove", jobID)
	if err != nil && strings.Contains(strings.ToLower(out), "not found") {
		return nil
	}
	return err
}

func (c *Client) run(ctx context.Context, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, c.bin, args...)
	if c.home != "" {
		cmd.Env = append(os.Environ(), "HERMES_HOME="+c.home)
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("hermescron: %s %v failed: %w: %s",
			c.bin, args, err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

// ── Read side: every scheduled job Hermes holds for the aular platform ──────
//
// Agents create reminders/schedules directly with their cronjob tool, which
// never touches AULAR's routines table — so the calendar reads Hermes' own
// store (~/.hermes/cron/jobs.json) read-only, the same trade hermesstate
// makes for token accounting.

// Job is one Hermes scheduled job destined for an AULAR conversation.
type Job struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Kind           string `json:"kind"` // "cron" | "once" | "every" | ...
	Expr           string `json:"expr,omitempty"`
	Display        string `json:"display,omitempty"`
	RunAt          string `json:"run_at,omitempty"`
	NextRunAt      string `json:"next_run_at,omitempty"`
	Enabled        bool   `json:"enabled"`
	State          string `json:"state,omitempty"`
	ConversationID string `json:"conversation_id"`
}

type rawJobs struct {
	Jobs []struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Schedule struct {
			Kind    string `json:"kind"`
			Expr    string `json:"expr"`
			Display string `json:"display"`
			RunAt   string `json:"run_at"`
		} `json:"schedule"`
		NextRunAt string `json:"next_run_at"`
		Enabled   bool   `json:"enabled"`
		State     string `json:"state"`
		Origin    struct {
			Platform string `json:"platform"`
			ChatID   string `json:"chat_id"`
		} `json:"origin"`
	} `json:"jobs"`
}

// List returns Hermes' scheduled jobs that deliver into aular conversations.
// A missing store (fresh machine) is an empty list, not an error.
func (c *Client) List(_ context.Context) ([]Job, error) {
	path := c.jobsPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []Job{}, nil
		}
		return nil, fmt.Errorf("read hermes cron store: %w", err)
	}
	var raw rawJobs
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse hermes cron store: %w", err)
	}
	jobs := []Job{}
	for _, j := range raw.Jobs {
		if j.Origin.Platform != "aular" || j.Origin.ChatID == "" {
			continue
		}
		jobs = append(jobs, Job{
			ID:             j.ID,
			Name:           j.Name,
			Kind:           j.Schedule.Kind,
			Expr:           j.Schedule.Expr,
			Display:        j.Schedule.Display,
			RunAt:          j.Schedule.RunAt,
			NextRunAt:      j.NextRunAt,
			Enabled:        j.Enabled,
			State:          j.State,
			ConversationID: j.Origin.ChatID,
		})
	}
	return jobs, nil
}

// jobsPath is the profile's cron store (HERMES_CRON_JOBS overrides for tests).
func (c *Client) jobsPath() string {
	if c.home != "" {
		return filepath.Join(c.home, "cron", "jobs.json")
	}
	if p := os.Getenv("HERMES_CRON_JOBS"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".hermes", "cron", "jobs.json")
}

// Package hermesstate reads aular-platform session accounting (tokens, tool
// calls) from Hermes' own store (~/.hermes/state.db, `sessions` table). Like
// hermesmemory, it's a read-only bridge: the numbers live in the Hermes
// runtime, AULAR only surfaces them. Sessions map 1:1 to AULAR conversations
// via sessions.chat_id.
//
// Caveat (verified 2026-07-07): Hermes flushes a session row on lifecycle
// boundaries, not per turn — the currently-active session may be missing or
// stale here. Fine for a usage rollup; do not build liveness on it.
package hermesstate

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	_ "modernc.org/sqlite"
)

type Client struct {
	dbPath string
}

func NewClient() *Client {
	path := os.Getenv("HERMES_STATE_DB")
	if path == "" {
		if home, err := os.UserHomeDir(); err == nil {
			path = filepath.Join(home, ".hermes", "state.db")
		}
	}
	return &Client{dbPath: path}
}

// NewClientForDB reads a specific profile's session store (see hermespaths) —
// how callers reach one user's Hermes runtime in the multi-user world.
func NewClientForDB(stateDB string) *Client {
	return &Client{dbPath: stateDB}
}

// ConversationUsage is one aular conversation's session accounting.
type ConversationUsage struct {
	ConversationID string `json:"conversation_id"`
	Sessions       int    `json:"sessions"`
	InputTokens    int64  `json:"input_tokens"`
	OutputTokens   int64  `json:"output_tokens"`
	ToolCalls      int64  `json:"tool_calls"`
}

// Snapshot mirrors tokensnap.Snapshot without importing it (keeps this
// package dependency-free of AULAR storage).
type Snapshot struct {
	InputTokens  int64
	OutputTokens int64
	ToolCalls    int64
}

// SessionRow is one aular session's raw cumulative counters.
type SessionRow struct {
	ID           string
	ChatID       string
	StartedAt    float64 // unix seconds
	InputTokens  int64
	OutputTokens int64
	ToolCalls    int64
}

// ListSessions returns every aular session's cumulative counters.
func (c *Client) ListSessions(ctx context.Context) ([]SessionRow, error) {
	if c.dbPath == "" {
		return []SessionRow{}, nil
	}
	if _, err := os.Stat(c.dbPath); err != nil {
		return []SessionRow{}, nil
	}
	db, err := sql.Open("sqlite", "file:"+c.dbPath+"?mode=ro&_pragma=busy_timeout(1500)")
	if err != nil {
		return nil, fmt.Errorf("open hermes state db: %w", err)
	}
	defer db.Close()

	rows, err := db.QueryContext(ctx,
		`SELECT id, chat_id, COALESCE(started_at, 0),
		        COALESCE(input_tokens, 0), COALESCE(output_tokens, 0), COALESCE(tool_call_count, 0)
		   FROM sessions
		  WHERE source = 'aular' AND chat_id IS NOT NULL AND chat_id != ''`)
	if err != nil {
		return nil, fmt.Errorf("query hermes sessions: %w", err)
	}
	defer rows.Close()
	out := []SessionRow{}
	for rows.Next() {
		var r SessionRow
		if err := rows.Scan(&r.ID, &r.ChatID, &r.StartedAt, &r.InputTokens, &r.OutputTokens, &r.ToolCalls); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// UsageByConversation aggregates per conversation, subtracting reset-time
// snapshots so counters start from zero at a metrics reset even for sessions
// that keep running across it. A session with no snapshot counts in full.
func (c *Client) UsageByConversation(ctx context.Context, snaps map[string]Snapshot) ([]ConversationUsage, error) {
	rows, err := c.ListSessions(ctx)
	if err != nil {
		return nil, err
	}
	byChat := map[string]*ConversationUsage{}
	order := []string{}
	for _, r := range rows {
		in, out, tools, active := applySnap(r, snaps)
		u := byChat[r.ChatID]
		if u == nil {
			u = &ConversationUsage{ConversationID: r.ChatID}
			byChat[r.ChatID] = u
			order = append(order, r.ChatID)
		}
		u.InputTokens += in
		u.OutputTokens += out
		u.ToolCalls += tools
		if active {
			u.Sessions++
		}
	}
	usage := make([]ConversationUsage, 0, len(order))
	for _, id := range order {
		u := byChat[id]
		if u.InputTokens == 0 && u.OutputTokens == 0 && u.ToolCalls == 0 && u.Sessions == 0 {
			continue
		}
		usage = append(usage, *u)
	}
	return usage, nil
}

// applySnap returns a session's counters net of its snapshot, and whether the
// session counts as active (new since reset, or grown past its snapshot).
func applySnap(r SessionRow, snaps map[string]Snapshot) (in, out, tools int64, active bool) {
	s, ok := snaps[r.ID]
	if !ok {
		return r.InputTokens, r.OutputTokens, r.ToolCalls, true
	}
	in = max(0, r.InputTokens-s.InputTokens)
	out = max(0, r.OutputTokens-s.OutputTokens)
	tools = max(0, r.ToolCalls-s.ToolCalls)
	return in, out, tools, in > 0 || out > 0 || tools > 0
}

// DailyTokens is one day's aular session accounting (for the org dashboard).
type DailyTokens struct {
	Date         string  `json:"date"` // YYYY-MM-DD (UTC)
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	ToolCalls    int64   `json:"tool_calls"`
	Sessions     int     `json:"sessions"`
	CostUSD      float64 `json:"cost_usd"`
}

// UsageDaily aggregates per UTC day (session start day) for the trailing
// window, net of reset snapshots. A continuing session's post-reset delta
// shows on its start day. Same flush caveat: live sessions lag.
// allowed restricts to those conversation ids (the caller's own); nil means
// no restriction.
func (c *Client) UsageDaily(ctx context.Context, days int, snaps map[string]Snapshot, allowed map[string]bool) ([]DailyTokens, error) {
	if days <= 0 || days > 90 {
		days = 14
	}
	rows, err := c.ListSessions(ctx)
	if err != nil {
		return nil, err
	}
	floor := float64(time.Now().AddDate(0, 0, -days).Unix())
	byDay := map[string]*DailyTokens{}
	order := []string{}
	for _, r := range rows {
		if r.StartedAt < floor {
			continue
		}
		if allowed != nil && !allowed[r.ChatID] {
			continue
		}
		in, out, tools, active := applySnap(r, snaps)
		if !active {
			continue
		}
		day := time.Unix(int64(r.StartedAt), 0).UTC().Format("2006-01-02")
		d := byDay[day]
		if d == nil {
			d = &DailyTokens{Date: day}
			byDay[day] = d
			order = append(order, day)
		}
		d.InputTokens += in
		d.OutputTokens += out
		d.ToolCalls += tools
		d.Sessions++
	}
	sort.Strings(order)
	out := make([]DailyTokens, 0, len(order))
	for _, day := range order {
		out = append(out, *byDay[day])
	}
	return out, nil
}

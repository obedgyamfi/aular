package metering

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// Record appends a usage event. Callers use it fire-and-forget; it returns an
// error only so the caller can log it.
func (r *Repository) Record(ctx context.Context, e Event) error {
	if e.Kind == "" || e.UserID == "" {
		return nil
	}
	var agent, conv, msg any
	if e.AgentProfileID != "" {
		agent = e.AgentProfileID
	}
	if e.ConversationID != "" {
		conv = e.ConversationID
	}
	if e.MessageID != "" {
		msg = e.MessageID
	}
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO usage_events (id, user_id, agent_profile_id, conversation_id, message_id, kind, chars)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		uuid.NewString(), e.UserID, agent, conv, msg, e.Kind, e.Chars)
	return err
}

// SetChars corrects the char count for a message's event — used when a streamed
// reply finalizes at its full length (it was first recorded from a partial).
func (r *Repository) SetChars(ctx context.Context, messageID string, chars int) error {
	if messageID == "" {
		return nil
	}
	_, err := r.db.ExecContext(ctx,
		`UPDATE usage_events SET chars = ? WHERE message_id = ?`,
		chars, messageID)
	return err
}

// sqlTime renders a bound timestamp in the exact shape rows store
// ('%Y-%m-%dT%H:%M:%fZ'), so string comparison stays chronological. Binding a
// raw time.Time formats with a space instead of 'T', which inverts the
// comparison against same-day rows.
func sqlTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

// Summary rolls up a user's usage since `since` (window is a human label like
// "30d" echoed back to the UI).
func (r *Repository) Summary(ctx context.Context, userID, window string, since time.Time) (*Summary, error) {
	s := &Summary{Since: since, Window: window, PerAgent: []AgentUsage{}}

	// Totals by kind.
	rows, err := r.db.QueryContext(ctx,
		`SELECT kind, COUNT(*), COALESCE(SUM(chars), 0)
		   FROM usage_events
		  WHERE user_id = ? AND created_at >= ?
		  GROUP BY kind`,
		userID, sqlTime(since))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind string
		var count, chars int
		if err := rows.Scan(&kind, &count, &chars); err != nil {
			return nil, err
		}
		s.Totals.Messages += count
		s.Totals.Chars += chars
		switch kind {
		case KindUserMessage:
			s.Totals.UserMessages += count
		case KindAgentMessage:
			s.Totals.AgentMessages += count
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Per-agent rollup (attributable events only), busiest first. LEFT JOIN so a
	// since-deleted agent still shows (with a null name we fall back on).
	arows, err := r.db.QueryContext(ctx,
		`SELECT ue.agent_profile_id, COALESCE(ap.name, ''), COUNT(*), COALESCE(SUM(ue.chars), 0)
		   FROM usage_events ue
		   LEFT JOIN agent_profiles ap ON ap.id = ue.agent_profile_id
		  WHERE ue.user_id = ? AND ue.created_at >= ? AND ue.agent_profile_id IS NOT NULL
		  GROUP BY ue.agent_profile_id
		  ORDER BY COUNT(*) DESC
		  LIMIT 20`,
		userID, sqlTime(since))
	if err != nil {
		return nil, err
	}
	defer arows.Close()
	for arows.Next() {
		var a AgentUsage
		if err := arows.Scan(&a.AgentProfileID, &a.AgentName, &a.Messages, &a.Chars); err != nil {
			return nil, err
		}
		s.PerAgent = append(s.PerAgent, a)
	}
	return s, arows.Err()
}

// DailyCount is one day's message volume, split by sender kind.
type DailyCount struct {
	Date  string `json:"date"` // YYYY-MM-DD
	User  int    `json:"user"`
	Agent int    `json:"agent"`
}

// Daily buckets the user's metered messages per day for the trailing window.
func (r *Repository) Daily(ctx context.Context, userID string, since time.Time) ([]DailyCount, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT date(created_at), kind, COUNT(*)
		   FROM usage_events
		  WHERE user_id = ? AND created_at >= ?
		  GROUP BY 1, 2 ORDER BY 1`,
		userID, sqlTime(since))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byDate := map[string]*DailyCount{}
	order := []string{}
	for rows.Next() {
		var date, kind string
		var n int
		if err := rows.Scan(&date, &kind, &n); err != nil {
			return nil, err
		}
		d := byDate[date]
		if d == nil {
			d = &DailyCount{Date: date}
			byDate[date] = d
			order = append(order, date)
		}
		switch kind {
		case KindUserMessage:
			d.User += n
		case KindAgentMessage:
			d.Agent += n
		}
	}
	out := make([]DailyCount, 0, len(order))
	for _, date := range order {
		out = append(out, *byDate[date])
	}
	return out, rows.Err()
}

package metering

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func testRepo(t *testing.T) *Repository {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	stmts := []string{
		`CREATE TABLE agent_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
		`CREATE TABLE usage_events (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			agent_profile_id TEXT,
			conversation_id TEXT,
			message_id TEXT,
			kind TEXT NOT NULL,
			chars INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		)`,
		`INSERT INTO agent_profiles (id, name) VALUES ('a1', 'Athena')`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("schema: %v", err)
		}
	}
	return NewRepository(db)
}

func TestRecordAndSummary(t *testing.T) {
	r := testRepo(t)
	ctx := context.Background()

	events := []Event{
		{UserID: "u1", AgentProfileID: "a1", ConversationID: "c1", MessageID: "m1", Kind: KindUserMessage, Chars: 10},
		{UserID: "u1", AgentProfileID: "a1", ConversationID: "c1", MessageID: "m2", Kind: KindAgentMessage, Chars: 20},
		{UserID: "u1", AgentProfileID: "a1", ConversationID: "c1", MessageID: "m3", Kind: KindUserMessage, Chars: 5},
		// Another user's activity must not leak into u1's summary.
		{UserID: "u2", AgentProfileID: "a1", Kind: KindUserMessage, Chars: 999},
	}
	for _, e := range events {
		if err := r.Record(ctx, e); err != nil {
			t.Fatalf("record: %v", err)
		}
	}

	s, err := r.Summary(ctx, "u1", "30d", time.Time{})
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if s.Totals.Messages != 3 || s.Totals.UserMessages != 2 || s.Totals.AgentMessages != 1 {
		t.Fatalf("totals wrong: %+v", s.Totals)
	}
	if s.Totals.Chars != 35 {
		t.Fatalf("chars = %d, want 35 (u2 must be excluded)", s.Totals.Chars)
	}
	if len(s.PerAgent) != 1 || s.PerAgent[0].AgentName != "Athena" || s.PerAgent[0].Messages != 3 {
		t.Fatalf("per-agent wrong: %+v", s.PerAgent)
	}
}

func TestSetCharsCorrectsStreamedReply(t *testing.T) {
	r := testRepo(t)
	ctx := context.Background()

	// Streamed reply: recorded from a short first partial, then corrected.
	if err := r.Record(ctx, Event{UserID: "u1", AgentProfileID: "a1", MessageID: "m9", Kind: KindAgentMessage, Chars: 8}); err != nil {
		t.Fatalf("record: %v", err)
	}
	if err := r.SetChars(ctx, "m9", 512); err != nil {
		t.Fatalf("setchars: %v", err)
	}
	s, err := r.Summary(ctx, "u1", "all", time.Time{})
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if s.Totals.Chars != 512 {
		t.Fatalf("chars = %d, want 512 after correction", s.Totals.Chars)
	}
}

func TestSummaryWindowExcludesOlder(t *testing.T) {
	r := testRepo(t)
	ctx := context.Background()
	if err := r.Record(ctx, Event{UserID: "u1", Kind: KindUserMessage, Chars: 1}); err != nil {
		t.Fatalf("record: %v", err)
	}
	// A window starting in the future excludes the just-recorded event.
	s, err := r.Summary(ctx, "u1", "30d", time.Now().UTC().Add(time.Hour))
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if s.Totals.Messages != 0 {
		t.Fatalf("expected 0 messages in future window, got %d", s.Totals.Messages)
	}
}

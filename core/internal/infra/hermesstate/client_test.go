package hermesstate

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func newFixture(t *testing.T) *Client {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "state.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	stmts := []string{
		`CREATE TABLE sessions (
			id TEXT PRIMARY KEY, source TEXT, chat_id TEXT,
			input_tokens INTEGER, output_tokens INTEGER, tool_call_count INTEGER,
			started_at REAL
		)`,
		`INSERT INTO sessions VALUES
			('s1', 'aular', 'conv-a', 100, 20, 3, 1700000000),
			('s2', 'aular', 'conv-a', 50, 10, 1, 1700000100),
			('s3', 'aular', 'conv-b', 7, 2, 0, 1700000200),
			('s4', 'telegram', 'tg-1', 999, 999, 9, 1700000300),
			('s5', 'aular', '', 5, 5, 5, 1700000400)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("schema: %v", err)
		}
	}
	db.Close()
	return &Client{dbPath: path}
}

func TestUsageByConversation(t *testing.T) {
	c := newFixture(t)
	usage, err := c.UsageByConversation(context.Background(), nil)
	if err != nil {
		t.Fatalf("usage: %v", err)
	}
	if len(usage) != 2 {
		t.Fatalf("got %d conversations, want 2 (telegram + empty chat_id excluded): %+v", len(usage), usage)
	}
	byConv := map[string]ConversationUsage{}
	for _, u := range usage {
		byConv[u.ConversationID] = u
	}
	a := byConv["conv-a"]
	if a.Sessions != 2 || a.InputTokens != 150 || a.OutputTokens != 30 || a.ToolCalls != 4 {
		t.Fatalf("conv-a aggregation wrong: %+v", a)
	}
}

func TestSnapshotDeltas(t *testing.T) {
	// Snapshot conv-a's s1 at (90,15,2): only the growth (10,5,1) counts.
	// Snapshot s2 at its full current value: contributes nothing, not active.
	c := newFixture(t)
	snaps := map[string]Snapshot{
		"s1": {InputTokens: 90, OutputTokens: 15, ToolCalls: 2},
		"s2": {InputTokens: 50, OutputTokens: 10, ToolCalls: 1},
	}
	usage, err := c.UsageByConversation(context.Background(), snaps)
	if err != nil {
		t.Fatalf("usage: %v", err)
	}
	byConv := map[string]ConversationUsage{}
	for _, u := range usage {
		byConv[u.ConversationID] = u
	}
	a := byConv["conv-a"]
	if a.InputTokens != 10 || a.OutputTokens != 5 || a.ToolCalls != 1 || a.Sessions != 1 {
		t.Fatalf("delta wrong for conv-a: %+v", a)
	}
	b := byConv["conv-b"]
	if b.InputTokens != 7 || b.Sessions != 1 {
		t.Fatalf("unsnapshotted session should count in full: %+v", b)
	}
}

func TestMissingDBIsEmptyNotError(t *testing.T) {
	c := &Client{dbPath: filepath.Join(t.TempDir(), "nope.db")}
	usage, err := c.UsageByConversation(context.Background(), nil)
	if err != nil || len(usage) != 0 {
		t.Fatalf("want empty ok, got %v %v", usage, err)
	}
}

package toolcalls

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"

	_ "modernc.org/sqlite"
)

func testRepo(t *testing.T) *Repository {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	// Mirror of migration 00012 without the FK targets (not exercised here).
	if _, err := db.Exec(`CREATE TABLE tool_calls (
		id                 TEXT PRIMARY KEY,
		user_id            TEXT NOT NULL,
		agent_profile_id   TEXT,
		conversation_id    TEXT,
		tool_name          TEXT NOT NULL,
		request_payload    TEXT NOT NULL DEFAULT '{}',
		response_payload   TEXT NOT NULL DEFAULT '{}',
		status             TEXT NOT NULL DEFAULT 'created',
		approval_state     TEXT NOT NULL DEFAULT 'not_required',
		created_at         DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
		updated_at         DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
	)`); err != nil {
		t.Fatalf("schema: %v", err)
	}
	return NewRepository(db)
}

func create(t *testing.T, r *Repository, conv, tool string) *ToolCall {
	t.Helper()
	tc, err := r.Create(context.Background(), &ToolCall{
		UserID:         "u1",
		AgentProfileID: "a1",
		ConversationID: conv,
		ToolName:       tool,
		RequestPayload: json.RawMessage(`{"preview":"x","index":0}`),
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	return tc
}

func TestCreateDefaultsToRunning(t *testing.T) {
	r := testRepo(t)
	tc := create(t, r, "c1", "web_search")
	if tc.Status != StatusRunning {
		t.Fatalf("status = %q, want %q", tc.Status, StatusRunning)
	}
	if tc.ApprovalState != "not_required" {
		t.Fatalf("approval_state = %q", tc.ApprovalState)
	}
	if tc.CreatedAt.IsZero() || tc.UpdatedAt.IsZero() {
		t.Fatalf("timestamps not scanned: %+v", tc)
	}
}

func TestSettleRunningOnlyTouchesConversation(t *testing.T) {
	r := testRepo(t)
	ctx := context.Background()
	create(t, r, "c1", "web_search")
	create(t, r, "c1", "memory_store")
	other := create(t, r, "c2", "cronjob_create")

	settled, err := r.SettleRunning(ctx, "c1")
	if err != nil {
		t.Fatalf("settle: %v", err)
	}
	if len(settled) != 2 {
		t.Fatalf("settled %d calls, want 2", len(settled))
	}
	for _, tc := range settled {
		if tc.Status != StatusSettled {
			t.Fatalf("settled call has status %q", tc.Status)
		}
	}

	// The other conversation stays running; a second settle is a no-op.
	rest, err := r.ListByConversation(ctx, "c2", 10)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rest) != 1 || rest[0].ID != other.ID || rest[0].Status != StatusRunning {
		t.Fatalf("c2 affected by c1 settle: %+v", rest)
	}
	again, err := r.SettleRunning(ctx, "c1")
	if err != nil {
		t.Fatalf("re-settle: %v", err)
	}
	if len(again) != 0 {
		t.Fatalf("re-settle touched %d calls, want 0", len(again))
	}
}

func TestListByConversationNewestFirst(t *testing.T) {
	r := testRepo(t)
	create(t, r, "c1", "first")
	last := create(t, r, "c1", "second")

	list, err := r.ListByConversation(context.Background(), "c1", 10)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 2 || list[0].ID != last.ID {
		t.Fatalf("order wrong: %+v", list)
	}
	var req struct {
		Preview string `json:"preview"`
	}
	if err := json.Unmarshal(list[0].RequestPayload, &req); err != nil || req.Preview != "x" {
		t.Fatalf("request_payload not round-tripped: %s (%v)", list[0].RequestPayload, err)
	}
}

// Package hermesmemory reads the Hermes memory graph (the "journey" — learned
// skills plus remembered user facts/preferences) by shelling out to
// `hermes memory-graph --json`. Memory lives in the Hermes runtime, not in
// core-api, so this is a read-only bridge that lets AULAR surface "what your
// agents remember" without owning the store.
package hermesmemory

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Client struct {
	bin string
	// home is the Hermes profile whose memories to read ("" = ~/.hermes).
	home string
}

func NewClient() *Client {
	bin := os.Getenv("HERMES_BIN")
	if bin == "" {
		bin = "hermes"
	}
	return &Client{bin: bin}
}

// ForHome returns a client reading one user's Hermes profile.
func (c *Client) ForHome(home string) *Client {
	return &Client{bin: c.bin, home: home}
}

// Node is a memory-graph entry surfaced to the UI. Kind is "memory" (a
// remembered fact/preference, its text in Label) or "skill" (a learned
// capability).
type Node struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Kind      string `json:"kind"`
	Source    string `json:"source,omitempty"`
	Category  string `json:"category,omitempty"`
	UseCount  int    `json:"use_count"`
	Timestamp int64  `json:"timestamp"`
	Pinned    bool   `json:"pinned"`
}

// Graph is the grouped view returned to the UI.
type Graph struct {
	Memories []Node `json:"memories"`
	Skills   []Node `json:"skills"`
}

// rawNode mirrors the camelCase shape Hermes emits.
type rawNode struct {
	ID           string `json:"id"`
	Label        string `json:"label"`
	Kind         string `json:"kind"`
	MemorySource string `json:"memorySource"`
	Category     string `json:"category"`
	UseCount     int    `json:"useCount"`
	Timestamp    int64  `json:"timestamp"`
	State        string `json:"state"`
	Pinned       bool   `json:"pinned"`
}

// Read returns the active memory graph, memories and skills each newest-first.
func (c *Client) Read(ctx context.Context) (*Graph, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, c.bin, "memory-graph", "--json").Output()
	if err != nil {
		return nil, fmt.Errorf("hermesmemory: %s memory-graph --json failed: %w", c.bin, err)
	}

	var payload struct {
		Nodes []rawNode `json:"nodes"`
	}
	if err := json.Unmarshal(out, &payload); err != nil {
		return nil, fmt.Errorf("hermesmemory: parse graph: %w", err)
	}

	fullMemories := readUserMemories(c.home)
	g := &Graph{Memories: []Node{}, Skills: []Node{}}
	for _, n := range payload.Nodes {
		// Skip archived/deleted nodes — only show what's live.
		if n.State != "" && n.State != "active" {
			continue
		}
		node := Node{
			ID:        n.ID,
			Label:     strings.TrimSpace(n.Label),
			Kind:      n.Kind,
			Source:    n.MemorySource,
			Category:  n.Category,
			UseCount:  n.UseCount,
			Timestamp: n.Timestamp,
			Pinned:    n.Pinned,
		}
		if node.Label == "" {
			continue
		}
		switch n.Kind {
		case "memory":
			// The graph truncates memory labels (…); restore the full text from
			// the built-in USER.md store when we can match it.
			node.Label = expandMemory(node.Label, fullMemories)
			g.Memories = append(g.Memories, node)
		case "skill":
			g.Skills = append(g.Skills, node)
		}
	}
	sort.SliceStable(g.Memories, func(i, j int) bool { return g.Memories[i].Timestamp > g.Memories[j].Timestamp })
	sort.SliceStable(g.Skills, func(i, j int) bool { return g.Skills[i].Timestamp > g.Skills[j].Timestamp })
	return g, nil
}

// readUserMemories returns the full-text entries from Hermes's built-in
// USER.md (§-separated). Best-effort — a missing file yields nil.
func readUserMemories(home string) []string {
	if home == "" {
		home = os.Getenv("HERMES_HOME")
	}
	if home == "" {
		h, err := os.UserHomeDir()
		if err != nil {
			return nil
		}
		home = filepath.Join(h, ".hermes")
	}
	data, err := os.ReadFile(filepath.Join(home, "memories", "USER.md"))
	if err != nil {
		return nil
	}
	var out []string
	for _, block := range strings.Split(string(data), "§") {
		if b := strings.TrimSpace(block); b != "" {
			out = append(out, b)
		}
	}
	return out
}

// expandMemory swaps a truncated graph label (…) for its full USER.md entry
// when one starts with the visible prefix. Non-truncated labels pass through.
func expandMemory(label string, full []string) string {
	if !strings.HasSuffix(label, "…") {
		return label
	}
	prefix := strings.TrimSpace(strings.TrimSuffix(label, "…"))
	for _, entry := range full {
		if strings.HasPrefix(entry, prefix) {
			return entry
		}
	}
	return label
}

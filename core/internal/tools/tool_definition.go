package tools

import "time"

// ToolDefinition is a catalog entry describing a tool an AgentProfile can be
// granted — the registry the "Add Agent" screen renders as a checklist.
type ToolDefinition struct {
	ID          string    `db:"id" json:"id"`
	Name        string    `db:"name" json:"name"`
	Description string    `db:"description" json:"description"`
	Category    string    `db:"category" json:"category"`
	RiskLevel   string    `db:"risk_level" json:"risk_level"` // "low" | "medium" | "high"
	CreatedAt   time.Time `db:"created_at" json:"created_at"`
}

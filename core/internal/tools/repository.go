package tools

import (
	"context"
	"database/sql"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) ListDefinitions(ctx context.Context) ([]*ToolDefinition, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, name, description, category, risk_level, created_at FROM tool_definitions ORDER BY category, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var defs []*ToolDefinition
	for rows.Next() {
		var d ToolDefinition
		if err := rows.Scan(&d.ID, &d.Name, &d.Description, &d.Category, &d.RiskLevel, &d.CreatedAt); err != nil {
			return nil, err
		}
		defs = append(defs, &d)
	}
	return defs, rows.Err()
}

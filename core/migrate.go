package core

// Embedded schema. A desktop app has to migrate its own database on launch —
// there is no operator to run a CLI, and a fresh install starts with no file
// at all.

import "embed"

//go:embed migrations/*.sql
var Migrations embed.FS

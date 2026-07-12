// Package hermespaths maps a user's runtime row to the filesystem layout of
// its Hermes profile. Everything AULAR reads or writes in a Hermes home
// (state.db, cron store, memories, config.yaml, .env) resolves through here
// so no client ever touches a hardcoded ~/.hermes again.
package hermespaths

import (
	"os"
	"path/filepath"
)

// DefaultProfile is the sentinel profile_name meaning "the root ~/.hermes
// runtime" (the original single-user install, adopted by userctl).
const DefaultProfile = "__default__"

type Paths struct {
	Home        string
	StateDB     string
	CronJobs    string
	MemoriesDir string
	ConfigYAML  string
	EnvFile     string
}

// Root is the ~/.hermes root (HERMES_ROOT override for tests).
func Root() string {
	if v := os.Getenv("HERMES_ROOT"); v != "" {
		return v
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ".hermes"
	}
	return filepath.Join(home, ".hermes")
}

// ProfileDir is where a named profile lives (Hermes convention:
// <root>/profiles/<name>; the default profile is the root itself).
func ProfileDir(profileName string) string {
	if profileName == DefaultProfile || profileName == "" {
		return Root()
	}
	return filepath.Join(Root(), "profiles", profileName)
}

// For resolves every path AULAR cares about inside a profile.
func For(profileName string) Paths {
	dir := ProfileDir(profileName)
	return Paths{
		Home:        dir,
		StateDB:     filepath.Join(dir, "state.db"),
		CronJobs:    filepath.Join(dir, "cron", "jobs.json"),
		MemoriesDir: filepath.Join(dir, "memories"),
		ConfigYAML:  filepath.Join(dir, "config.yaml"),
		EnvFile:     filepath.Join(dir, ".env"),
	}
}

package modelconfig

import (
	"os"
	"path/filepath"
	"testing"
)

// A fresh profile: no config.yaml at all. The first model write must create
// the file, and the roundtrip must read it back with the key flagged.
func TestFreshProfileWriteRoundtrip(t *testing.T) {
	home := t.TempDir()
	if _, err := WriteTo(home, Config{Model: "claude-sonnet-5", Provider: "anthropic"}, "sk-test"); err != nil {
		t.Fatalf("write on fresh profile: %v", err)
	}
	cfg, err := ReadFrom(home)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if cfg.Model != "claude-sonnet-5" || cfg.Provider != "anthropic" {
		t.Fatalf("roundtrip lost the model: %+v", cfg)
	}
	if !cfg.KeySet {
		t.Fatalf("key written but KeySet=false: %+v", cfg)
	}
}

// A config that exists but has no model block (the app's bundled base
// config) must gain one, not be refused.
func TestConfigWithoutModelBlockGainsOne(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte("plugins:\n  enabled:\n    - aular-platform\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := WriteTo(home, Config{Model: "llama3", Provider: "ollama", BaseURL: "http://localhost:11434/v1"}, ""); err != nil {
		t.Fatalf("write on blockless config: %v", err)
	}
	cfg, err := ReadFrom(home)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if cfg.Model != "llama3" || cfg.Provider != "ollama" {
		t.Fatalf("roundtrip lost the model: %+v", cfg)
	}
}

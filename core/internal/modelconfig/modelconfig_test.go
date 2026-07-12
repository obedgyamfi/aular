package modelconfig

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const sampleConfig = `model:
  default: gpt-5.5
  provider: openai-codex
  base_url: https://opencode.ai/zen/v1
  context_length: 272000
  api_mode: chat_completions
agent:
  max_turns: 150
display:
  streaming: true
custom_providers:
  - name: ollama_qwen3
    base_url: http://localhost:11434/v1
`

func TestReadWritePreservesRest(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HERMES_HOME", dir)
	cfgPath := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(cfgPath, []byte(sampleConfig), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := Read()
	if err != nil {
		t.Fatal(err)
	}
	if got.Model != "gpt-5.5" || got.Provider != "openai-codex" || got.ContextLength != 272000 {
		t.Fatalf("read: %+v", got)
	}

	// Switch to a local Ollama model.
	if _, err := Write(Config{
		Model: "qwen3:8b", Provider: "ollama", BaseURL: "http://localhost:11434/v1",
		APIMode: "chat_completions", ContextLength: 32000,
	}, ""); err != nil {
		t.Fatal(err)
	}

	after, _ := os.ReadFile(cfgPath)
	s := string(after)
	// Model block updated…
	if !strings.Contains(s, "default: qwen3:8b") || !strings.Contains(s, "provider: ollama") {
		t.Fatalf("model block not updated:\n%s", s)
	}
	// …and everything else preserved exactly.
	for _, must := range []string{
		"agent:", "max_turns: 150", "display:", "streaming: true",
		"custom_providers:", "name: ollama_qwen3", "http://localhost:11434/v1",
	} {
		if !strings.Contains(s, must) {
			t.Fatalf("clobbered surrounding config, missing %q:\n%s", must, s)
		}
	}
	// The old gpt-5.5 line must be gone (fully replaced, not appended).
	if strings.Contains(s, "default: gpt-5.5") {
		t.Fatalf("old model line still present:\n%s", s)
	}

	// Re-read reflects the new values.
	re, _ := Read()
	if re.Model != "qwen3:8b" || re.Provider != "ollama" {
		t.Fatalf("reread: %+v", re)
	}
}

func TestUpsertEnv(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HERMES_HOME", dir)
	envFile := filepath.Join(dir, ".env")
	os.WriteFile(envFile, []byte("EXISTING=1\nOPENAI_API_KEY=old\n"), 0o600)

	if err := upsertEnv("OPENAI_API_KEY", "sk-new"); err != nil {
		t.Fatal(err)
	}
	if err := upsertEnv("ANTHROPIC_API_KEY", "sk-ant"); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(envFile)
	s := string(b)
	if !strings.Contains(s, "OPENAI_API_KEY=sk-new") || strings.Contains(s, "OPENAI_API_KEY=old") {
		t.Fatalf("openai key not replaced:\n%s", s)
	}
	if !strings.Contains(s, "ANTHROPIC_API_KEY=sk-ant") || !strings.Contains(s, "EXISTING=1") {
		t.Fatalf("append/preserve failed:\n%s", s)
	}
}

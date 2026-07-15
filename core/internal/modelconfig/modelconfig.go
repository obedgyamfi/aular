// Package modelconfig is a thin, surgical editor over the Hermes gateway's
// model configuration so AULAR users can bring their own provider/model/key
// (BYOK) without hand-editing YAML. It edits ONLY the `model:` block of
// ~/.hermes/config.yaml (never reformatting or touching the rest of the
// user-owned file) and upserts the API key into ~/.hermes/.env, where Hermes
// reads secrets. Changes take effect on the next gateway restart.
package modelconfig

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config is the model settings surfaced to the UI. The API key itself is never
// returned — only whether one is set for the resolved provider.
type Config struct {
	Model         string `json:"model"`
	Provider      string `json:"provider"`
	BaseURL       string `json:"base_url"`
	APIMode       string `json:"api_mode"`
	ContextLength int    `json:"context_length"`
	KeyEnvVar     string `json:"key_env_var"`
	KeySet        bool   `json:"key_set"`
}

// homeOverride, when set by ReadFrom/WriteTo, targets one user's Hermes
// profile instead of the process-wide ~/.hermes. It is threaded explicitly
// (not global state) — see ReadFrom/WriteTo.
type homeOverride string

// hermesHome resolves ~/.hermes (override with HERMES_HOME).
func hermesHome() (string, error) {
	if h := os.Getenv("HERMES_HOME"); h != "" {
		return h, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".hermes"), nil
}

func configPathIn(home homeOverride) (string, error) {
	if home != "" {
		return filepath.Join(string(home), "config.yaml"), nil
	}
	h, err := hermesHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, "config.yaml"), nil
}

func envPathIn(home homeOverride) (string, error) {
	if home != "" {
		return filepath.Join(string(home), ".env"), nil
	}
	h, err := hermesHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, ".env"), nil
}

func configPath() (string, error) { return configPathIn("") }
func envPath() (string, error)    { return envPathIn("") }

// KeyEnvForProvider maps a provider to the env var Hermes reads its key from.
// Empty means no key needed (e.g. a local Ollama endpoint).
func KeyEnvForProvider(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "openai", "openai-codex":
		return "OPENAI_API_KEY"
	case "anthropic":
		return "ANTHROPIC_API_KEY"
	case "openrouter":
		return "OPENROUTER_API_KEY"
	case "gemini", "google":
		return "GEMINI_API_KEY"
	case "groq":
		return "GROQ_API_KEY"
	default:
		return ""
	}
}

// Read parses the default home's model block; ReadFrom targets a specific
// Hermes profile (one user's runtime).
func Read() (*Config, error) { return ReadFrom("") }

// ReadFrom parses a profile's model block and reports whether its provider's
// key is present in that profile's .env. home == "" means the default home.
func ReadFrom(home string) (*Config, error) {
	path, err := configPathIn(homeOverride(home))
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		// First run on a machine with no Hermes config yet — not an error,
		// just nothing connected. The UI's answer is its onboarding step.
		return &Config{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("modelconfig: read config: %w", err)
	}
	block, _, _, err := findModelBlock(strings.Split(string(data), "\n"))
	if err != nil {
		return nil, err
	}
	cfg := &Config{}
	for k, v := range block {
		switch k {
		case "default":
			cfg.Model = v
		case "provider":
			cfg.Provider = v
		case "base_url":
			cfg.BaseURL = v
		case "api_mode":
			cfg.APIMode = v
		case "context_length":
			cfg.ContextLength, _ = strconv.Atoi(v)
		}
	}
	cfg.KeyEnvVar = KeyEnvForProvider(cfg.Provider)
	if cfg.KeyEnvVar != "" {
		cfg.KeySet = envKeyPresentIn(homeOverride(home), cfg.KeyEnvVar)
	}
	return cfg, nil
}

// Write surgically replaces the model: block with cfg and, when apiKey is
// non-empty, upserts cfg.KeyEnvVar into .env. It preserves every other line of
// config.yaml exactly. Returns reloadRequired (always true — the gateway reads
// these at startup).
func Write(cfg Config, apiKey string) (bool, error) { return WriteTo("", cfg, apiKey) }

// WriteTo is Write against one user's Hermes profile (home == "" = default).
func WriteTo(home string, cfg Config, apiKey string) (bool, error) {
	if strings.TrimSpace(cfg.Model) == "" || strings.TrimSpace(cfg.Provider) == "" {
		return false, fmt.Errorf("modelconfig: model and provider are required")
	}
	path, err := configPathIn(homeOverride(home))
	if err != nil {
		return false, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false, fmt.Errorf("modelconfig: read config: %w", err)
	}
	lines := strings.Split(string(data), "\n")
	_, start, end, err := findModelBlock(lines)
	if err != nil {
		return false, err
	}

	// Build the replacement child lines (2-space indent), keeping only fields
	// that are set so we never write empty/garbage values.
	var child []string
	child = append(child, "  default: "+yamlScalar(cfg.Model))
	child = append(child, "  provider: "+yamlScalar(cfg.Provider))
	if cfg.BaseURL != "" {
		child = append(child, "  base_url: "+yamlScalar(cfg.BaseURL))
	}
	if cfg.ContextLength > 0 {
		child = append(child, "  context_length: "+strconv.Itoa(cfg.ContextLength))
	}
	if cfg.APIMode != "" {
		child = append(child, "  api_mode: "+yamlScalar(cfg.APIMode))
	}

	out := make([]string, 0, len(lines))
	out = append(out, lines[:start+1]...) // through the `model:` line
	out = append(out, child...)
	out = append(out, lines[end:]...) // the rest of the file, untouched
	if err := writeFileAtomic(path, strings.Join(out, "\n")); err != nil {
		return false, err
	}

	if apiKey != "" && cfg.KeyEnvVar != "" {
		if err := upsertEnvIn(homeOverride(home), cfg.KeyEnvVar, apiKey); err != nil {
			return false, err
		}
	}
	return true, nil
}

// findModelBlock returns the model: block's key/value children plus the line
// index of the `model:` line (start) and the first line after the block (end).
func findModelBlock(lines []string) (block map[string]string, start, end int, err error) {
	start = -1
	for i, ln := range lines {
		if ln == "model:" || strings.HasPrefix(ln, "model:") && strings.TrimSpace(strings.TrimPrefix(ln, "model:")) == "" {
			start = i
			break
		}
	}
	if start == -1 {
		return nil, 0, 0, fmt.Errorf("modelconfig: no `model:` block in config.yaml")
	}
	block = map[string]string{}
	end = len(lines)
	for i := start + 1; i < len(lines); i++ {
		ln := lines[i]
		if strings.TrimSpace(ln) == "" {
			continue
		}
		if !strings.HasPrefix(ln, " ") && !strings.HasPrefix(ln, "\t") {
			end = i // first top-level line after the block
			break
		}
		kv := strings.SplitN(strings.TrimSpace(ln), ":", 2)
		if len(kv) == 2 {
			block[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
		}
	}
	return block, start, end, nil
}

// yamlScalar quotes a value only when YAML actually requires it. A bare colon
// (as in qwen3:8b or https://…) is fine — only ": " starts a mapping — so we
// don't over-quote model names or URLs.
func yamlScalar(s string) string {
	if s == "" {
		return `""`
	}
	needsQuote := strings.Contains(s, ": ") ||
		strings.HasSuffix(s, ":") ||
		strings.Contains(s, " #") ||
		strings.ContainsAny(s, "\"'#{}[]&*!|>%@`\n\t") ||
		s != strings.TrimSpace(s) ||
		strings.ContainsAny(s[:1], "-?:,")
	if needsQuote {
		return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
	}
	return s
}

func envKeyPresent(key string) bool { return envKeyPresentIn("", key) }

func envKeyPresentIn(home homeOverride, key string) bool {
	path, err := envPathIn(home)
	if err != nil {
		return false
	}
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	prefix := key + "="
	for sc.Scan() {
		ln := strings.TrimSpace(sc.Text())
		if strings.HasPrefix(ln, prefix) && strings.TrimSpace(strings.TrimPrefix(ln, prefix)) != "" {
			return true
		}
	}
	return false
}

// upsertEnv sets key=value in .env, replacing an existing line or appending.
func upsertEnv(key, value string) error { return upsertEnvIn("", key, value) }

func upsertEnvIn(home homeOverride, key, value string) error {
	path, err := envPathIn(home)
	if err != nil {
		return err
	}
	var lines []string
	if data, err := os.ReadFile(path); err == nil {
		lines = strings.Split(string(data), "\n")
	}
	newLine := key + "=" + value
	found := false
	for i, ln := range lines {
		if strings.HasPrefix(strings.TrimSpace(ln), key+"=") {
			lines[i] = newLine
			found = true
			break
		}
	}
	if !found {
		lines = append(lines, newLine)
	}
	return writeFileAtomic(path, strings.Join(lines, "\n"))
}

// writeFileAtomic writes via a temp file + rename so a crash can't truncate the
// user's config.
func writeFileAtomic(path, content string) error {
	tmp := path + ".aular.tmp"
	if err := os.WriteFile(tmp, []byte(content), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

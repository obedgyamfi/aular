package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/obedgyamfi/aular/core/internal/infra/hermesboot"
	"github.com/obedgyamfi/aular/core/internal/infra/hermespaths"
)

// Model connect — Hermes' own sign-in machinery, bubbled up to the app.
//
// Three paths, in the order a real person should meet them:
//  1. Hermes already has Codex credentials → nothing to do.
//  2. The Codex CLI has them (~/.codex/auth.json) → import, no login at all.
//  3. Neither → run the REAL device-code flow (the same hermes_cli.auth
//     function `hermes model` calls) and stream its URL + code to the UI.
//
// Every path runs through Hermes' own venv python, unbuffered (a block-buffered
// pipe hides the user code until the process exits), with HERMES_HOME pinned
// to the caller's profile — credentials land in the signing user's runtime,
// never a shared one.

type connectSession struct {
	mu        sync.Mutex
	Stage     string `json:"stage"` // starting | code | done | error
	VerifyURL string `json:"verify_url,omitempty"`
	UserCode  string `json:"user_code,omitempty"`
	Error     string `json:"error,omitempty"`
	cmd       *exec.Cmd
}

// One live device-code flow per user (a second start would burn another code
// and earn a 429 from OpenAI).
var codexConnect struct {
	mu       sync.Mutex
	sessions map[string]*connectSession
}

// hermesAgentDir is the shared Hermes code install; profiles clone state, not
// the venv. When HERMES_ROOT points at an app-owned profile (the desktop
// sidecar), the install itself still lives in the user's ~/.hermes.
func hermesAgentDir() string {
	dir := filepath.Join(hermespaths.Root(), "hermes-agent")
	if _, err := os.Stat(dir); err == nil {
		return dir
	}
	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Join(home, ".hermes", "hermes-agent")
	}
	return dir
}

// hermesPython finds an interpreter that can import hermes_cli: a source
// install's venv, or the app-managed runtime hermesboot installed (where
// hermes_cli is a site-package). "" means no runtime on this machine.
func (s *Server) hermesPython() string {
	if rt := hermesboot.Detect(s.cfg.DataDir); rt != nil && rt.Python != "" {
		return rt.Python
	}
	// hermes on PATH without a known venv — the source layouts are the last
	// honest guess.
	p := filepath.Join(hermesAgentDir(), "venv", "bin", "python3")
	if runtime.GOOS == "windows" {
		p = filepath.Join(hermesAgentDir(), "venv", "Scripts", "python.exe")
	}
	if _, err := os.Stat(p); err == nil {
		return p
	}
	return ""
}

// hermesMissing reports (in words a person can act on) when the Hermes
// runtime isn't installed — every connect path needs it, and "no output"
// helps no one.
func (s *Server) hermesMissing() string {
	if s.hermesPython() == "" {
		return "the Hermes agent runtime isn't installed on this machine yet"
	}
	return ""
}

// hermesPy runs a snippet inside Hermes' venv with hermes_cli importable,
// scoped to the caller's own Hermes home.
func (s *Server) hermesPy(ctx context.Context, script string) *exec.Cmd {
	// The sys.path insert serves source installs, where hermes_cli lives
	// beside the venv; in a managed install it's a site-package and the
	// insert is inert (the dir doesn't exist).
	full := "import sys\nsys.path.insert(0, " + quoted(hermesAgentDir()) + ")\n" + script
	cmd := exec.Command(s.hermesPython(), "-u", "-c", full)
	cmd.Env = append(os.Environ(), "HERMES_HOME="+s.userHome(ctx))
	return cmd
}

func quoted(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

var ansiRe = regexp.MustCompile("\x1b\\[[0-9;]*m")

// ── status: what does this machine already have? ─────────────────────────────

type codexStatus struct {
	LoggedIn  bool   `json:"logged_in"`  // Hermes already holds usable creds
	CLITokens bool   `json:"cli_tokens"` // ~/.codex/auth.json can be imported
	AuthMode  string `json:"auth_mode,omitempty"`
	Source    string `json:"source,omitempty"`
	Error     string `json:"error,omitempty"`
}

// GET /api/v1/settings/model/connect/codex/status
func (s *Server) handleCodexStatus(w http.ResponseWriter, r *http.Request) {
	if msg := s.hermesMissing(); msg != "" {
		writeJSON(w, http.StatusOK, codexStatus{Error: msg})
		return
	}
	out, err := s.hermesPy(r.Context(), `
import json
from hermes_cli import auth
status = {}
try:
    st = auth.get_codex_auth_status()
    status["logged_in"] = bool(st.get("logged_in"))
    status["auth_mode"] = st.get("auth_mode") or ""
    status["source"] = st.get("source") or ""
except Exception as e:
    status["logged_in"] = False
    status["error"] = str(e)[:200]
try:
    status["cli_tokens"] = bool(auth._import_codex_cli_tokens())
except Exception:
    status["cli_tokens"] = False
print("HERMES_JSON " + json.dumps(status), flush=True)
`).CombinedOutput()
	if err != nil {
		writeJSON(w, http.StatusOK, codexStatus{Error: lastLine(string(out))})
		return
	}
	var st codexStatus
	if payload := jsonLine(string(out)); payload != "" {
		_ = json.Unmarshal([]byte(payload), &st)
	}
	writeJSON(w, http.StatusOK, st)
}

// POST /api/v1/settings/model/connect/codex/import — connect with credentials
// this machine already has: Hermes' own auth store first, then the Codex CLI's
// (~/.codex/auth.json, copied so a CLI refresh can't break us). No sign-in, no
// device code, no rate limit.
func (s *Server) handleCodexImport(w http.ResponseWriter, r *http.Request) {
	if msg := s.hermesMissing(); msg != "" {
		writeError(w, http.StatusBadGateway, msg)
		return
	}
	out, err := s.hermesPy(r.Context(), `
from hermes_cli import auth
st = {}
try:
    st = auth.get_codex_auth_status()
except Exception:
    pass
if not st.get("logged_in"):
    tokens = auth._import_codex_cli_tokens()
    if not tokens:
        raise SystemExit("no usable Codex credentials on this machine — sign in instead")
    auth._save_codex_tokens(tokens)
auth._update_config_for_provider("openai-codex", auth.DEFAULT_CODEX_BASE_URL)
print("HERMES_CONNECT_OK", flush=True)
`).CombinedOutput()
	if err != nil || !strings.Contains(string(out), "HERMES_CONNECT_OK") {
		writeError(w, http.StatusBadGateway, "import failed: "+lastLine(string(out)))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"stage": "done"})
}

// ── the device-code flow (fallback) ──────────────────────────────────────────

// POST /api/v1/settings/model/connect/codex — start the flow. Idempotent: a
// live flow with a code is returned as-is instead of burning another code (a
// second request would earn a 429 from OpenAI).
func (s *Server) handleCodexConnectStart(w http.ResponseWriter, r *http.Request) {
	if msg := s.hermesMissing(); msg != "" {
		writeError(w, http.StatusBadGateway, msg)
		return
	}
	userID := s.ctxUserID(r.Context())
	codexConnect.mu.Lock()
	defer codexConnect.mu.Unlock()
	if codexConnect.sessions == nil {
		codexConnect.sessions = map[string]*connectSession{}
	}

	if live := codexConnect.sessions[userID]; live != nil {
		snap := snapshotConnect(live)
		if snap["stage"] == "code" || snap["stage"] == "starting" {
			writeJSON(w, http.StatusOK, snap)
			return
		}
	}

	sess := &connectSession{Stage: "starting"}
	cmd := s.hermesPy(r.Context(), `
from hermes_cli import auth
creds = auth._codex_device_code_login()
try:
    auth._save_codex_tokens(creds)
except Exception:
    pass
auth._update_config_for_provider("openai-codex", creds.get("base_url", auth.DEFAULT_CODEX_BASE_URL))
print("HERMES_CONNECT_OK", flush=True)
`)
	stdout, err := cmd.StdoutPipe()
	cmd.Stderr = cmd.Stdout
	if err == nil {
		err = cmd.Start()
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "start sign-in: "+err.Error())
		return
	}
	sess.cmd = cmd
	codexConnect.sessions[userID] = sess

	go func() {
		scan := bufio.NewScanner(stdout)
		urlRe := regexp.MustCompile(`https://\S+`)
		expectCode := false
		var tail []string
		for scan.Scan() {
			line := strings.TrimSpace(ansiRe.ReplaceAllString(scan.Text(), ""))
			if line != "" {
				tail = append(tail, line)
				if len(tail) > 6 {
					tail = tail[1:]
				}
			}
			sess.mu.Lock()
			switch {
			case strings.Contains(line, "HERMES_CONNECT_OK"):
				sess.Stage = "done"
			case strings.Contains(line, "Enter this code"):
				expectCode = true
			case expectCode && line != "":
				sess.UserCode = line
				expectCode = false
				if sess.VerifyURL != "" {
					sess.Stage = "code"
				}
			case urlRe.MatchString(line) && sess.VerifyURL == "":
				sess.VerifyURL = urlRe.FindString(line)
				if sess.UserCode != "" {
					sess.Stage = "code"
				}
			}
			sess.mu.Unlock()
		}
		waitErr := cmd.Wait()
		sess.mu.Lock()
		if sess.Stage != "done" {
			sess.Stage = "error"
			// The process's own words beat "exit status 1" every time.
			sess.Error = explainCodexFailure(tail, waitErr)
		}
		sess.mu.Unlock()
	}()

	// A beat, so the first response usually already carries the code.
	time.Sleep(1500 * time.Millisecond)
	writeJSON(w, http.StatusOK, snapshotConnect(sess))
}

// GET /api/v1/settings/model/connect/codex — the flow's state.
func (s *Server) handleCodexConnectStatus(w http.ResponseWriter, r *http.Request) {
	codexConnect.mu.Lock()
	sess := codexConnect.sessions[s.ctxUserID(r.Context())]
	codexConnect.mu.Unlock()
	if sess == nil {
		writeJSON(w, http.StatusOK, map[string]string{"stage": "idle"})
		return
	}
	writeJSON(w, http.StatusOK, snapshotConnect(sess))
}

func explainCodexFailure(tail []string, waitErr error) string {
	joined := strings.Join(tail, " ")
	if strings.Contains(joined, "429") || strings.Contains(strings.ToLower(joined), "rate-limit") {
		return "OpenAI is rate-limiting sign-in requests right now. Wait a few minutes and try again — or import the credentials the Codex CLI already has on this machine."
	}
	for i := len(tail) - 1; i >= 0; i-- {
		l := tail[i]
		if l != "" && !strings.HasPrefix(l, "Waiting for sign-in") {
			return l
		}
	}
	if waitErr != nil {
		return "sign-in did not complete: " + waitErr.Error()
	}
	return "sign-in did not complete"
}

func snapshotConnect(sess *connectSession) map[string]string {
	sess.mu.Lock()
	defer sess.mu.Unlock()
	out := map[string]string{"stage": sess.Stage}
	if sess.VerifyURL != "" {
		out["verify_url"] = sess.VerifyURL
	}
	if sess.UserCode != "" {
		out["user_code"] = sess.UserCode
	}
	if sess.Error != "" {
		out["error"] = sess.Error
	}
	return out
}

// GET /api/v1/settings/model/connect/codex/models — what this subscription runs.
func (s *Server) handleCodexModels(w http.ResponseWriter, r *http.Request) {
	out, err := s.hermesPy(r.Context(), `
import json
from hermes_cli.codex_models import get_codex_model_ids
token = None
try:
    from hermes_cli.auth import resolve_codex_runtime_credentials
    token = resolve_codex_runtime_credentials().get("api_key")
except Exception:
    pass
print("HERMES_JSON " + json.dumps(get_codex_model_ids(access_token=token)), flush=True)
`).CombinedOutput()
	payload := jsonLine(string(out))
	if err != nil || payload == "" {
		writeError(w, http.StatusBadGateway, "codex models: "+lastLine(string(out)))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(payload))
}

// jsonLine pulls the payload off our sentinel line, ignoring Hermes' chatter.
func jsonLine(out string) string {
	for _, l := range strings.Split(out, "\n") {
		if s := strings.TrimSpace(ansiRe.ReplaceAllString(l, "")); strings.HasPrefix(s, "HERMES_JSON ") {
			return strings.TrimPrefix(s, "HERMES_JSON ")
		}
	}
	return ""
}

func lastLine(out string) string {
	lines := strings.Split(strings.TrimSpace(out), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if s := strings.TrimSpace(ansiRe.ReplaceAllString(lines[i], "")); s != "" {
			return s
		}
	}
	return "no output"
}

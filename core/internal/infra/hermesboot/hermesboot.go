// Package hermesboot finds — or installs — the Hermes agent runtime.
//
// A shipped AULAR has no right to assume Python exists, let alone Hermes.
// The escape hatch is uv (astral.sh, MIT/Apache): a single static binary
// that can install a managed Python and a pinned hermes-agent from PyPI
// into the app's own data directory. The user double-clicks an installer
// and gets a working organization; nobody is told to open a terminal.
//
// Detection prefers real installs over the managed one, so a developer's
// ~/.hermes (or an explicit HERMES_ROOT) always wins and this package
// becomes a no-op on machines that already run Hermes.
package hermesboot

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// The pins. Bump deliberately, test, commit — never float.
const (
	UVVersion     = "0.11.28"
	HermesVersion = "0.18.2"
	PythonSeries  = "3.12"
)

// Runtime is a usable Hermes install, wherever it came from.
type Runtime struct {
	HermesBin string `json:"hermes_bin"`
	Python    string `json:"python"`
	Source    string `json:"source"` // hermes_root | home | path | managed
}

// PythonEnv is the process environment with the machine's own Python
// configuration scrubbed out. A venv's interpreter that inherits a global
// PYTHONHOME/PYTHONPATH dies at init with "Fatal Python error … <no Python
// frame>" — before it can even say why. Every child that is (or spawns)
// Python gets this environment.
func PythonEnv(extra ...string) []string {
	env := make([]string, 0, len(os.Environ())+len(extra))
	for _, kv := range os.Environ() {
		key, _, _ := strings.Cut(kv, "=")
		switch strings.ToUpper(key) {
		case "PYTHONHOME", "PYTHONPATH", "PYTHONSTARTUP", "PYTHONUSERBASE", "PYTHONEXECUTABLE":
			continue
		}
		env = append(env, kv)
	}
	return append(env, extra...)
}

// venvBin resolves an executable inside a venv, on any OS.
func venvBin(venv, name string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(venv, "Scripts", name+".exe")
	}
	return filepath.Join(venv, "bin", name)
}

// managedVenv is where an app-managed install lives.
func managedVenv(dataDir string) string {
	return filepath.Join(dataDir, "hermes-runtime", "venv")
}

// Detect finds a usable runtime, preferring installs the user made
// themselves. Returns nil when there is none — that's Install's cue.
func Detect(dataDir string) *Runtime {
	// 1. An explicit HERMES_ROOT (or the default ~/.hermes) with the full
	//    source install — the developer / self-hosted layout.
	roots := []struct{ dir, source string }{}
	if v := os.Getenv("HERMES_ROOT"); v != "" {
		roots = append(roots, struct{ dir, source string }{filepath.Join(v, "hermes-agent"), "hermes_root"})
	}
	if home, err := os.UserHomeDir(); err == nil {
		roots = append(roots, struct{ dir, source string }{filepath.Join(home, ".hermes", "hermes-agent"), "home"})
	}
	for _, r := range roots {
		venv := filepath.Join(r.dir, "venv")
		if bin := venvBin(venv, "hermes"); exists(bin) {
			return &Runtime{HermesBin: bin, Python: venvBin(venv, "python"), Source: r.source}
		}
	}
	// 2. hermes on PATH — installed some other way; respect it.
	if bin, err := exec.LookPath("hermes"); err == nil {
		return &Runtime{HermesBin: bin, Source: "path"}
	}
	// 3. The install this package made earlier.
	venv := managedVenv(dataDir)
	if bin := venvBin(venv, "hermes"); exists(bin) {
		return &Runtime{HermesBin: bin, Python: venvBin(venv, "python"), Source: "managed"}
	}
	return nil
}

func exists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// ── the installer ────────────────────────────────────────────────────────────

// Progress is what the UI polls while an install runs.
type Progress struct {
	Stage  string `json:"stage"`  // idle | uv | python | hermes | verify | done | error
	Detail string `json:"detail,omitempty"`
	Error  string `json:"error,omitempty"`
}

// Installer runs at most one install at a time and remembers how it went.
type Installer struct {
	mu      sync.Mutex
	running bool
	last    Progress
}

func (i *Installer) Progress() Progress {
	i.mu.Lock()
	defer i.mu.Unlock()
	return i.last
}

func (i *Installer) set(stage, detail string) {
	i.mu.Lock()
	i.last = Progress{Stage: stage, Detail: detail}
	i.mu.Unlock()
}

// Start kicks off an install unless one is already running (idempotent, the
// same shape as the codex connect flow). The work happens on its own
// goroutine; poll Progress.
func (i *Installer) Start(dataDir string) {
	i.mu.Lock()
	if i.running {
		i.mu.Unlock()
		return
	}
	i.running = true
	i.last = Progress{Stage: "uv"}
	i.mu.Unlock()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
		defer cancel()
		err := i.install(ctx, dataDir)
		i.mu.Lock()
		i.running = false
		if err != nil {
			i.last = Progress{Stage: "error", Error: err.Error()}
		} else {
			i.last = Progress{Stage: "done"}
		}
		i.mu.Unlock()
	}()
}

func (i *Installer) install(ctx context.Context, dataDir string) error {
	uv, err := i.ensureUV(ctx, dataDir)
	if err != nil {
		return fmt.Errorf("get uv: %w", err)
	}

	venv := managedVenv(dataDir)
	if err := os.MkdirAll(filepath.Dir(venv), 0o755); err != nil {
		return err
	}

	// A managed Python — the machine's (possibly absent) one is not our
	// problem. uv downloads a standalone build and caches it.
	i.set("python", "Python "+PythonSeries)
	if err := i.run(ctx, uv, "venv", "--python", PythonSeries, venv); err != nil {
		return fmt.Errorf("create venv: %w", err)
	}

	i.set("hermes", "hermes-agent "+HermesVersion)
	if err := i.run(ctx, uv, "pip", "install",
		"--python", venvBin(venv, "python"),
		fmt.Sprintf("hermes-agent[all]==%s", HermesVersion)); err != nil {
		return fmt.Errorf("install hermes-agent: %w", err)
	}

	i.set("verify", "")
	verify := exec.CommandContext(ctx, venvBin(venv, "hermes"), "--version")
	verify.Env = PythonEnv()
	HideConsole(verify)
	out, err := verify.CombinedOutput()
	if err != nil {
		return fmt.Errorf("hermes did not start after install: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

// run executes a step, keeping its most recent output line visible as the
// progress detail — a long pip install with a frozen label reads as a hang.
func (i *Installer) run(ctx context.Context, bin string, args ...string) error {
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = PythonEnv()
	HideConsole(cmd)
	var tail bytes.Buffer
	cmd.Stdout = &progressWriter{i: i, tail: &tail}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%w: %s", err, lastNonEmptyLine(tail.String()))
	}
	return nil
}

type progressWriter struct {
	i    *Installer
	tail *bytes.Buffer
}

func (w *progressWriter) Write(p []byte) (int, error) {
	w.tail.Write(p)
	if w.tail.Len() > 64*1024 { // keep the tail a tail
		b := w.tail.Bytes()
		w.tail = &bytes.Buffer{}
		w.tail.Write(b[len(b)-32*1024:])
	}
	if line := lastNonEmptyLine(string(p)); line != "" {
		w.i.mu.Lock()
		if w.i.last.Stage != "" && w.i.last.Stage != "error" {
			w.i.last.Detail = line
		}
		w.i.mu.Unlock()
	}
	return len(p), nil
}

func lastNonEmptyLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	for j := len(lines) - 1; j >= 0; j-- {
		if l := strings.TrimSpace(lines[j]); l != "" {
			return l
		}
	}
	return ""
}

// ── uv acquisition ───────────────────────────────────────────────────────────

func uvTarget() (asset string, err error) {
	arch := map[string]string{"amd64": "x86_64", "arm64": "aarch64"}[runtime.GOARCH]
	if arch == "" {
		return "", fmt.Errorf("unsupported architecture %s", runtime.GOARCH)
	}
	switch runtime.GOOS {
	case "linux":
		return "uv-" + arch + "-unknown-linux-gnu.tar.gz", nil
	case "darwin":
		return "uv-" + arch + "-apple-darwin.tar.gz", nil
	case "windows":
		return "uv-" + arch + "-pc-windows-msvc.zip", nil
	}
	return "", fmt.Errorf("unsupported OS %s", runtime.GOOS)
}

// ensureUV finds uv (PATH, then the copy we manage) or downloads the pinned
// release, verifying it against the checksum published beside the asset.
func (i *Installer) ensureUV(ctx context.Context, dataDir string) (string, error) {
	if bin, err := exec.LookPath("uv"); err == nil {
		return bin, nil
	}
	name := "uv"
	if runtime.GOOS == "windows" {
		name = "uv.exe"
	}
	managed := filepath.Join(dataDir, "bin", name)
	if exists(managed) {
		return managed, nil
	}

	asset, err := uvTarget()
	if err != nil {
		return "", err
	}
	base := fmt.Sprintf("https://github.com/astral-sh/uv/releases/download/%s/%s", UVVersion, asset)
	i.set("uv", "downloading uv "+UVVersion)

	blob, err := fetch(ctx, base)
	if err != nil {
		return "", err
	}
	sumFile, err := fetch(ctx, base+".sha256")
	if err != nil {
		return "", err
	}
	want := strings.Fields(string(sumFile))[0]
	got := sha256.Sum256(blob)
	if hex.EncodeToString(got[:]) != want {
		return "", fmt.Errorf("uv download failed its checksum")
	}

	bin, err := extractUV(blob, asset, name)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(managed), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(managed, bin, 0o755); err != nil {
		return "", err
	}
	return managed, nil
}

func fetch(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	return io.ReadAll(resp.Body)
}

// extractUV pulls the single uv executable out of the release archive.
func extractUV(blob []byte, asset, name string) ([]byte, error) {
	if strings.HasSuffix(asset, ".zip") {
		zr, err := zip.NewReader(bytes.NewReader(blob), int64(len(blob)))
		if err != nil {
			return nil, err
		}
		for _, f := range zr.File {
			if filepath.Base(f.Name) == name {
				rc, err := f.Open()
				if err != nil {
					return nil, err
				}
				defer rc.Close()
				return io.ReadAll(rc)
			}
		}
		return nil, fmt.Errorf("%s not in %s", name, asset)
	}
	gz, err := gzip.NewReader(bytes.NewReader(blob))
	if err != nil {
		return nil, err
	}
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		if filepath.Base(hdr.Name) == name && hdr.Typeflag == tar.TypeReg {
			return io.ReadAll(tr)
		}
	}
	return nil, fmt.Errorf("%s not in %s", name, asset)
}

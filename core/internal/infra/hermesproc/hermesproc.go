// Package hermesproc provisions and supervises one Hermes gateway process
// per user: a cloned Hermes profile (its own config, key, memories, session
// store, cron) plus a gateway bound to a unique adapter port.
//
// Hermes upstream is never modified — this uses only its documented profile
// mechanism (HERMES_HOME) and the aular platform plugin's env contract.
package hermesproc

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/obedgyamfi/aular/core/internal/auth"
	"github.com/obedgyamfi/aular/core/internal/infra/hermespaths"
	"github.com/obedgyamfi/aular/core/internal/usersruntime"
)

const (
	// TemplateProfile is the scrubbed profile new users are cloned from
	// (created once by scripts/hermes-make-template.sh).
	TemplateProfile = "aular-template"

	portFloor    = 20000
	startTimeout = 40 * time.Second
	// IdleShutdown stops a user's gateway after this long with no activity.
	IdleShutdown = 3 * time.Hour
)

type Supervisor struct {
	runtimes   *usersruntime.Repository
	coreAPIURL string
	bin        string

	mu    sync.Mutex
	procs map[string]*exec.Cmd // userID → running gateway
}

func NewSupervisor(runtimes *usersruntime.Repository, coreAPIURL string) *Supervisor {
	bin := os.Getenv("HERMES_BIN")
	if bin == "" {
		bin = "hermes"
	}
	return &Supervisor{
		runtimes:   runtimes,
		coreAPIURL: coreAPIURL,
		bin:        bin,
		procs:      map[string]*exec.Cmd{},
	}
}

// ── Provisioning ───────────────────────────────────────────────────────────

// Provision gives a user their own Hermes profile + gateway. Idempotent: a
// ready runtime is returned as-is, a failed one is torn down and retried.
// homeChannelID is the user's system conversation (the gateway's home channel).
func (s *Supervisor) Provision(ctx context.Context, userID, homeChannelID string) (*usersruntime.Row, error) {
	if rt, err := s.runtimes.ForUser(ctx, userID); err == nil {
		if rt.Status == "ready" {
			return rt, nil
		}
		if err := s.Teardown(ctx, userID); err != nil {
			log.Printf("hermesproc: teardown before retry (%s): %v", userID, err)
		}
	} else if !errors.Is(err, usersruntime.ErrNotFound) {
		return nil, err
	}

	port, err := s.allocatePort(ctx)
	if err != nil {
		return nil, err
	}
	token, err := auth.NewToken()
	if err != nil {
		return nil, err
	}
	profile := profileName(userID)

	rt := usersruntime.Row{
		UserID:        userID,
		ProfileName:   profile,
		AdapterPort:   port,
		InternalToken: token,
		Status:        "provisioning",
		HomeChannelID: homeChannelID,
	}
	if err := s.runtimes.Create(ctx, rt); err != nil {
		return nil, fmt.Errorf("register runtime: %w", err)
	}

	if err := s.cloneTemplate(profile); err != nil {
		_ = s.Teardown(ctx, userID)
		return nil, err
	}
	if err := s.writeProfileEnv(rt); err != nil {
		_ = s.Teardown(ctx, userID)
		return nil, err
	}
	if err := s.start(ctx, rt); err != nil {
		_ = s.runtimes.SetStatus(ctx, userID, "failed")
		return nil, err
	}
	if err := s.runtimes.SetStatus(ctx, userID, "ready"); err != nil {
		return nil, err
	}
	rt.Status = "ready"
	log.Printf("hermesproc: provisioned %s → profile %s on port %d", userID, profile, port)
	return &rt, nil
}

// profileName is a Hermes-legal profile id derived from the user id
// (^[a-z0-9][a-z0-9_-]{0,63}$).
func profileName(userID string) string {
	clean := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			return r
		case r >= 'A' && r <= 'Z':
			return r + 32
		default:
			return -1
		}
	}, userID)
	if len(clean) > 12 {
		clean = clean[:12]
	}
	return "u-" + clean
}

// allocatePort takes the next free port above the floor; the UNIQUE index on
// adapter_port is the real arbiter if two signups race.
func (s *Supervisor) allocatePort(ctx context.Context) (int, error) {
	maxPort, err := s.runtimes.MaxPort(ctx, portFloor)
	if err != nil {
		return 0, err
	}
	next := portFloor
	if maxPort >= portFloor {
		next = maxPort + 1
	}
	for p := next; p < next+50; p++ {
		if portFree(p) {
			return p, nil
		}
	}
	return 0, fmt.Errorf("hermesproc: no free adapter port near %d", next)
}

func portFree(p int) bool {
	l, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(p))
	if err != nil {
		return false
	}
	l.Close()
	return true
}

// cloneTemplate copies the scrubbed template profile (which carries the aular
// plugin + toolfeed hook) into a new profile directory. Hermes profiles are
// plain directories, so a copy is the whole operation.
// TemplateAvailable reports whether this install can provision per-user
// profiles at all. The desktop app never makes a template: every account
// rides the default gateway, and provisioning has nothing to do.
func (s *Supervisor) TemplateAvailable() bool {
	_, err := os.Stat(hermespaths.ProfileDir(TemplateProfile))
	return err == nil
}

func (s *Supervisor) cloneTemplate(profile string) error {
	src := hermespaths.ProfileDir(TemplateProfile)
	dst := hermespaths.ProfileDir(profile)
	if _, err := os.Stat(src); err != nil {
		return fmt.Errorf("hermesproc: template profile %q missing — run scripts/hermes-make-template.sh: %w", TemplateProfile, err)
	}
	if _, err := os.Stat(dst); err == nil {
		return nil // already cloned (retry path)
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	if out, err := exec.Command("cp", "-a", src, dst).CombinedOutput(); err != nil {
		return fmt.Errorf("hermesproc: clone template: %w: %s", err, strings.TrimSpace(string(out)))
	}
	// A copied pid file would make Hermes think a gateway is already running.
	_ = os.Remove(filepath.Join(dst, "gateway.pid"))
	return nil
}

// writeProfileEnv writes the profile's .env — the canonical source for the
// aular plugin (a per-profile .env overrides the shell environment), so the
// registry row and the runtime can never drift.
func (s *Supervisor) writeProfileEnv(rt usersruntime.Row) error {
	p := hermespaths.For(rt.ProfileName)
	lines := []string{
		"# Written by AULAR core-api (hermesproc) — do not edit by hand.",
		"AULAR_ADAPTER_PORT=" + strconv.Itoa(rt.AdapterPort),
		"AULAR_INTERNAL_TOKEN=" + rt.InternalToken,
		"AULAR_CORE_API_URL=" + s.coreAPIURL,
		"AULAR_HOME_CHANNEL=" + rt.HomeChannelID,
		"AULAR_ALLOW_ALL_USERS=true",
	}
	// Preserve any non-AULAR keys the template carried (e.g. a model API key).
	if data, err := os.ReadFile(p.EnvFile); err == nil {
		for _, l := range strings.Split(string(data), "\n") {
			t := strings.TrimSpace(l)
			if t == "" || strings.HasPrefix(t, "#") || strings.HasPrefix(t, "AULAR_") {
				continue
			}
			lines = append(lines, t)
		}
	}
	return os.WriteFile(p.EnvFile, []byte(strings.Join(lines, "\n")+"\n"), 0o600)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

// EnsureRunning starts the user's gateway if its adapter isn't answering.
// The default runtime (the original install) is managed by systemd, not here.
func (s *Supervisor) EnsureRunning(ctx context.Context, rt *usersruntime.Row) error {
	if rt.ProfileName == hermespaths.DefaultProfile {
		return nil
	}
	if adapterUp(rt.AdapterPort) {
		return nil
	}
	return s.start(ctx, *rt)
}

func (s *Supervisor) start(ctx context.Context, rt usersruntime.Row) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if adapterUp(rt.AdapterPort) {
		return nil
	}

	home := hermespaths.ProfileDir(rt.ProfileName)
	logFile, err := os.OpenFile(filepath.Join(home, "gateway.log"),
		os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("hermesproc: open gateway log: %w", err)
	}
	defer logFile.Close()

	// Only HERMES_HOME is injected; the profile's .env carries the AULAR
	// contract and takes precedence anyway.
	cmd := exec.Command(s.bin, "gateway", "run")
	cmd.Env = append(os.Environ(), "HERMES_HOME="+home)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = detachAttrs()
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("hermesproc: start gateway: %w", err)
	}
	s.procs[rt.UserID] = cmd
	go func() { _ = cmd.Wait() }() // reap; the gateway outlives the request

	deadline := time.Now().Add(startTimeout)
	for time.Now().Before(deadline) {
		if adapterUp(rt.AdapterPort) {
			_ = s.runtimes.TouchStarted(ctx, rt.UserID)
			log.Printf("hermesproc: gateway up for %s (profile %s, port %d, pid %d)",
				rt.UserID, rt.ProfileName, rt.AdapterPort, cmd.Process.Pid)
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
	_ = cmd.Process.Kill()
	delete(s.procs, rt.UserID)
	return fmt.Errorf("hermesproc: gateway for %s did not answer on port %d within %s (see %s/gateway.log)",
		rt.UserID, rt.AdapterPort, startTimeout, home)
}

// Stop ends a user's gateway (never the default runtime's — systemd owns it).
func (s *Supervisor) Stop(ctx context.Context, userID string) error {
	rt, err := s.runtimes.ForUser(ctx, userID)
	if err != nil {
		return err
	}
	if rt.ProfileName == hermespaths.DefaultProfile {
		return nil
	}
	s.mu.Lock()
	cmd := s.procs[userID]
	delete(s.procs, userID)
	s.mu.Unlock()
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Signal(os.Interrupt)
		time.Sleep(500 * time.Millisecond)
		_ = cmd.Process.Kill()
	}
	// A gateway we didn't launch (core-api restarted under it) is adopted via
	// its pid file.
	if pid := readPID(hermespaths.ProfileDir(rt.ProfileName)); pid > 0 {
		if p, err := os.FindProcess(pid); err == nil {
			_ = p.Signal(os.Interrupt)
		}
	}
	return nil
}

// Teardown stops the gateway, deletes the profile directory, and drops the
// registry row (freeing the port). Used on failed provisioning and on user
// deletion.
func (s *Supervisor) Teardown(ctx context.Context, userID string) error {
	rt, err := s.runtimes.ForUser(ctx, userID)
	if errors.Is(err, usersruntime.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	_ = s.Stop(ctx, userID)
	if rt.ProfileName != hermespaths.DefaultProfile {
		if err := os.RemoveAll(hermespaths.ProfileDir(rt.ProfileName)); err != nil {
			return fmt.Errorf("hermesproc: remove profile: %w", err)
		}
	}
	return s.runtimes.Delete(ctx, userID)
}

// Reconcile runs at startup: adopt gateways already up, restart ready ones
// that aren't, and sweep profiles left behind by failed provisioning.
func (s *Supervisor) Reconcile(ctx context.Context) {
	rows, err := s.runtimes.List(ctx)
	if err != nil {
		log.Printf("hermesproc: reconcile: %v", err)
		return
	}
	for _, rt := range rows {
		if rt.ProfileName == hermespaths.DefaultProfile {
			continue
		}
		switch rt.Status {
		case "ready":
			if adapterUp(rt.AdapterPort) {
				log.Printf("hermesproc: adopted running gateway for %s (port %d)", rt.UserID, rt.AdapterPort)
				continue
			}
			if err := s.start(ctx, rt); err != nil {
				log.Printf("hermesproc: restart %s: %v", rt.UserID, err)
			}
		case "provisioning":
			// Interrupted mid-provision — clean it up; the next login retries.
			log.Printf("hermesproc: sweeping interrupted provisioning for %s", rt.UserID)
			_ = s.Teardown(ctx, rt.UserID)
		}
	}
}

// StartIdleReaper stops gateways with no activity for IdleShutdown. They
// restart on the user's next turn (EnsureRunning), so this only reclaims RAM.
func (s *Supervisor) StartIdleReaper(ctx context.Context, db interface {
	IdleUsers(ctx context.Context, olderThan time.Duration) ([]string, error)
}) {
	go func() {
		t := time.NewTicker(15 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				users, err := db.IdleUsers(ctx, IdleShutdown)
				if err != nil {
					continue
				}
				for _, u := range users {
					if err := s.Stop(ctx, u); err == nil {
						log.Printf("hermesproc: stopped idle gateway for %s", u)
					}
				}
			}
		}
	}()
}

func adapterUp(port int) bool {
	c, err := net.DialTimeout("tcp", "127.0.0.1:"+strconv.Itoa(port), 500*time.Millisecond)
	if err != nil {
		return false
	}
	c.Close()
	return true
}

func readPID(home string) int {
	data, err := os.ReadFile(filepath.Join(home, "gateway.pid"))
	if err != nil {
		return 0
	}
	pid, _ := strconv.Atoi(strings.TrimSpace(string(data)))
	return pid
}

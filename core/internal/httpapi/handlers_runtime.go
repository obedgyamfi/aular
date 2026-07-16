package httpapi

import (
	"net"
	"net/http"
	"net/url"
	"time"

	"github.com/obedgyamfi/aular/core/internal/infra/hermesboot"
)

// The agent runtime, as onboarding sees it. A shipped app can't assume the
// machine has Hermes — or Python. These two endpoints power the "Install the
// agent runtime" step: status says where things stand, install starts the
// managed bootstrap (uv → pinned Python → pinned hermes-agent), and the UI
// polls status until the stage is done — the same poll shape as the codex
// connect flow.

type runtimeStatus struct {
	Installed bool                `json:"installed"`
	GatewayUp bool                `json:"gateway_up"`
	Runtime   *hermesboot.Runtime `json:"runtime,omitempty"`
	Install   hermesboot.Progress `json:"install"`
}

// gatewayUp answers "is the thing that thinks actually listening?" — a TCP
// dial of the adapter port. Installed-but-down and up are different problems
// with different fixes, and the UI should never conflate them.
func (s *Server) gatewayUp() bool {
	u, err := url.Parse(s.cfg.AularAdapterURL)
	if err != nil || u.Host == "" {
		return false
	}
	conn, err := net.DialTimeout("tcp", u.Host, 400*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

// GET /api/v1/runtime/status
func (s *Server) handleRuntimeStatus(w http.ResponseWriter, _ *http.Request) {
	rt := hermesboot.Detect(s.cfg.DataDir)
	writeJSON(w, http.StatusOK, runtimeStatus{
		Installed: rt != nil,
		GatewayUp: s.gatewayUp(),
		Runtime:   rt,
		Install:   s.bootInstaller.Progress(),
	})
}

// POST /api/v1/runtime/install — idempotent; a running install is joined,
// not restarted.
func (s *Server) handleRuntimeInstall(w http.ResponseWriter, _ *http.Request) {
	if rt := hermesboot.Detect(s.cfg.DataDir); rt != nil {
		writeJSON(w, http.StatusOK, runtimeStatus{Installed: true, Runtime: rt,
			Install: hermesboot.Progress{Stage: "done"}})
		return
	}
	s.bootInstaller.Start(s.cfg.DataDir)
	writeJSON(w, http.StatusAccepted, runtimeStatus{Install: s.bootInstaller.Progress()})
}

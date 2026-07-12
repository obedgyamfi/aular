package aularadapter

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/obedgyamfi/aular/core/internal/infra/hermespaths"
	"github.com/obedgyamfi/aular/core/internal/usersruntime"
)

// Runtimes is the slice of the runtime registry the adapter registry needs
// (an interface so hermesproc can supervise without an import cycle).
type Runtimes interface {
	ForUser(ctx context.Context, userID string) (*usersruntime.Row, error)
	TouchActive(ctx context.Context, userID string) error
}

// Starter brings a user's gateway up on demand (hermesproc.Supervisor).
type Starter interface {
	EnsureRunning(ctx context.Context, rt *usersruntime.Row) error
}

// Registry resolves the right gateway for a user: their own profile's adapter
// (its port and internal token from the runtime registry), or the default
// runtime's adapter for the original account.
type Registry struct {
	runtimes Runtimes
	starter  Starter

	// The default runtime's adapter (systemd-managed ~/.hermes gateway).
	defaultURL   string
	defaultToken string
}

func NewRegistry(runtimes Runtimes, starter Starter, defaultURL, defaultToken string) *Registry {
	return &Registry{
		runtimes:     runtimes,
		starter:      starter,
		defaultURL:   defaultURL,
		defaultToken: defaultToken,
	}
}

// ErrRuntimeUnavailable means the user has no working gateway right now —
// handlers turn this into a friendly 503 rather than dropping the turn.
var ErrRuntimeUnavailable = errors.New("agent runtime unavailable")

// ForUser returns a client pointed at that user's gateway, starting it if
// needed. Marks the runtime active (feeds the idle reaper).
func (r *Registry) ForUser(ctx context.Context, userID string) (*Client, error) {
	rt, err := r.runtimes.ForUser(ctx, userID)
	if errors.Is(err, usersruntime.ErrNotFound) {
		// No runtime registered (e.g. a pre-multi-user install that never ran
		// `userctl adopt-default`): fall back to the process default.
		return NewClient(r.defaultURL, r.defaultToken), nil
	}
	if err != nil {
		return nil, err
	}
	if rt.Status == "disabled" {
		return nil, fmt.Errorf("%w: runtime disabled", ErrRuntimeUnavailable)
	}
	if rt.ProfileName == hermespaths.DefaultProfile {
		return NewClient(r.defaultURL, r.defaultToken), nil
	}
	if r.starter != nil {
		if err := r.starter.EnsureRunning(ctx, rt); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrRuntimeUnavailable, err)
		}
	}
	_ = r.runtimes.TouchActive(ctx, userID)
	return NewClient("http://127.0.0.1:"+strconv.Itoa(rt.AdapterPort), rt.InternalToken), nil
}

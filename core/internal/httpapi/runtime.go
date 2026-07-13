package httpapi

import (
	"context"
	"log"
	"time"

	"github.com/obedgyamfi/aular/core/internal/infra/aularadapter"
	"github.com/obedgyamfi/aular/core/internal/infra/hermescron"
	"github.com/obedgyamfi/aular/core/internal/infra/hermesmemory"
	"github.com/obedgyamfi/aular/core/internal/infra/hermespaths"
	"github.com/obedgyamfi/aular/core/internal/infra/hermesstate"
	"github.com/obedgyamfi/aular/core/internal/usersruntime"
)

// This file is the single seam between AULAR and "which Hermes runtime does
// this user have?". Every read of Hermes state (sessions, cron, memories,
// model config) and every agent turn routes through one of these resolvers,
// so no handler ever touches a global ~/.hermes path again.

// userProfile returns the user's Hermes profile name, defaulting to the root
// runtime when they have no registry row (single-user installs, and the
// original account adopted by `userctl adopt-default`).
func (s *Server) userProfile(ctx context.Context, userID string) string {
	rt, err := s.runtimesRepo.ForUser(ctx, userID)
	if err != nil {
		return hermespaths.DefaultProfile
	}
	return rt.ProfileName
}

// userPaths resolves the filesystem layout of the caller's Hermes runtime.
func (s *Server) userPaths(ctx context.Context) hermespaths.Paths {
	return hermespaths.For(s.userProfile(ctx, s.ctxUserID(ctx)))
}

// userState reads the caller's own Hermes session store (tokens, tool calls).
func (s *Server) userState(ctx context.Context) *hermesstate.Client {
	return hermesstate.NewClientForDB(s.userPaths(ctx).StateDB)
}

// userCron acts on the caller's own Hermes cron store.
func (s *Server) userCron(ctx context.Context) *hermescron.Client {
	return s.hermesCron.ForHome(s.userPaths(ctx).Home)
}

// userMemory reads the caller's own Hermes memory graph.
func (s *Server) userMemory(ctx context.Context) *hermesmemory.Client {
	return s.hermesMemory.ForHome(s.userPaths(ctx).Home)
}

// userHome is the Hermes home for modelconfig Read/Write (BYOK per user).
func (s *Server) userHome(ctx context.Context) string {
	return s.userPaths(ctx).Home
}

// cronForConversation resolves the cron client of a conversation's owner —
// background paths (routine activation from a dispatch, watchdog) don't have
// a request user.
func (s *Server) cronForConversation(ctx context.Context, conversationID string) *hermescron.Client {
	owner := s.conversationOwner(ctx, conversationID)
	if owner == "" {
		return s.hermesCron
	}
	return s.hermesCron.ForHome(hermespaths.For(s.userProfile(ctx, owner)).Home)
}

// deliverTo hands a turn to the owning user's gateway (starting it if needed).
func (s *Server) deliverTo(ctx context.Context, userID string, req aularadapter.InboundRequest) error {
	client, err := s.adapters.ForUser(ctx, userID)
	if err != nil {
		log.Printf("deliver: no adapter for %s: %v", userID, err)
		return err
	}
	log.Printf("deliver: handing turn for conversation %s to the agent runtime", req.ConversationID)
	if err := client.Deliver(ctx, req); err != nil {
		log.Printf("deliver: runtime rejected the turn: %v", err)
		return err
	}
	return nil
}

// runtimeForToken authenticates an /internal/* call: the token identifies
// which user's gateway is calling, so a gateway can only act on its owner's
// data. Falls back to the shared config token for the default runtime.
func (s *Server) runtimeForToken(ctx context.Context, token string) (*usersruntime.Row, bool) {
	if token == "" {
		return nil, false
	}
	if rt, err := s.runtimesRepo.ByToken(ctx, token); err == nil {
		return rt, true
	}
	if token == s.cfg.InternalToken {
		return nil, true // the default runtime (no registry row needed)
	}
	return nil, false
}

// internalAuth checks an internal token and verifies the calling gateway owns
// the conversation it's acting on. Returns false after writing the response.
func (s *Server) internalCallerOwns(ctx context.Context, token, conversationID string) bool {
	rt, ok := s.runtimeForToken(ctx, token)
	if !ok {
		return false
	}
	if rt == nil {
		return true // default runtime: the pre-existing trust boundary
	}
	owner := s.conversationOwner(ctx, conversationID)
	if owner != "" && owner != rt.UserID {
		log.Printf("httpapi: gateway for %s tried to act on %s's conversation %s",
			rt.UserID, owner, conversationID)
		return false
	}
	return true
}

// StartRuntimeSupervision reconciles per-user gateways at boot (adopt what's
// already up, restart what should be, sweep failed provisioning) and starts
// the idle reaper.
func (s *Server) StartRuntimeSupervision(ctx context.Context) {
	go func() {
		s.supervisor.Reconcile(ctx)
		s.supervisor.StartIdleReaper(ctx, s.runtimesRepo)
	}()
	// Keep the auth rate-limiter's bucket map from growing without bound.
	go func() {
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.authLimiter.sweep()
			}
		}
	}()
}

// ProvisionRuntime gives a user their own Hermes profile + gateway, seeding
// their system agent first so the profile's home channel points at a real
// conversation. Safe to call repeatedly (idempotent on runtime status).
func (s *Server) ProvisionRuntime(ctx context.Context, userID string) error {
	profile, err := s.agentsRepo.GetOrCreateSystemProfileForUser(ctx, userID)
	if err != nil {
		return err
	}
	convo, err := s.findOrCreateConversation(ctx, userID, profile.ID)
	if err != nil {
		return err
	}
	_, err = s.supervisor.Provision(ctx, userID, convo.ID)
	return err
}

// ensureRuntimeAsync provisions a user's Hermes runtime if they don't have a
// ready one (first login, or a retry after a failed attempt). Runs detached:
// cloning a profile and booting a gateway takes seconds, and login must not
// block on it.
func (s *Server) ensureRuntimeAsync(userID string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		if rt, err := s.runtimesRepo.ForUser(ctx, userID); err == nil && rt.Status == "ready" {
			// Already provisioned; make sure it's actually up.
			if err := s.supervisor.EnsureRunning(ctx, rt); err != nil {
				log.Printf("httpapi: runtime for %s not running: %v", userID, err)
			}
			return
		}
		if err := s.ProvisionRuntime(ctx, userID); err != nil {
			log.Printf("httpapi: provision runtime for %s: %v", userID, err)
		}
	}()
}

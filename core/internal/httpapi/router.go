// Package httpapi is the REST layer for core-api. Handlers stay thin —
// validation and shaping only — repositories in internal/<domain> own the
// actual queries.
package httpapi

import (
	"database/sql"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/obedgyamfi/aular/core/engine"
	"github.com/obedgyamfi/aular/core/internal/agents"
	"github.com/obedgyamfi/aular/core/internal/appsettings"
	"github.com/obedgyamfi/aular/core/internal/auth"
	"github.com/obedgyamfi/aular/core/internal/conversations"
	"github.com/obedgyamfi/aular/core/internal/infra/aularadapter"
	"github.com/obedgyamfi/aular/core/internal/infra/config"
	"github.com/obedgyamfi/aular/core/internal/infra/hermescron"
	"github.com/obedgyamfi/aular/core/internal/infra/hermesmemory"
	"github.com/obedgyamfi/aular/core/internal/infra/hermesproc"
	"github.com/obedgyamfi/aular/core/internal/infra/hermesstate"
	"github.com/obedgyamfi/aular/core/internal/messages"
	"github.com/obedgyamfi/aular/core/internal/metering"
	"github.com/obedgyamfi/aular/core/internal/realtime"
	"github.com/obedgyamfi/aular/core/internal/routines"
	"github.com/obedgyamfi/aular/core/internal/tokensnap"
	"github.com/obedgyamfi/aular/core/internal/toolcalls"
	"github.com/obedgyamfi/aular/core/internal/tools"
	"github.com/obedgyamfi/aular/core/internal/users"
	"github.com/obedgyamfi/aular/core/internal/usersruntime"
)

type Server struct {
	cfg               *config.Config
	db                *sql.DB
	agentsRepo        *agents.Repository
	toolsRepo         *tools.Repository
	conversationsRepo *conversations.Repository
	messagesRepo      *messages.Repository
	routinesRepo      *routines.Repository
	meteringRepo      *metering.Repository
	toolCallsRepo     *toolcalls.Repository
	appSettings       *appsettings.Repository
	tokenSnapRepo     *tokensnap.Repository
	engine            engine.Engine
	usersRepo         *users.Repository
	runtimesRepo      *usersruntime.Repository
	sessions          *auth.Sessions
	credentials       *auth.Credentials
	invites           *auth.Invites
	authLimiter       *rateLimiter
	hub               *realtime.Hub
	aularAdapter      *aularadapter.Client // the default runtime's adapter
	adapters          *aularadapter.Registry
	supervisor        *hermesproc.Supervisor
	hermesCron        *hermescron.Client
	hermesMemory      *hermesmemory.Client
	hermesState       *hermesstate.Client

	// Tracks agent-spec message ids already turned into agents, so a streamed
	// build reply (seen across deliver + finalizing edit) creates only once.
	specMu   sync.Mutex
	specDone map[string]bool
}

func NewServer(cfg *config.Config, db *sql.DB, eng engine.Engine) *Server {
	runtimes := usersruntime.NewRepository(db)
	supervisor := hermesproc.NewSupervisor(runtimes, cfg.CoreAPIURL)
	srv := &Server{
		engine:     eng,
		supervisor: supervisor,
		adapters: aularadapter.NewRegistry(
			runtimes, supervisor, cfg.AularAdapterURL, cfg.InternalToken),
		cfg:               cfg,
		db:                db,
		agentsRepo:        agents.NewRepository(db),
		toolsRepo:         tools.NewRepository(db),
		conversationsRepo: conversations.NewRepository(db),
		messagesRepo:      messages.NewRepository(db),
		routinesRepo:      routines.NewRepository(db),
		meteringRepo:      metering.NewRepository(db),
		toolCallsRepo:     toolcalls.NewRepository(db),
		appSettings:       appsettings.NewRepository(db),
		tokenSnapRepo:     tokensnap.NewRepository(db),
		usersRepo:         users.NewRepository(db),
		runtimesRepo:      runtimes,
		sessions:          auth.NewSessions(db),
		credentials:       auth.NewCredentials(db),
		invites:           auth.NewInvites(db),
		// 10 auth attempts/min per IP, burst 5 — generous for a human, hostile
		// to a password-spraying script.
		authLimiter:  newRateLimiter(10, 5),
		hub:          realtime.NewHub(),
		aularAdapter: aularadapter.NewClient(cfg.AularAdapterURL, cfg.InternalToken),
		hermesCron:   hermescron.NewClient(),
		hermesMemory: hermesmemory.NewClient(),
		hermesState:  hermesstate.NewClient(),
		specDone:     make(map[string]bool),
	}
	// The engine gets its handle on the shell exactly once, at boot.
	eng.Attach(srv)
	return srv
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(originCheck)

	r.Get("/healthz", s.handleHealthz)

	// Outside the bearer-auth group: browsers' native WebSocket API can't
	// set an Authorization header, so auth here is a query-param token
	// instead (see handlers_ws.go). A second Phase-1-style stand-in,
	// replaced together with the bearer token in Phase 6.
	r.Get("/ws", s.handleWS)
	r.Get("/media/{name}", s.handleMedia)

	// Internal: the Hermes aular platform adapter delivers agent replies and
	// async cron/job pushes here. Auth is the shared AULAR_INTERNAL_TOKEN,
	// not the public bearer token.
	// Session auth: login/logout/me sit outside /api/v1 (no session required
	// to reach them); /api/v1 requires one via sessionAuth below.
	r.Post("/auth/login", s.limitAuth(s.handleLogin))
	r.Post("/auth/logout", s.handleLogout)
	r.Get("/auth/me", s.handleMe)
	r.Post("/auth/signup", s.limitAuth(s.handleSignup))

	r.Post("/internal/deliver", s.handleInternalDeliver)
	r.Post("/internal/edit", s.handleInternalEdit)
	r.Post("/internal/activity", s.handleInternalActivity)
	r.Post("/internal/tool-event", s.handleInternalToolEvent)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(s.sessionAuth)

		r.Get("/tool-definitions", s.handleListToolDefinitions)
		r.Get("/agent-profile-templates", s.handleListTemplates)

		r.Route("/agent-profiles", func(r chi.Router) {
			r.Get("/", s.handleListProfiles)
			r.Post("/", s.handleCreateProfile)
			r.Get("/{id}", s.handleGetProfile)
			r.Patch("/{id}", s.handleUpdateProfile)
			r.Delete("/{id}", s.handleDeleteProfile)
			r.Post("/{id}/read", s.handleMarkAgentRead)
		})

		r.Route("/conversations", func(r chi.Router) {
			r.Get("/", s.handleListConversations)
			r.Post("/", s.handleCreateConversation)
			r.Get("/{id}", s.handleGetConversation)
			r.Patch("/{id}", s.handleUpdateConversation)
			r.Delete("/{id}", s.handleDeleteConversation)
			r.Get("/{id}/messages", s.handleListMessages)
			r.Get("/{id}/tool-calls", s.handleListToolCalls)
			r.Get("/{id}/context", s.handleConversationContext)
			r.Post("/{id}/messages", s.handleCreateMessage)
			r.Delete("/{id}/messages/{mid}", s.handleDeleteMessage)
			r.Post("/{id}/read", s.handleMarkRead)
		})

		r.Route("/settings", func(r chi.Router) {
			r.Get("/model", s.handleGetModelSettings)
			r.Put("/model", s.handleUpdateModelSettings)
			r.Route("/model/connect/codex", func(r chi.Router) {
				r.Get("/", s.handleCodexConnectStatus)
				r.Post("/", s.handleCodexConnectStart)
				r.Get("/status", s.handleCodexStatus)
				r.Post("/import", s.handleCodexImport)
				r.Get("/models", s.handleCodexModels)
			})
		})

		r.Route("/routines", func(r chi.Router) {
			r.Get("/", s.handleListRoutines)
			r.Post("/", s.handleCreateRoutine)
			r.Patch("/{id}", s.handleUpdateRoutine)
			r.Delete("/{id}", s.handleDeleteRoutine)
		})

		r.Get("/schedule/jobs", s.handleListScheduledJobs)
		r.Get("/analytics/daily", s.handleAnalyticsDaily)
		r.Get("/usage/summary", s.handleUsageSummary)
		r.Get("/usage/tokens", s.handleUsageTokens)
		r.Post("/usage/reset", s.handleUsageReset)
		r.Get("/memory", s.handleGetMemory)
		r.Get("/repo/log", s.handleRepoLog)

		r.Post("/media", s.handleUploadMedia)
	})

	return r
}

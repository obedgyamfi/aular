package httpapi

import (
	"net/http"
	"sync"
	"time"
)

// Auth endpoints are the only unauthenticated write surface, so they get a
// simple in-process token bucket per client IP. (In-process is right for a
// single-node deploy; a shared store is the Redis-era upgrade.)
type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    time.Duration // one token per rate
	burst   int
}

type bucket struct {
	tokens   float64
	lastSeen time.Time
}

func newRateLimiter(perMinute, burst int) *rateLimiter {
	return &rateLimiter{
		buckets: map[string]*bucket{},
		rate:    time.Minute / time.Duration(perMinute),
		burst:   burst,
	}
}

// allow reports whether this key has a token left, refilling by elapsed time.
func (rl *rateLimiter) allow(key string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, ok := rl.buckets[key]
	if !ok {
		rl.buckets[key] = &bucket{tokens: float64(rl.burst) - 1, lastSeen: now}
		return true
	}
	b.tokens += now.Sub(b.lastSeen).Seconds() / rl.rate.Seconds()
	if b.tokens > float64(rl.burst) {
		b.tokens = float64(rl.burst)
	}
	b.lastSeen = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// sweep drops idle buckets so the map can't grow without bound.
func (rl *rateLimiter) sweep() {
	cutoff := time.Now().Add(-time.Hour)
	rl.mu.Lock()
	defer rl.mu.Unlock()
	for k, b := range rl.buckets {
		if b.lastSeen.Before(cutoff) {
			delete(rl.buckets, k)
		}
	}
}

// limitAuth wraps the login/signup handlers: 429 when an IP is hammering them.
func (s *Server) limitAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.authLimiter.allow(clientIP(r)) {
			w.Header().Set("Retry-After", "60")
			writeError(w, http.StatusTooManyRequests, "too many attempts — wait a minute and try again")
			return
		}
		next(w, r)
	}
}

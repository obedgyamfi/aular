// Package config loads process configuration from environment variables.
package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port            string
	DBPath          string // path to the SQLite database file
	MediaDir        string // directory for media delivered by the Hermes AULAR plugin
	AularAdapterURL string // base URL of the AULAR Hermes gateway platform adapter's inbound endpoint
	InternalToken   string // shared secret for /internal/deliver (the adapter delivers agent messages here)
	CoreAPIURL      string // this API's own URL, written into per-user Hermes profiles

	// Session-auth settings.
	CookieSecure bool   // set Secure on the session cookie (behind HTTPS)
	SignupMode   string // closed | invite | open (Phase 5)

	// Dev fallback: when AULAR_DEV_STATIC_AUTH=1 the legacy static bearer
	// token still authenticates as UserID. Off in real deployments.
	DevStaticAuth bool
	APIToken      string // legacy static bearer (dev fallback only)
	UserID        string // the user the static token maps to
}

func Load() (*Config, error) {
	c := &Config{
		Port:            getenv("PORT", "8080"),
		DBPath:          getenv("AULAR_DB_PATH", "./aular.db"),
		MediaDir:        getenv("AULAR_MEDIA_DIR", "./media"),
		APIToken:        os.Getenv("AULAR_API_TOKEN"),
		UserID:          os.Getenv("AULAR_USER_ID"),
		AularAdapterURL: getenv("AULAR_ADAPTER_URL", "http://localhost:8643"),
		CoreAPIURL:      getenv("AULAR_CORE_API_URL", "http://127.0.0.1:8080"),
		InternalToken:   os.Getenv("AULAR_INTERNAL_TOKEN"),
		CookieSecure:    os.Getenv("AULAR_COOKIE_SECURE") == "1",
		SignupMode:      getenv("AULAR_SIGNUP_MODE", "closed"),
		DevStaticAuth:   os.Getenv("AULAR_DEV_STATIC_AUTH") == "1",
	}
	if c.DevStaticAuth && (c.APIToken == "" || c.UserID == "") {
		return nil, fmt.Errorf("config: AULAR_DEV_STATIC_AUTH=1 requires AULAR_API_TOKEN and AULAR_USER_ID")
	}
	if c.InternalToken == "" {
		return nil, fmt.Errorf("config: AULAR_INTERNAL_TOKEN is required (shared with the Hermes aular plugin)")
	}
	switch c.SignupMode {
	case "closed", "invite", "open":
	default:
		return nil, fmt.Errorf("config: AULAR_SIGNUP_MODE must be closed|invite|open, got %q", c.SignupMode)
	}
	return c, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

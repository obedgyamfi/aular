package auth

import "context"

type ctxKey struct{}

// WithUserID stamps the authenticated (or, for internal deliveries, the
// resolved owner) user id onto a context.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, ctxKey{}, userID)
}

// UserID returns the user id carried by ctx, or "".
func UserID(ctx context.Context) string {
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

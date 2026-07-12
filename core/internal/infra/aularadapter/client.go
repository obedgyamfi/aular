// Package aularadapter is a thin HTTP client for the AULAR Hermes gateway
// platform plugin's inbound endpoint. core-api hands user messages to the
// adapter (running inside the Hermes gateway); the agent's reply — and any
// later cron/async push — comes back asynchronously via core-api's
// /internal/deliver endpoint and out over the WebSocket. See AGENTS.md.
package aularadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func NewClient(baseURL, internalToken string) *Client {
	return &Client{
		baseURL: baseURL,
		token:   internalToken,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

type InboundRequest struct {
	ConversationID string `json:"conversation_id"`
	UserID         string `json:"user_id"`
	Content        string `json:"content"`
	SystemPrompt   string `json:"system_prompt"`
}

// Deliver hands a user message to the adapter. It returns once the adapter
// has accepted the message (202) — the agent runs and replies asynchronously
// via /internal/deliver, so this does NOT wait for the reply.
func (c *Client) Deliver(ctx context.Context, req InboundRequest) error {
	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("aularadapter: marshal: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/inbound", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("aularadapter: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Aular-Internal-Token", c.token)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return fmt.Errorf("aularadapter: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		var errBody struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errBody)
		return fmt.Errorf("aularadapter: status %d: %s", resp.StatusCode, errBody.Error)
	}
	return nil
}

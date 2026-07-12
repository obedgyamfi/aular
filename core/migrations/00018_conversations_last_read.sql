-- +goose Up
-- Tracks when the user last opened/read a conversation, so unread agent
-- responses (including proactive cron pushes that arrived while away) can be
-- counted for the sidebar badge. NULL = never read = everything is unread.
ALTER TABLE conversations ADD COLUMN last_read_at DATETIME;

-- +goose Down
ALTER TABLE conversations DROP COLUMN last_read_at;

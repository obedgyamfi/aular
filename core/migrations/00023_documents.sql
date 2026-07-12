-- +goose Up
-- The organization knowledge bank: org-wide docs (specs, processes, the
-- roadmap/masterplan) and per-agent role documents. agent_profile_id NULL =
-- org-wide. Agents read these through their system prompt and write them via
-- <<<AULAR_DOC>>> blocks; the user manages them in Organization → Docs.
CREATE TABLE documents (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_profile_id   TEXT REFERENCES agent_profiles(id) ON DELETE CASCADE,
    title              TEXT NOT NULL,
    kind               TEXT NOT NULL DEFAULT 'doc', -- doc|spec|process|roadmap
    content            TEXT NOT NULL DEFAULT '',
    updated_by         TEXT NOT NULL DEFAULT 'user',
    created_at         DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at         DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_documents_agent ON documents(agent_profile_id);
CREATE UNIQUE INDEX idx_documents_scope_title ON documents(user_id, COALESCE(agent_profile_id, ''), title);

-- +goose Down
DROP TABLE documents;

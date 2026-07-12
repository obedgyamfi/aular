-- +goose Up
CREATE TABLE tool_definitions (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    description  TEXT NOT NULL DEFAULT '',
    category     TEXT NOT NULL DEFAULT 'general',
    risk_level   TEXT NOT NULL DEFAULT 'low', -- low | medium | high
    created_at   DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO tool_definitions (id, name, description, category, risk_level) VALUES
    (lower(hex(randomblob(16))), 'calendar.read',       'Read calendar events',                              'calendar',      'low'),
    (lower(hex(randomblob(16))), 'calendar.write',      'Create, move, or cancel calendar events',           'calendar',      'medium'),
    (lower(hex(randomblob(16))), 'tasks.read',          'Read tasks and their status',                       'tasks',         'low'),
    (lower(hex(randomblob(16))), 'tasks.write',         'Create or update tasks',                            'tasks',         'medium'),
    (lower(hex(randomblob(16))), 'memory.read',         'Read stored memory items',                          'memory',        'low'),
    (lower(hex(randomblob(16))), 'memory.write',        'Create or update memory items',                     'memory',        'medium'),
    (lower(hex(randomblob(16))), 'routines.read',       'Read recurring routines',                           'routines',      'low'),
    (lower(hex(randomblob(16))), 'routines.write',      'Create or update recurring routines',               'routines',      'medium'),
    (lower(hex(randomblob(16))), 'notifications.send',  'Send a push/in-app notification to the user',       'notifications', 'low'),
    (lower(hex(randomblob(16))), 'codex.exec',          'Execute the OpenAI Codex CLI to write or run code', 'engineering',   'high');

-- +goose Down
DROP TABLE tool_definitions;

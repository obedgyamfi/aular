-- +goose Up
ALTER TABLE agent_profiles
    ADD COLUMN template_id TEXT REFERENCES agent_profile_templates(id) ON DELETE SET NULL;

CREATE INDEX idx_agent_profiles_template_id ON agent_profiles(template_id);

-- +goose Down
ALTER TABLE agent_profiles DROP COLUMN template_id;

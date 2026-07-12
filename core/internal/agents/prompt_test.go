package agents

import (
	"strings"
	"testing"
)

func TestBuildSystemPromptIncludesAularChunkingGuidance(t *testing.T) {
	prompt := BuildSystemPrompt(&AgentProfile{
		Name:         "Hermes",
		Role:         "chief_of_staff",
		Persona:      "Calm, direct chief of staff.",
		Instructions: "Coordinate across all other profiles.",
		Tone:         "calm, direct, concise",
	})

	for _, want := range []string{
		"Prefer chat-native replies",
		"semantically distinct points",
		"<<<AULAR_CHUNK>>>",
		"do not split code blocks, tables, JSON",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q:\n%s", want, prompt)
		}
	}
}

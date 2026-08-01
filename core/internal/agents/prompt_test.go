package agents

import (
	"strings"
	"testing"
)

func TestBuildSystemPromptAsksForOneMessage(t *testing.T) {
	prompt := BuildSystemPrompt(&AgentProfile{
		Name:         "Hermes",
		Role:         "chief_of_staff",
		Persona:      "Calm, direct chief of staff.",
		Instructions: "Coordinate across all other profiles.",
		Tone:         "calm, direct, concise",
	})

	for _, want := range []string{
		"Reply once, as a single message",
		"Use markdown",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q:\n%s", want, prompt)
		}
	}

	// The chunk delimiter is retired: agents must not be taught to emit it.
	if strings.Contains(prompt, "AULAR_CHUNK") {
		t.Fatalf("prompt still teaches the retired chunk delimiter:\n%s", prompt)
	}
}

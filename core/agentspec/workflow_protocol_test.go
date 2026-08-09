package agentspec

import (
	"strings"
	"testing"
)

func TestBuilderProtocolIncludesWorkflowArtifactContract(t *testing.T) {
	prompt := BuilderProtocol(nil, nil)
	for _, want := range []string{
		"<<<AULAR_WORKFLOW>>>",
		"<<<END_AULAR_WORKFLOW>>>",
		`"nodes"`,
		`"edges"`,
		"workflow definition",
		"Do not claim the workflow is scheduled",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("BuilderProtocol missing workflow contract %q", want)
		}
	}
}

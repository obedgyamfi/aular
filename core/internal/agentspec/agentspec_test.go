package agentspec

import "testing"

func TestExtract(t *testing.T) {
	// No spec: content passes through untouched.
	if j, c, ok := Extract("just chatting"); ok || j != "" || c != "just chatting" {
		t.Fatalf("plain: got %q %q %v", j, c, ok)
	}

	// Streaming partial: marker open but not closed — hide from marker on,
	// nothing complete yet.
	if j, c, ok := Extract("Building it now.\n" + SpecStart + "\n{\"name\":\"Or"); ok || j != "" || c != "Building it now." {
		t.Fatalf("partial: got %q %q %v", j, c, ok)
	}

	// Complete block: visible text cleaned, json extracted.
	full := "Done!\n" + SpecStart + "\n{\"name\":\"Orion\"}\n" + SpecEnd
	j, c, ok := Extract(full)
	if !ok || c != "Done!" || j != `{"name":"Orion"}` {
		t.Fatalf("complete: got %q %q %v", j, c, ok)
	}
}

func TestExtractSpecKind(t *testing.T) {
	if k, _, c, _ := ExtractSpec("hi there"); k != BlockNone || c != "hi there" {
		t.Fatalf("none: %v %q", k, c)
	}
	create := "Done!\n" + SpecStart + "\n{\"name\":\"Orion\"}\n" + SpecEnd
	if k, j, c, ok := ExtractSpec(create); k != BlockCreate || !ok || c != "Done!" || j != `{"name":"Orion"}` {
		t.Fatalf("create: %v %q %q %v", k, j, c, ok)
	}
	// Streaming: a half-typed marker must be hidden, not leaked as text.
	if k, _, c, ok := ExtractSpec("On it.\n<<<AULAR_AGENT_ED"); k != BlockNone || ok || c != "On it." {
		t.Fatalf("partial marker leaked: %v %q %v", k, c, ok)
	}

	edit := "Updated.\n" + EditStart + "\n{\"target_id\":\"abc\",\"tone\":\"strict\"}\n" + EditEnd
	k, j, c, ok := ExtractSpec(edit)
	if k != BlockEdit || !ok || c != "Updated." {
		t.Fatalf("edit: %v %q %q %v", k, j, c, ok)
	}
	e, err := ParseEdit(j)
	if err != nil || e.TargetID != "abc" || e.Tone == nil || *e.Tone != "strict" || e.Name != nil {
		t.Fatalf("parseEdit: %+v err=%v", e, err)
	}
}

func TestSanitizeFiltersToolsAndDefaults(t *testing.T) {
	allowed := []ToolLite{{"web_search", "low"}, {"calendar_write", "medium"}, {"shell_exec", "high"}}
	d := Sanitize(Draft{
		Name:         "Orion",
		Role:         "Market Research",
		DefaultTools: []string{"web_search", "shell_exec", "unknown_tool", "web_search"},
	}, allowed)

	if d.Role != "market_research" {
		t.Fatalf("role = %q", d.Role)
	}
	if d.ModelBackend != "hermes_agent" || d.PermissionProfile != "standard" {
		t.Fatalf("defaults not applied: %+v", d)
	}
	if len(d.DefaultTools) != 1 || d.DefaultTools[0] != "web_search" {
		t.Fatalf("tools not filtered (dropped high/unknown/dupe): %v", d.DefaultTools)
	}
	if !d.Valid() {
		t.Fatal("expected valid")
	}
}

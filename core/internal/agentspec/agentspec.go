// Package agentspec turns a natural-language conversation with the AULAR system
// agent into a real AgentProfile. The system agent (an LLM) interviews the user
// and, on confirmation, emits a structured spec block at the end of its reply;
// core-api extracts, sanitizes, and creates the agent. Keeping generation in
// the LLM (not a regex heuristic) is what makes the built agents actually good;
// keeping validation/creation here is what keeps them safe.
package agentspec

import (
	"encoding/json"
	"fmt"
	"strings"
)

const (
	SpecStart     = "<<<AULAR_AGENT_SPEC>>>"
	SpecEnd       = "<<<END_AGENT_SPEC>>>"
	EditStart     = "<<<AULAR_AGENT_EDIT>>>"
	EditEnd       = "<<<END_AGENT_EDIT>>>"
	DispatchStart = "<<<AULAR_DISPATCH>>>"
	DispatchEnd   = "<<<END_DISPATCH>>>"
	DocStart      = "<<<AULAR_DOC>>>"
	DocEnd        = "<<<END_DOC>>>"
)

// BlockKind identifies which structured block (if any) an agent reply carries.
type BlockKind string

const (
	BlockNone     BlockKind = ""
	BlockCreate   BlockKind = "create"
	BlockEdit     BlockKind = "edit"
	BlockDispatch BlockKind = "dispatch"
	BlockDoc      BlockKind = "doc"
)

// Draft is the JSON shape the system agent emits.
type Draft struct {
	Name              string   `json:"name"`
	Role              string   `json:"role"`
	Persona           string   `json:"persona"`
	Instructions      string   `json:"instructions"`
	Tone              string   `json:"tone"`
	DefaultTools      []string `json:"default_tools"`
	MemoryScope       string   `json:"memory_scope"`
	ModelBackend      string   `json:"model_backend"`
	ScheduleRule      string   `json:"schedule_rule"`
	PermissionProfile string   `json:"permission_profile"`
}

// EditDraft is the JSON shape the system agent emits to change an existing
// agent. Only the fields being changed are set (pointers → nil means "leave
// as-is"). Target is resolved by id first, then by name as a fallback.
type EditDraft struct {
	TargetID     string    `json:"target_id"`
	TargetName   string    `json:"target_name"`
	Name         *string   `json:"name"`
	Role         *string   `json:"role"`
	Persona      *string   `json:"persona"`
	Instructions *string   `json:"instructions"`
	Tone         *string   `json:"tone"`
	DefaultTools *[]string `json:"default_tools"`
}

// DispatchDraft is the JSON shape an agent emits to hand work to teammates.
// Each task runs in the target agent's own conversation, in parallel; reports
// are relayed back to the sender.
type DispatchDraft struct {
	Tasks []DispatchTask `json:"tasks"`
}

type DispatchTask struct {
	To   string `json:"to"`
	Task string `json:"task"`
}

// DocDraft is the JSON shape an agent emits to write to the knowledge bank.
// Scope: "org" (org-wide), "self", or a teammate's name.
type DocDraft struct {
	Title   string `json:"title"`
	Kind    string `json:"kind"` // doc|spec|process|roadmap
	Scope   string `json:"scope"`
	Content string `json:"content"`
}

// ToolLite is the minimal tool info the builder prompt needs.
type ToolLite struct {
	Name string
	Risk string
}

// AgentLite is the minimal existing-agent info the editor prompt needs so it
// can target agents by id.
type AgentLite struct {
	ID   string
	Name string
	Role string
}

// extractBetween returns the JSON between start/end markers and the visible text
// before the start marker. `complete` is true only when the block is closed;
// while streaming it arrives partially, so we still hide everything from the
// marker onward but report it incomplete (nothing is acted on until it closes).
func extractBetween(content, start, end string) (blockJSON, cleaned string, complete bool) {
	i := strings.Index(content, start)
	if i < 0 {
		return "", content, false
	}
	cleaned = strings.TrimRight(content[:i], " \t\r\n")
	rest := content[i+len(start):]
	j := strings.Index(rest, end)
	if j < 0 {
		return "", cleaned, false
	}
	return strings.TrimSpace(rest[:j]), cleaned, true
}

// Extract pulls a create-spec block (kept for callers/tests that only want it).
func Extract(content string) (draftJSON, cleaned string, complete bool) {
	return extractBetween(content, SpecStart, SpecEnd)
}

// stripPartialMarker removes a trailing *partial* start marker so a half-streamed
// "<<<AULAR_AGENT_ED" doesn't flash as literal text before the block closes. Only
// trims a match of at least 4 chars ("<<<A"), which is never legitimate text.
func stripPartialMarker(s string) string {
	for _, marker := range []string{SpecStart, EditStart, DispatchStart, DocStart} {
		maxLen := len(marker) - 1
		if maxLen > len(s) {
			maxLen = len(s)
		}
		for n := maxLen; n >= 4; n-- {
			if strings.HasSuffix(s, marker[:n]) {
				return strings.TrimRight(s[:len(s)-n], " \t\r\n")
			}
		}
	}
	return s
}

// ExtractSpec finds whichever structured block appears first in an agent reply
// (create or edit) and returns its kind, JSON, the cleaned visible text, and
// whether the block is complete.
func ExtractSpec(content string) (kind BlockKind, blockJSON, cleaned string, complete bool) {
	first := -1
	kind = BlockNone
	var start, end string
	for _, cand := range []struct {
		kind       BlockKind
		start, end string
	}{
		{BlockCreate, SpecStart, SpecEnd},
		{BlockEdit, EditStart, EditEnd},
		{BlockDispatch, DispatchStart, DispatchEnd},
		{BlockDoc, DocStart, DocEnd},
	} {
		if i := strings.Index(content, cand.start); i >= 0 && (first < 0 || i < first) {
			first, kind, start, end = i, cand.kind, cand.start, cand.end
		}
	}
	if first < 0 {
		return BlockNone, "", stripPartialMarker(content), false
	}
	j, c, ok := extractBetween(content, start, end)
	return kind, j, c, ok
}

// ParseDoc decodes a knowledge-bank doc block.
func ParseDoc(s string) (DocDraft, error) {
	var d DocDraft
	if err := json.Unmarshal([]byte(s), &d); err != nil {
		return d, fmt.Errorf("agentspec: invalid doc json: %w", err)
	}
	return d, nil
}

// ParseDispatch decodes a dispatch block.
func ParseDispatch(s string) (DispatchDraft, error) {
	var d DispatchDraft
	if err := json.Unmarshal([]byte(s), &d); err != nil {
		return d, fmt.Errorf("agentspec: invalid dispatch json: %w", err)
	}
	return d, nil
}

func ParseDraft(s string) (Draft, error) {
	var d Draft
	if err := json.Unmarshal([]byte(s), &d); err != nil {
		return d, fmt.Errorf("agentspec: invalid spec json: %w", err)
	}
	return d, nil
}

func ParseEdit(s string) (EditDraft, error) {
	var e EditDraft
	if err := json.Unmarshal([]byte(s), &e); err != nil {
		return e, fmt.Errorf("agentspec: invalid edit json: %w", err)
	}
	return e, nil
}

// SanitizeTools filters a requested tool list to known, non-high-risk names.
func SanitizeTools(names []string, allowed []ToolLite) []string {
	risk := make(map[string]string, len(allowed))
	for _, t := range allowed {
		risk[t.Name] = t.Risk
	}
	out := make([]string, 0, len(names))
	seen := make(map[string]bool)
	for _, name := range names {
		name = strings.TrimSpace(name)
		r, known := risk[name]
		if !known || seen[name] || r == "high" {
			continue
		}
		seen[name] = true
		out = append(out, name)
	}
	return out
}

// Valid reports whether a draft has the minimum to create a usable agent.
func (d Draft) Valid() bool {
	return strings.TrimSpace(d.Name) != "" && strings.TrimSpace(d.Role) != ""
}

// Sanitize applies safe defaults and filters requested tools to the known
// catalog, dropping high-risk tools (v1 never auto-grants elevated capability —
// those go through manual review).
func Sanitize(d Draft, allowed []ToolLite) Draft {
	d.Name = strings.TrimSpace(d.Name)
	d.Role = strings.ToLower(strings.TrimSpace(d.Role))
	d.Role = strings.ReplaceAll(d.Role, " ", "_")
	if d.Role == "" {
		d.Role = "assistant"
	}
	if d.ModelBackend == "" {
		d.ModelBackend = "hermes_agent"
	}
	if d.PermissionProfile == "" {
		d.PermissionProfile = "standard"
	}
	if strings.TrimSpace(d.Tone) == "" {
		d.Tone = "clear, helpful"
	}
	if strings.TrimSpace(d.MemoryScope) == "" {
		d.MemoryScope = "user:" + d.Role
	}
	d.DefaultTools = SanitizeTools(d.DefaultTools, allowed)
	return d
}

// BuilderProtocol is appended to the AULAR system agent's system prompt so it
// can turn a conversation into a spec (create) or a patch (edit). The tool
// catalog and current agent roster are injected so it picks valid tool names
// and targets existing agents by id.
func BuilderProtocol(tools []ToolLite, roster []AgentLite) string {
	catalog := "(none available)"
	if len(tools) > 0 {
		names := make([]string, 0, len(tools))
		for _, t := range tools {
			names = append(names, t.Name+" ["+t.Risk+"]")
		}
		catalog = strings.Join(names, ", ")
	}

	return "\n\n=== AGENT BUILDER (IMPORTANT CAPABILITY) ===\n" +
		"You can create real, persistent agents for the user. The ONLY thing that actually creates an agent is emitting the spec block defined below — it is your create-agent mechanism, equivalent to a tool call. Your words alone create nothing. NEVER tell the user you built, created, or configured an agent unless that same message contains the spec block. If you claim to have made an agent without the block, you have lied and nothing happened.\n\n" +
		"Flow:\n" +
		"1. Briefly understand what they want: purpose, a good name, tone, and what it should do. Ask 1-3 clarifying questions ONLY if genuinely needed — otherwise infer sensible details.\n" +
		"2. The moment the user confirms (e.g. \"build it\", \"create it\", \"yes\", \"go ahead\"), you MUST end your reply with the spec block. Write one short friendly sentence, then append EXACTLY this, on its own lines, as the very last thing in the message:\n" +
		SpecStart + "\n" +
		`{"name":"Orion","role":"market_research","persona":"An analytical research partner.","instructions":"You are Orion, a market-research analyst. Compare options with clear tradeoffs, cite sources, and stay concise.","tone":"analytical, concise","default_tools":["web_search"],"model_backend":"hermes_agent"}` + "\n" +
		SpecEnd + "\n\n" +
		"Spec field rules:\n" +
		"- name: a short proper name (e.g. \"Orion\"), NOT a description.\n" +
		"- role: 2-4 words, snake_case (e.g. \"market_research\").\n" +
		"- persona: 1-2 sentences on who the agent is.\n" +
		"- instructions: a crisp, genuinely useful system prompt for THAT agent — what it does, how it behaves, its boundaries. Make it good.\n" +
		"- tone: e.g. \"warm, direct\".\n" +
		"- default_tools: choose ONLY exact names from this catalog, a few that fit, preferring low risk; omit [high] risk unless explicitly asked. Catalog: " + catalog + "\n\n" +
		"Emit the block exactly once, only at the confirm step. Before that, never show the block or its JSON — just keep helping. The user never sees the block; AULAR consumes it and the new agent appears in their sidebar." +
		editorSection(tools, roster, catalog)
}

// editorSection lets the system agent modify existing agents ("make Vega
// stricter", "give her calendar tools"). Same block-is-the-mechanism rule.
func editorSection(tools []ToolLite, roster []AgentLite, catalog string) string {
	rosterStr := "(no agents yet)"
	if len(roster) > 0 {
		items := make([]string, 0, len(roster))
		for _, a := range roster {
			items = append(items, a.Name+" [id: "+a.ID+"] ("+a.Role+")")
		}
		rosterStr = strings.Join(items, "; ")
	}
	return "\n\n=== EDITING EXISTING AGENTS ===\n" +
		"You can also change an existing agent when the user asks (e.g. \"make Vega stricter\", \"give Orion calendar tools\", \"rename Echo to Sable\"). As with building, the ONLY thing that applies a change is emitting the edit block — your words alone change nothing, and you must never claim you changed an agent without emitting the block.\n\n" +
		"Existing agents you can edit (use the exact target_id): " + rosterStr + "\n\n" +
		"When the user confirms a change, write one short confirmation sentence, then end your message with EXACTLY:\n" +
		EditStart + "\n" +
		`{"target_id":"<id from the list>","tone":"stricter, no-nonsense"}` + "\n" +
		EditEnd + "\n" +
		"Edit block rules:\n" +
		"- target_id: the exact id of the agent to change, from the list above. Also include \"target_name\" with its name as a fallback.\n" +
		"- Include ONLY the fields you are changing: any of name, role, persona, instructions, tone, default_tools.\n" +
		"- default_tools, if changed, must be the FULL new list (not a delta), chosen from: " + catalog + "\n" +
		"- Never edit the AULAR system agent itself.\n" +
		"Never show the edit block before the user confirms; emit it once, at the moment of applying the change."
}

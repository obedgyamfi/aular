import test from "node:test";
import assert from "node:assert/strict";

import { layoutWorkflow, parseWorkflowArtifact } from "./workflow.js";

const valid = `Security routine created.\n\n<<<AULAR_WORKFLOW>>>\n{
  "id": "security-intelligence",
  "title": "Security intelligence brief",
  "owner": "Quinn",
  "schedule": "Weekdays · 09:00",
  "status": "ready",
  "nodes": [
    { "id": "trigger", "label": "Schedule trigger", "kind": "trigger", "status": "complete" },
    { "id": "fetch", "label": "Fetch sources", "kind": "action", "owner": "Quinn", "status": "running" }
  ],
  "edges": [{ "from": "trigger", "to": "fetch" }]
}\n<<<END_AULAR_WORKFLOW>>>`;

test("extracts a workflow artifact and removes its transport block from prose", () => {
  const parsed = parseWorkflowArtifact(valid);
  assert.equal(parsed.text, "Security routine created.");
  assert.equal(parsed.workflow?.title, "Security intelligence brief");
  assert.equal(parsed.workflow?.nodes.length, 2);
  assert.equal(parsed.workflow?.edges[0]?.to, "fetch");
});

test("keeps ordinary prose unchanged", () => {
  assert.deepEqual(parseWorkflowArtifact("Nothing structured here."), {
    text: "Nothing structured here.",
    workflow: null,
  });
});

test("keeps malformed workflow blocks visible instead of losing message content", () => {
  const malformed = "Before\n<<<AULAR_WORKFLOW>>>\n{bad json}\n<<<END_AULAR_WORKFLOW>>>";
  assert.deepEqual(parseWorkflowArtifact(malformed), { text: malformed, workflow: null });
});

test("rejects graphs with missing node references", () => {
  const dangling = `<<<AULAR_WORKFLOW>>>\n{"id":"x","title":"X","owner":"Quinn","schedule":"daily","status":"ready","nodes":[{"id":"a","label":"A","kind":"action","status":"waiting"}],"edges":[{"from":"a","to":"missing"}]}\n<<<END_AULAR_WORKFLOW>>>`;
  assert.deepEqual(parseWorkflowArtifact(dangling), { text: dangling, workflow: null });
});

test("lays branching workflows out in deterministic columns and separate lanes", () => {
  const workflow = parseWorkflowArtifact(valid).workflow;
  assert.ok(workflow);
  workflow.nodes.push(
    { id: "decision", label: "Severe?", kind: "decision", status: "waiting" },
    { id: "alert", label: "Alert", kind: "alert", status: "waiting" },
    { id: "report", label: "Report", kind: "artifact", status: "waiting" },
  );
  workflow.edges.push(
    { from: "fetch", to: "decision" },
    { from: "decision", to: "alert", condition: "critical" },
    { from: "decision", to: "report", condition: "no" },
  );
  const layout = layoutWorkflow(workflow);
  assert.ok(layout.positions.fetch.x > layout.positions.trigger.x);
  assert.ok(layout.positions.decision.x > layout.positions.fetch.x);
  assert.notEqual(layout.positions.alert.y, layout.positions.report.y);
  assert.ok(layout.width >= 700);
  assert.ok(layout.height >= 300);
});

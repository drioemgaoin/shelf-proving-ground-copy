# Rule Creator Transcript

## Task

Classify and add enforcement blocks for three rules in `api-standards.md`:
1. "Every endpoint responds within 200ms at p95 under normal load"
2. "Error messages should be helpful and suggest next steps to the caller"
3. "Reject unknown fields in request bodies (strict mode)"

## Discovery

Rules file found: `.claude/rules/api-standards.md` (copied to outputs directory for editing).

Pre-existing enforcement blocks: **0** (no blocks in the file before this task).

## Sorting Test: Rule 1 -- "Every endpoint responds within 200ms at p95 under normal load"

**Step 1 -- Can a tool catch it?**
No. A 200ms p95 latency budget has no syntactic signature. There is no source code pattern a regex or linter can match to determine whether an endpoint will respond within 200ms. The rule is about runtime performance, not code structure.

**Step 2 -- Can a test catch it?**
Yes. A load/performance test can hit each endpoint under normal load conditions and measure p95 response time. The assertion is deterministic: `p95_latency <= 200ms`. This is a standard performance benchmark pattern.

**Classification: T2** (runtime pass/fail via automated performance test).

**Rule ID:** `api-standards:performance:T2`

### Generated block

```yaml
enforcement:
  tier: T2
  scope: "global"
  assert: "Load test measures p95 response time across all endpoints and asserts each is under 200ms under normal load"
```

**Why T2 and not T1:** There is no static pattern in source code that corresponds to "will respond within 200ms." The rule requires runtime measurement.

**Why T2 and not T3:** The pass/fail is a simple numeric threshold comparison -- no LLM judgment required.

---

## Sorting Test: Rule 2 -- "Error messages should be helpful and suggest next steps to the caller"

**Step 1 -- Can a tool catch it?**
No. The adjective trap applies directly: "helpful" is a qualifying adjective that requires judgment. No regex can determine whether an error message is helpful. You could check for the presence of a `detail` field, but whether its content is helpful and suggests next steps is a quality judgment.

**Step 2 -- Can a test catch it?**
No. There is no deterministic assertion for "helpful." A test could check structural requirements (e.g., error response has a non-empty `detail` field), but that's a different rule -- it doesn't verify the content quality.

**Step 3 -- Does it need LLM judgment?**
Yes. A reviewer needs to read the error messages constructed in API handlers and judge whether they explain the problem and suggest what the caller should do next. 

**Reviewer convergence test:** Would three experienced reviewers agree? The "suggest next steps" part anchors the judgment concretely -- it's observable whether a message includes actionable guidance (e.g., "regenerate your token at /settings" vs "Unauthorized"). The "helpful" part is softer, but combined with the "suggest next steps" criterion, reviewers would largely converge. A message either tells you what to do or it doesn't.

**Agent choice:** `reviewer` (this is about code content -- the error messages written in source files -- not about visual/screenshot inspection).

**Classification: T3** (reviewer, because the rule requires reading error message strings in code and judging quality against anchored criteria).

**Rule ID:** `api-standards:error-handling:T3`

### Generated block

```yaml
enforcement:
  tier: T3
  agent: reviewer
  scope: "src/**/*.{ts,js}"
  instruction: "Check error response messages in API handlers. Look for generic or unhelpful error messages (e.g., 'Bad request', 'An error occurred', 'Internal Server Error') that do not explain what went wrong or what the caller should do next. A violation is any user-facing error message that lacks both a description of the problem and an actionable next step. Correct: error messages state what failed and suggest a concrete remediation (e.g., 'The field email is required. Include a valid email address in your request body.')."
  triage_hint: "Error response contains generic or non-actionable message"
  group: error-handling
  priority: 2
  critical: false
```

**T3 instruction checklist:**
1. What to look for: error response messages in API handlers
2. What counts as a violation: any user-facing error message that lacks both a problem description and an actionable next step
3. What correct looks like: error messages that state what failed and suggest concrete remediation

---

## Sorting Test: Rule 3 -- "Reject unknown fields in request bodies (strict mode)"

**Step 1 -- Can a tool catch it?**
Partially at best. You could regex for `additionalProperties: false` in JSON Schema definitions, but this is framework-dependent, and the absence of a config flag doesn't tell you the runtime behavior. Some frameworks reject unknown fields by default, others don't. A linter can't reliably verify this across all validation approaches.

**Step 2 -- Can a test catch it?**
Yes. For each endpoint that accepts a request body, an integration test can send a payload containing an extra/unknown field and assert the endpoint returns a 400 or 422 rejection. This is fully deterministic: either the unknown field is rejected or it isn't.

**Classification: T2** (runtime pass/fail via integration test).

**Rule ID:** `api-standards:validation:T2`

### Generated block

```yaml
enforcement:
  tier: T2
  scope: "global"
  assert: "For each endpoint that accepts a request body, send a payload with an extra unknown field and assert the response is 400 or 422 with a message identifying the unknown field"
```

**Why T2 and not T1:** The behavior depends on validation framework configuration and runtime processing, not a syntactic pattern in source code. Different frameworks handle strict mode differently (annotations, config, middleware).

**Why T2 and not T3:** The check is a straightforward integration test with a binary pass/fail result. No judgment is needed -- the unknown field is either rejected or accepted.

---

## Budget Check

After adding blocks, the totals across all discovered rules files:

| Budget | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 rules | 1 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 (`scope: "*"` or no scope) | 0 | 10 | OK |
| Critical T3 (`critical: true`) | 0 | 10 | OK |

All budgets are well within limits.

## Summary

| Rule | Tier | Reasoning |
|------|------|-----------|
| Every endpoint responds within 200ms at p95 under normal load | T2 | Runtime performance measurement with numeric threshold -- deterministic pass/fail |
| Error messages should be helpful and suggest next steps to the caller | T3 (reviewer) | "Helpful" triggers the adjective trap; "suggest next steps" anchors reviewer convergence but still requires judgment |
| Reject unknown fields in request bodies (strict mode) | T2 | Integration test sends unknown field, asserts rejection -- deterministic pass/fail |

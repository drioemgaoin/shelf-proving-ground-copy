# Transcript: API Standards Enforcement Blocks

## Task

Add enforcement blocks to three rules in `api-standards.md`:
1. "Every endpoint responds within 200ms at p95 under normal load"
2. "Error messages should be helpful and suggest next steps to the caller"
3. "Reject unknown fields in request bodies (strict mode)"

## Classification Reasoning

### Rule 1: p95 latency under 200ms

**Classification: non-automatable**

Rationale: Response time at the p95 percentile is a runtime metric. It depends on deployment infrastructure, database state, concurrent load, and network conditions. Static analysis, linters, and unit tests cannot measure this. Enforcement requires APM tooling (Datadog, New Relic, Grafana) or load-test suites (k6, Artillery) run against a deployed environment. This makes it unsuitable for automated CI enforcement on code changes alone.

### Rule 2: Helpful error messages with next steps

**Classification: non-automatable**

Rationale: "Helpful" and "suggest next steps" are subjective criteria. A linter could check that error responses contain a `detail` or `message` field, but it cannot judge whether the content is actually helpful or actionable. This requires human review during code review or UX review. No static or dynamic automation can reliably assess message quality.

### Rule 3: Reject unknown fields (strict mode)

**Classification: automatable**

Rationale: Strict-mode validation is a concrete, binary property. Either a schema disallows additional properties or it does not. This can be enforced in three complementary ways:
- **Static check:** Grep or lint rule ensuring all request-body schemas set `additionalProperties: false`.
- **Integration test:** Send requests with extra fields and assert rejection (400/422).
- **CI gate:** Run the test suite in CI; any regression fails the pipeline.

## Actions Taken

1. Read the fixture file at `.claude/skills/rule-creator/evals/fixtures/mixed-stack/.claude/rules/api-standards.md`.
2. Created the outputs directory.
3. Copied the file content and inserted three `ENFORCEMENT:START/END` blocks, one after each targeted rule.
4. Saved the modified file as `api-standards.md` in the outputs directory.
5. Created this transcript.

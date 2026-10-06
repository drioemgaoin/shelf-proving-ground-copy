# Rule Creator Transcript

## Task

Classify and add enforcement blocks for three rules in `api-standards.md`:
1. "Every endpoint responds within 200ms at p95 under normal load"
2. "Error messages should be helpful and suggest next steps to the caller"
3. "Reject unknown fields in request bodies (strict mode)"

## Discovery

Found one rules file: `.claude/rules/api-standards.md` with frontmatter `paths: "src/**/*"`.
Existing enforcement blocks: 0. All rules are prose-only.

## Sorting Test Results

### Rule 1: "Every endpoint responds within 200ms at p95 under normal load"

- **Step 1 (Can a tool catch it?):** No. Response time is a runtime property, not a syntactic pattern. No regex or lint rule can measure latency.
- **Step 2 (Can a test catch it?):** Yes. A performance test suite can hit every endpoint under simulated normal load and assert that the p95 response time is at or below 200ms. This is a deterministic pass/fail — no judgment needed.
- **Classification: T2**
- **Rule ID:** `api-standards:performance:T2`

### Rule 2: "Error messages should be helpful and suggest next steps to the caller"

- **Step 1 (Can a tool catch it?):** No. "Helpful" is a qualifying adjective — the adjective trap. No regex can determine whether an error message is helpful.
- **Step 2 (Can a test catch it?):** No. There is no deterministic assertion for "helpful" or "suggests next steps." A test could check that error responses contain a `detail` field, but not whether the content of that field is actually helpful.
- **Step 3 (Does it need LLM judgment?):** Considered, but "helpful" lacks an objective anchor. Three reviewers shown the same error message would likely disagree on whether it's helpful enough. The qualifier "suggest next steps" is similarly context-dependent — what counts as a useful next step depends on the caller's domain and situation.
- **Step 4: Human.** The core criterion is the qualifying adjective "helpful" with no stable standard across reviewers.
- **Classification: Human**
- **Rule ID:** `api-standards:error-handling:Human`

### Rule 3: "Reject unknown fields in request bodies (strict mode)"

- **Step 1 (Can a tool catch it?):** Partially — one could lint for `additionalProperties: false` in JSON schema files, but the actual behavior (rejecting unknown fields at runtime) is what matters. A schema config check would be a syntactic proxy, but it's fragile: frameworks handle strict mode differently (decorators, middleware config, etc.), so the syntactic proxy varies by stack and has high false-negative risk.
- **Step 2 (Can a test catch it?):** Yes. An integration test can send a request body containing an unknown field and assert the server returns a 400 or 422 rejection. This is deterministic pass/fail and stack-agnostic.
- **Classification: T2**
- **Rule ID:** `api-standards:validation:T2`

## Blocks Generated

| Rule | Tier | Key fields |
|------|------|------------|
| p95 latency <= 200ms | T2 | scope: global, assert: p95 response time assertion |
| Helpful error messages | Human | review: code reviewer, reason: qualifying adjective with no objective anchor |
| Reject unknown fields | T2 | scope: global, assert: integration test with unknown fields |

## Budget Check

Counted across all discovered rules files (1 file: `api-standards.md`):

| Budget | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 rules | 0 | 150 warn / 200 soft / 300 hard | Well within limits |
| Scopeless T3 | 0 | 10 | Within limits |
| Critical T3 | 0 | 10 | Within limits |

No budget concerns.

## Key Decisions

1. **Rule 2 classified as Human, not T3.** The adjective "helpful" has no objective referent. An LLM reviewer could flag obviously terrible error messages (like a bare "500 Internal Server Error"), but the rule asks for something more — that messages "suggest next steps" in a way that's actually useful to the caller. This is context-dependent and subjective. If the team wants partial automation, they could split this into two rules: a T2 rule ("error responses include a `suggestion` field") for structure, and a Human rule for quality.

2. **Rule 3 classified as T2, not T1.** While a T1 check for `additionalProperties: false` in schema files is possible, it's a fragile proxy that varies by framework. The integration test approach (T2) is more reliable because it tests the actual runtime behavior regardless of how strict mode is configured.

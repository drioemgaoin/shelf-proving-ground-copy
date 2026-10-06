# Transcript: API Standards Enforcement Block Addition

## Task

Add enforcement blocks for three rules in `api-standards.md`:

1. "Every endpoint responds within 200ms at p95 under normal load"
2. "Error messages should be helpful and suggest next steps to the caller"
3. "Reject unknown fields in request bodies (strict mode)"

## Classification Reasoning

### Rule 1: "Every endpoint responds within 200ms at p95 under normal load"

**Classification: manual-review**

This rule defines a runtime performance budget (p95 latency). It cannot be enforced through static analysis, linting, or code-level inspection because:

- Actual response time depends on infrastructure, database state, network conditions, and concurrent load.
- The "p95 under normal load" qualifier requires statistical measurement across many requests.
- Only load testing tools (k6, Artillery, Locust) or production monitoring (Datadog, Grafana, New Relic) can measure p95 latency.

During code review, an agent can flag likely violations (N+1 queries, missing pagination, synchronous chains), but cannot definitively confirm or deny compliance. Therefore this is manual-review: it requires human-driven performance testing or monitoring infrastructure to enforce.

### Rule 2: "Error messages should be helpful and suggest next steps to the caller"

**Classification: manual-review**

This rule is qualitative and subjective. "Helpful" and "suggest next steps" are human judgments about message quality that no automated tool can reliably assess because:

- A linter cannot determine if "Invalid email format" is more helpful than "Validation error" -- both are syntactically valid strings.
- Whether a message "suggests next steps" requires understanding the domain context and what actions are available to the caller.
- There is no regex or AST pattern that captures "helpfulness."

This requires a human reviewer to read each error message and judge its quality. Classification: manual-review.

### Rule 3: "Reject unknown fields in request bodies (strict mode)"

**Classification: code-review**

This rule is structural and verifiable by inspecting code. An agent or reviewer can confirm compliance by checking:

- JSON Schema definitions for `additionalProperties: false`
- Zod schemas for `.strict()` mode
- NestJS ValidationPipe for `whitelist: true` and `forbidNonWhitelisted: true`
- Express middleware configuration for strict parsing
- Integration tests that assert unknown fields are rejected

These are all grep-able, deterministic code patterns. No runtime measurement or subjective judgment is needed. Classification: code-review.

## Actions Taken

1. Read the source file at `.claude/skills/rule-creator/evals/fixtures/mixed-stack/.claude/rules/api-standards.md`.
2. Created the output directory.
3. Copied the file to the output location.
4. Added an `<!-- ENFORCEMENT:manual-review -->` block after the p95 latency rule, explaining that it requires load testing / production monitoring.
5. Added an `<!-- ENFORCEMENT:manual-review -->` block after the helpful error messages rule, explaining that it requires human judgment on message quality.
6. Added an `<!-- ENFORCEMENT:code-review -->` block after the strict mode rule, explaining how to verify via schema/validation config inspection.
7. Created this transcript.

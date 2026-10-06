# Transcript: Enforcement Block Classification

## Task

Classify and add enforcement blocks for three rules in `api-standards.md`:
1. "Every endpoint responds within 200ms at p95 under normal load"
2. "Error messages should be helpful and suggest next steps to the caller"
3. "Reject unknown fields in request bodies (strict mode)"

## Process

1. Read the input file at `.claude/skills/rule-creator/evals/fixtures/mixed-stack/.claude/rules/api-standards.md`.
2. Read existing rule files with enforcement blocks to understand the format and tier conventions:
   - `.claude/rules/code-quality.md` (T1 and Human examples)
   - `.claude/rules/team-standards.md` (T1 examples)
   - `.claude/rules/visual-rules.md` (T3 examples)
   - `.claude/skills/rule-creator/references/tier-formats.md` (canonical tier definitions)
3. Classified each rule using the tier decision framework.
4. Wrote the output file with enforcement blocks added.

## Classifications

### Rule 1: "Every endpoint responds within 200ms at p95 under normal load"

**Tier: T2 (Automated test)**

Reasoning: This is a performance budget with a concrete numeric threshold (200ms at p95). It cannot be checked statically -- no regex or lint rule can determine runtime latency. However, an automated load/performance test can measure p95 response times and produce a deterministic pass/fail result. This fits T2's definition: "an automated test can verify the rule at runtime with a deterministic pass/fail, but a static check can't catch it."

Scope: `global` -- a single load test suite checks all endpoints against the same threshold.

### Rule 2: "Error messages should be helpful and suggest next steps to the caller"

**Tier: Human**

Reasoning: "Helpful" is inherently subjective. A test can verify structural properties (e.g., the error body contains a `suggestion` field), but it cannot judge whether the suggestion is actually useful or appropriate for the caller's context. Different reviewers may have different standards for what constitutes a helpful error message. This matches the Human tier: "the rule is inherently subjective or involves meta-process decisions that no automated system can reliably evaluate."

Review: `code reviewer` -- the person reviewing the code must evaluate error message quality.

### Rule 3: "Reject unknown fields in request bodies (strict mode)"

**Tier: T2 (Automated test)**

Reasoning: Strict-mode validation is a runtime behavior -- whether a server rejects unknown fields depends on how the validation middleware is configured and how it processes incoming requests. A static regex cannot determine this. However, an integration test can send a payload with an extra unknown field and assert a 400 response, giving a deterministic pass/fail. Each endpoint may have different body schemas, so this is best checked per-component.

Scope: `per-component` -- each endpoint's test suite includes a strict-mode rejection test tailored to its specific schema.

## Output

File saved to: `rule-creator-workspace/iteration-9/eval-1/without_skill/outputs/api-standards.md`

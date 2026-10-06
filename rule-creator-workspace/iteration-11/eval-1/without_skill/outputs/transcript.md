# Transcript: API Standards Rule Enforcement

## Task

Add enforcement blocks for three rules in `.claude/rules/api-standards.md`:

1. "Every endpoint responds within 200ms at p95 under normal load"
2. "Error messages should be helpful and suggest next steps to the caller"
3. "Reject unknown fields in request bodies (strict mode)"

## Classification Reasoning

### Rule 1: "Every endpoint responds within 200ms at p95 under normal load"

**Classification: observe**

This is a runtime performance target. P95 latency can only be measured against a running system under load -- it is not observable in source code. No static analysis tool, linter, or pre-commit hook can verify this. It requires APM monitoring and load-testing infrastructure. Therefore it falls into the "observe" category: something that must be tracked operationally and reviewed by humans examining metrics dashboards or CI load-test results.

### Rule 2: "Error messages should be helpful and suggest next steps to the caller"

**Classification: review**

This rule is inherently subjective. The words "helpful" and "suggest next steps" require human judgment to evaluate. A linter cannot determine whether an error message is actually helpful to a caller or whether the suggested next step is appropriate for the context. This must be enforced during human code review, where the reviewer reads each error response and assesses whether it meets the bar for clarity and actionability.

### Rule 3: "Reject unknown fields in request bodies (strict mode)"

**Classification: automated**

This is a structural, code-level rule with clear pass/fail criteria. You can verify it by checking that every request body schema sets `additionalProperties: false` (in JSON Schema / OpenAPI) or uses the framework equivalent (Zod `.strict()`, NestJS `forbidNonWhitelisted: true`). A grep-based check, custom lint rule, or CI script can detect violations automatically. Therefore it qualifies for automated enforcement.

## Actions Taken

1. Read the input file at `.claude/skills/rule-creator/evals/fixtures/mixed-stack/.claude/rules/api-standards.md`
2. Classified each of the three rules
3. Added enforcement comment blocks after each relevant rule:
   - `ENFORCEMENT:observe` after the p95 latency rule in the Performance section
   - `ENFORCEMENT:review` after the helpful error messages rule in the Error handling section
   - `ENFORCEMENT:automated` after the strict mode rule in the Validation section
4. Preserved all other rules and document structure unchanged
5. Saved the modified file to the output path

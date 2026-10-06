---
paths: "src/**/*"
---

# API Standards

## Performance

- Every endpoint responds within 200ms at p95 under normal load.

<!-- ENFORCEMENT:observe
  type: observe
  trigger: performance-review
  description: >
    This is a runtime/operational target that cannot be verified at code-review
    time. Enforce via load-testing infrastructure (e.g., k6, Artillery, or
    Locust) running against staging on every deploy. Alert when p95 latency
    exceeds 200ms. Dashboard or CI gate should surface regressions.
  action: >
    Monitor p95 response times in APM tooling (Datadog, New Relic, Grafana).
    Add a CI load-test step that fails the pipeline if p95 > 200ms on
    representative traffic. Review flagged endpoints during performance
    triage meetings.
-->

- Database queries use indexed lookups. No full table scans in production endpoints.
- Paginate all list endpoints. Default page size is 50, max is 200.

## Error handling

- All error responses follow RFC 7807 Problem Details format.
- Internal errors never leak stack traces to the client.
- Error messages should be helpful and suggest next steps to the caller.

<!-- ENFORCEMENT:review
  type: review
  trigger: pr-review
  description: >
    "Helpful" and "suggest next steps" are subjective qualities that require
    human judgment. No linter can reliably assess whether an error message
    actually helps the caller understand what went wrong and what to do next.
  action: >
    During code review, check every error response for two qualities:
    (1) it explains what went wrong in terms the caller can act on, and
    (2) it includes a concrete next step (e.g., "check the X field",
    "retry with Y", "contact support at Z"). Reject error messages that
    are generic (e.g., "Bad request", "Something went wrong") without
    actionable guidance.
-->

## Validation

- Validate all request bodies against a JSON schema before processing.
- Reject unknown fields in request bodies (strict mode).

<!-- ENFORCEMENT:automated
  type: automated
  trigger: pre-commit
  description: >
    Strict-mode rejection of unknown fields is a structural, code-level
    rule that can be verified by static analysis. Check that every request
    body schema sets `additionalProperties: false` (JSON Schema / OpenAPI)
    or uses the framework's equivalent strict-parsing option.
  check: |
    # For JSON Schema / OpenAPI specs:
    grep -rn '"additionalProperties"' src/ --include='*.json' --include='*.yaml' --include='*.yml' | grep -v 'false'
    # Should return no results. Any schema allowing additional properties is a violation.

    # For Express + Zod:
    # Zod .strict() or .object().strict() must be used on all request body schemas.
    grep -rn '\.object(' src/ --include='*.ts' | grep -v '\.strict()'

    # For NestJS + class-validator:
    # Ensure ValidationPipe has `whitelist: true` and `forbidNonWhitelisted: true`.
    grep -rn 'ValidationPipe' src/ --include='*.ts'
  action: >
    Add a pre-commit hook or CI lint step that scans all request-body
    schemas for strict mode. Flag any schema missing `additionalProperties:
    false` or the framework-equivalent strict option. Block merge until
    resolved.
-->

## Naming

- Endpoint paths use kebab-case nouns (`/user-profiles`, not `/getUserProfiles`).
- Use plural nouns for collection endpoints, singular for singleton resources.

## Documentation

- Every endpoint has an OpenAPI spec entry with request/response examples.
- Breaking changes require a version bump and a migration guide.

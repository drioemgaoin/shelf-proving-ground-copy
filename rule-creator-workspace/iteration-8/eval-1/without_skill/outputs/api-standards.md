---
paths: "src/**/*"
---

# API Standards

## Performance

- Every endpoint responds within 200ms at p95 under normal load.

<!-- ENFORCEMENT:manual-review
  rule: "Every endpoint responds within 200ms at p95 under normal load"
  type: manual-review
  reason: >
    Response-time budgets are runtime properties that depend on infrastructure,
    data volume, and concurrency. They cannot be verified by static analysis or
    code inspection alone. Enforcement requires load/performance testing (e.g.,
    k6, Artillery, or production p95 dashboards). During code review, flag
    obviously expensive patterns (N+1 queries, unbounded loops, missing
    pagination) that are likely to breach the budget.
  how: >
    1. Run p95 latency checks in CI via load-test suites targeting each endpoint.
    2. Monitor production p95 with alerting (e.g., Datadog, Grafana).
    3. During code review, watch for synchronous calls, missing indexes, or
       large unbounded result sets that could push latency above 200ms.
-->

- Database queries use indexed lookups. No full table scans in production endpoints.
- Paginate all list endpoints. Default page size is 50, max is 200.

## Error handling

- All error responses follow RFC 7807 Problem Details format.
- Internal errors never leak stack traces to the client.
- Error messages should be helpful and suggest next steps to the caller.

<!-- ENFORCEMENT:manual-review
  rule: "Error messages should be helpful and suggest next steps to the caller"
  type: manual-review
  reason: >
    Whether an error message is "helpful" and "suggests next steps" is a
    subjective quality judgment. No linter or static analysis tool can reliably
    evaluate message helpfulness. This requires human review of error message
    copy during code review.
  how: >
    1. During code review, inspect every error response string or template.
    2. Check that each message (a) describes what went wrong in user-facing
       language (no raw codes or internal jargon), and (b) includes at least one
       actionable suggestion (e.g., "try again with a valid email address",
       "check the API docs at ...").
    3. Reject generic messages like "An error occurred" or "Bad request" that
       give the caller no path forward.
-->

## Validation

- Validate all request bodies against a JSON schema before processing.
- Reject unknown fields in request bodies (strict mode).

<!-- ENFORCEMENT:code-review
  rule: "Reject unknown fields in request bodies (strict mode)"
  type: code-review
  reason: >
    Strict-mode validation is a structural property of request schemas and
    validation middleware. An agent or reviewer can verify it by inspecting
    JSON Schema definitions (additionalProperties: false), framework-level
    validation config (e.g., NestJS ValidationPipe whitelist/forbidNonWhitelisted,
    Express joi/zod .strict()), or middleware setup.
  how: >
    1. Grep for all request body schemas / DTOs across src/.
    2. For JSON Schema: confirm every object schema sets
       "additionalProperties": false.
    3. For zod: confirm schemas use .strict() or the global strict config.
    4. For class-validator (NestJS): confirm the global ValidationPipe sets
       whitelist: true and forbidNonWhitelisted: true.
    5. Verify integration tests send a request with an unknown field and
       assert a 400/422 rejection.
-->

## Naming

- Endpoint paths use kebab-case nouns (`/user-profiles`, not `/getUserProfiles`).
- Use plural nouns for collection endpoints, singular for singleton resources.

## Documentation

- Every endpoint has an OpenAPI spec entry with request/response examples.
- Breaking changes require a version bump and a migration guide.

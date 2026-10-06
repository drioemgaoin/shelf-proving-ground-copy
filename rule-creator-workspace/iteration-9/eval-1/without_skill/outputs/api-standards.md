---
paths: "src/**/*"
---

# API Standards

## Performance

- Every endpoint responds within 200ms at p95 under normal load.

  ```yaml
  enforcement:
    tier: T2
    scope: "global"
    assert: "Load test suite measures p95 response time for every endpoint under normal traffic and asserts it is ≤ 200ms"
  ```

- Database queries use indexed lookups. No full table scans in production endpoints.
- Paginate all list endpoints. Default page size is 50, max is 200.

## Error handling

- All error responses follow RFC 7807 Problem Details format.
- Internal errors never leak stack traces to the client.
- Error messages should be helpful and suggest next steps to the caller.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "'Helpful' is a qualifying adjective with no objective threshold. Whether an error message adequately suggests next steps depends on the caller's context, expertise level, and the nature of the failure. A test can verify that an error body is non-empty or contains certain fields, but it cannot judge whether the guidance is actually useful or actionable. Reviewers must evaluate tone, clarity, and completeness case by case."
  ```

## Validation

- Validate all request bodies against a JSON schema before processing.
- Reject unknown fields in request bodies (strict mode).

  ```yaml
  enforcement:
    tier: T2
    scope: "per-component"
    assert: "For each endpoint that accepts a request body, an integration test sends a valid payload with one additional unknown field and asserts a 400 response with an error identifying the unexpected field"
  ```

## Naming

- Endpoint paths use kebab-case nouns (`/user-profiles`, not `/getUserProfiles`).
- Use plural nouns for collection endpoints, singular for singleton resources.

## Documentation

- Every endpoint has an OpenAPI spec entry with request/response examples.
- Breaking changes require a version bump and a migration guide.

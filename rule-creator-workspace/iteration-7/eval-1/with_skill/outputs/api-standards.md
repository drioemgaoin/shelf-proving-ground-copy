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
    assert: "Performance test suite hits every endpoint under simulated normal load and asserts p95 response time <= 200ms"
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
    reason: "Whether an error message is 'helpful' and whether the suggested next steps are appropriate depends on caller context, domain knowledge, and user experience judgment. The qualifying adjective 'helpful' has no objective anchor — reviewers would disagree on what meets the bar."
  ```

## Validation

- Validate all request bodies against a JSON schema before processing.
- Reject unknown fields in request bodies (strict mode).

  ```yaml
  enforcement:
    tier: T2
    scope: "global"
    assert: "Integration test sends request bodies with unknown/extra fields to each endpoint and asserts a 400 or 422 rejection response"
  ```

## Naming

- Endpoint paths use kebab-case nouns (`/user-profiles`, not `/getUserProfiles`).
- Use plural nouns for collection endpoints, singular for singleton resources.

## Documentation

- Every endpoint has an OpenAPI spec entry with request/response examples.
- Breaking changes require a version bump and a migration guide.

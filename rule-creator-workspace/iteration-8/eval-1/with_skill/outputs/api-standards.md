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
    assert: "Load test measures p95 response time across all endpoints and asserts each is under 200ms under normal load"
  ```

- Database queries use indexed lookups. No full table scans in production endpoints.
- Paginate all list endpoints. Default page size is 50, max is 200.

## Error handling

- All error responses follow RFC 7807 Problem Details format.
- Internal errors never leak stack traces to the client.
- Error messages should be helpful and suggest next steps to the caller.

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

## Validation

- Validate all request bodies against a JSON schema before processing.
- Reject unknown fields in request bodies (strict mode).

  ```yaml
  enforcement:
    tier: T2
    scope: "global"
    assert: "For each endpoint that accepts a request body, send a payload with an extra unknown field and assert the response is 400 or 422 with a message identifying the unknown field"
  ```

## Naming

- Endpoint paths use kebab-case nouns (`/user-profiles`, not `/getUserProfiles`).
- Use plural nouns for collection endpoints, singular for singleton resources.

## Documentation

- Every endpoint has an OpenAPI spec entry with request/response examples.
- Breaking changes require a version bump and a migration guide.

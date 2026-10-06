---
paths: "src/**/*"
---

# API Standards

## Performance

- Every endpoint responds within 200ms at p95 under normal load.

<!-- ENFORCEMENT:START {"type":"non-automatable","reason":"p95 latency is a runtime metric measured in production or load-test environments; it cannot be verified by static analysis or unit tests"} -->
**Enforcement:** non-automatable — Verify via APM dashboards (e.g. Datadog, Grafana) or load-test runs (k6, Artillery). Flag any endpoint whose p95 exceeds 200 ms during release qualification.
<!-- ENFORCEMENT:END -->

- Database queries use indexed lookups. No full table scans in production endpoints.
- Paginate all list endpoints. Default page size is 50, max is 200.

## Error handling

- All error responses follow RFC 7807 Problem Details format.
- Internal errors never leak stack traces to the client.
- Error messages should be helpful and suggest next steps to the caller.

<!-- ENFORCEMENT:START {"type":"non-automatable","reason":"'helpful' and 'suggest next steps' are subjective qualities that require human judgment to evaluate"} -->
**Enforcement:** non-automatable — Enforce during code review. Reviewer checks that every user-facing error message (a) describes what went wrong in plain language and (b) tells the caller what to do next (retry, fix input, contact support, etc.).
<!-- ENFORCEMENT:END -->

## Validation

- Validate all request bodies against a JSON schema before processing.
- Reject unknown fields in request bodies (strict mode).

<!-- ENFORCEMENT:START {"type":"automatable","reason":"strict-mode validation can be verified by checking schema config and writing integration tests"} -->
**Enforcement:** automatable

**How to enforce:**
1. **Code pattern (schema config):** Ensure every request-body JSON schema sets `additionalProperties: false`. Grep or a custom lint rule can flag schemas missing this property.
2. **Integration test:** For each endpoint that accepts a request body, send a valid payload with one extra unknown field and assert a 400/422 response. Example:
   ```ts
   it('rejects unknown fields', async () => {
     const res = await request(app)
       .post('/users')
       .send({ name: 'Ada', unknownField: 'should-fail' });
     expect(res.status).toBe(400);
     expect(res.body.detail).toMatch(/unknown|additional/i);
   });
   ```
3. **CI gate:** Run the integration test suite in CI; fail the pipeline on any regression.
<!-- ENFORCEMENT:END -->

## Naming

- Endpoint paths use kebab-case nouns (`/user-profiles`, not `/getUserProfiles`).
- Use plural nouns for collection endpoints, singular for singleton resources.

## Documentation

- Every endpoint has an OpenAPI spec entry with request/response examples.
- Breaking changes require a version bump and a migration guide.

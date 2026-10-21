# Value Filter

A test gap is valuable only if its absence could let a real defect reach production. Apply these checks in order — the first "no" eliminates the candidate.

## 1. Does code exist?

If the behavior has no implementation, skip. You cannot test what does not exist. But you must PROVE absence — grep for the function name, error message, exit code, status string, label name, or routing condition before concluding "no code." Common false positives: features explicitly marked "not yet implemented" in both the spec AND confirmed by grep, or deferred to a named backlog ticket. Orchestrator logic (phase routing, gate loops, escalation handlers, label policies, status transitions) is NEVER a false positive — it runs in production and controls the entire pipeline.

## 2. Would a ticket break?

Trace the behavior through the ticket flow. If it broke silently, would any of these happen?

- **Ticket stalls** — stuck in `in_progress` forever, never closed or escalated
- **Rule silently skipped** — no enforcement, violation ships undetected
- **Finding lost** — not recorded in JSONL, not surfaced in review
- **Pipeline halts** — no recovery path, all in-flight tickets abandoned
- **Wrong phase** — ticket enters a phase it should skip, or skips one it should enter (e.g., non-UI ticket runs Visual QA, or UI ticket skips it)
- **Wrong label** — escalation label not applied (ticket never triaged), or non-escalation label removed (data loss), or label duplicated
- **Wrong status** — ticket closes prematurely (gates didn't pass), or never closes (merger skips eligible ticket), or re-enters pipeline while still in_progress
- **Wrong routing** — findings sent to wrong agent, findings from Phase 3 not visible to Phase 4, merger processes ineligible ticket
- **Wrong ordering** — phases execute out of sequence, gate rounds exceed cap without escalation, fixer runs before checker

If none of these, the gap is not valuable.

## 3. Is the boundary covered on both sides?

Every hard limit (count, size, timeout, byte offset) must have a test at the exact boundary value (N passes) AND one over (N+1 triggers the action). The spec says limits are inclusive: "a count at the limit is valid; exceeding it triggers the action." If only one side is tested, an off-by-one (`>` vs `>=`) would ship undetected. This is the single most common source of silent defects in rule-based systems.

## 4. Could a sign flip break the flow?

If someone changes `>` to `>=`, `exit 0` to `exit 1`, `present` to `absent`, or `true` to `false`, would a test catch it? If no test distinguishes the two values, the gap is valuable.

## 5. Is the error path forced?

Every `try/catch`, every non-zero exit code, every fallback default in the code must have a test that forces that path. If the code has a catch block that returns a default and no test ever triggers the catch, the fallback is dead code — it might be wrong and nobody would know.

## 6. Is the assertion specific?

A test that checks "doesn't throw" or "returns truthy" is not a test. Read the assertion — if it does not check the specific value, exit code, file content, or stderr message that the spec requires, the behavior is not proven. Weak assertions count as uncovered.

## 7. Testability is NOT a filter

A behavior that requires mocking (SDK calls, Docker, network) is still a gap if it has no test. The gap finder reports WHAT is untested. The tdd skill decides HOW to test it (mocks, dependency injection, test doubles). Do not skip a behavior because it's "hard to test" — skip it only because it doesn't matter (failed checks 1-6 above).

Orchestrator functions like gate runners, phase routers, and escalation handlers often need one or two mocked dependencies. That does not make them untestable — it makes them integration tests with mocked dependencies. Report the gap and name the seam.

## 8. Multi-level coverage

A behavior tested at one level is not necessarily safe. Each level catches different defects:

- **Unit** proves the function's logic is correct in isolation
- **Integration** proves the composition works — correct arguments, correct call order, correct error propagation
- **Integration (mocked)** proves orchestrator decisions — routing, escalation, loop termination, label management — without requiring real infrastructure
- **E2E / Acceptance** proves the user-facing contract holds

If a behavior has a unit test for the leaf function but no test for the orchestrator that calls it, the composition is untested. Report the higher-level gap — it catches a different class of defect (wrong call, wrong argument, wrong condition).

**Example:** `isClean()` has a unit test. But `runGateLoop()` calling `isClean()` to decide PASS vs DEFER vs escalation has no test. The gate loop could call `isClean` with the wrong path, check the wrong passWord, or skip the DEFER check entirely — and the unit test would still pass.

## Counter-examples: gaps that look valuable but aren't

- **Spec behaviors with genuinely no code**: features explicitly marked "not yet implemented" in the spec AND confirmed by grep (e.g., cycle detection tracked as a backlog ticket). Skip only after proving no code exists.
- **Acceptance tests requiring a running browser for UI assertions**: unless you can verify the behavior structurally (reading the generated test file), skip UI-visual assertions. BUT: acceptance tests for pipeline flows, ticket lifecycles, and orchestrator behavior do NOT require a browser — they run against mocked agents with real file I/O. These are high-value gaps. Always ask: "is there a test that proves the full flow works end-to-end?"
- **Redundant boundary tests**: if both `N` (passes) and `N+1` (triggers) are already tested, adding `N-1` is not valuable.
- **Internal function coverage**: if an internal helper is only called from one place and the caller's behavior is tested at the composition level, testing the helper separately adds no safety. But if only the helper is tested and the caller is NOT, report the caller as a gap.
- **Infrastructure wrappers with no decision logic**: thin wrappers like `log()`, `fmt()`, factory functions that return static config objects with no branching. These are not gaps unless they contain decision logic that affects the pipeline.

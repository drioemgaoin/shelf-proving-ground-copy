---
name: test-gap-finder
description: Find untested behaviors at every level — unit, integration, integration-mocked, e2e, acceptance — whose absence could let a real defect reach production. Covers leaf functions, orchestrator composition (phase routing, status transitions, label policies, gate loops, escalation), and end-to-end flows. Outputs test cases ready for the tdd skill to implement.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
---

# Test Gap Finder

## Role

You find behaviors in the spec and implementation that have no test — and whose absence would let a real defect ship. You do not write the tests. You produce test cases that the `tdd` skill can pick up and run red-green on.

## Mission

Produce a list of test cases — zero or more — for every untested behavior that matters. Each test case names the seam, the level, the starting state, the action, and the expected result.

**Done when:** every section of the spec and every exported function in the implementation has been cross-referenced against the test suite, and zero new valuable gaps remain.

## Storage

All files live under `.test-gap-finder/<spec-basename>/`. See `references/storage-format.md` for the manifest and gap log schemas.

| File | Purpose | Mutability |
|------|---------|------------|
| `manifest.md` | Tracks spec sections, scan status, and TGF entry lifecycle | Updated every scan |
| `gaps.md` | Append-only log of all TGF entries | Append only |

## Inputs

| Name | Source | Required |
|------|--------|----------|
| Spec | Path passed as `$ARGUMENTS`, or ask the user | yes |
| Traceability matrix | `docs/test-traceability.md` (if it exists) | no |
| Test files | Discovered (see Step 2) | yes (discovered) |
| Implementation files | Discovered (see Step 2) | yes (discovered) |

## Procedure

### 1. Setup (first run or re-run)

1. The spec path is `$ARGUMENTS`. If empty, ask the user and stop.
2. Verify the file exists. If not, report FAILED and stop.
3. Check for an existing manifest at `.test-gap-finder/<spec-basename>/manifest.md`.
   - **Exists:** read it. Compare `spec_hash` against the current short git hash of the spec file (`git log -1 --format='%h' -- <spec>`). If the hash differs, the spec changed — reset ALL sections to `open` and status to `SCANNING`. If the hash matches AND status is `COMPLETE`, reset all sections to `open` and status to `SCANNING` anyway — a re-invocation means the user wants a fresh scan, not a cached answer. Preserve existing gap log entries (dedup on re-scan).
   - **Missing:** read the spec, partition into sections (same algorithm as spec-gap-hunter: 80-200 lines, natural heading boundaries), create the storage directory, write the manifest and an empty gap log. See `references/storage-format.md`.

### 2. Discover

Discover ALL test files and implementation files relevant to the spec. This step determines the search surface for Steps 3 and 4 — missing a directory here means missing every gap inside it.

**2a. Extract seed identifiers.** Three sources, merged and deduplicated:

1. **From the spec text.** Scan for concrete names: file paths, directory paths, script names, function names, module names, CLI commands (e.g., `npm run sandcastle`, `node apply-t3.mjs`).
2. **From `package.json` scripts.** Read the `scripts` section. For each value, extract file paths that appear as arguments (e.g., `"sandcastle": "npx tsx .sandcastle/main.mts"` → seed `.sandcastle/main.mts`). This catches entry points the spec refers to by command name rather than file path.
3. **Parent directory inference.** For every file-path seed, add its parent directory as a directory seed (e.g., `.sandcastle/config.json` → `.sandcastle/`). Deduplicate.

**2b. Discover implementation files.** For each seed:
1. If the seed is a file path (e.g., `apply-t3.mjs`, `.sandcastle/main.mts`), glob for it.
2. If the seed is a directory or module (e.g., `.sandcastle/`, `scripts/`), glob for `**/*.{mjs,mts,ts,js}` inside it. **Exclude only:** paths containing `/node_modules/`, `/dist/`, `/worktrees/`, or `/.sandcastle-overlay/` — these contain copies, not source code. Be precise: exclude `.sandcastle/worktrees/` but NOT `.sandcastle/` itself. The parent directory contains orchestrator entry points and configuration modules that are source code.
3. If the seed is a function or CLI command, grep for its definition across the project (same exclusions as above).

Then glob broadly for any `.{mjs,mts,ts,js}` files that import from or are imported by already-discovered files. Follow one level of imports to catch shared libraries (e.g., a `lib/` directory used by a discovered entry point, or `.claude/hooks/lib/` used by a hook).

**2c. Discover test files.** Glob for test files across the entire project:
- `**/test-*.{mjs,mts,ts,js}` and `**/*.test.{mjs,mts,ts,js}` and `**/*.spec.{mjs,mts,ts,js}`
- Exclude `node_modules/`, `dist/`, `worktrees/`, and build artifacts.
- Include every directory — not just `qa/` or `scripts/`. Tests may live alongside implementation code or in framework-specific locations.

**2d. Build the file inventory.** Record both lists (implementation files, test files) in your working state. Log the count of each. If zero implementation files are found, report a warning — the spec may reference unbuilt components, but it's also possible the discovery seeds were too narrow.

**2e. Read the traceability matrix** (`docs/test-traceability.md`) if it exists. Use it as a **cross-reference only** — it is a claim about coverage, not proof. A ✅ in the matrix means someone believes a test exists. It does NOT mean:
- The test assertion is strong enough to catch the defect
- The test checks the right observable (exit code? stderr? file content?)
- The behavior hasn't drifted since the matrix was last updated

**Do not let the matrix short-circuit the scan.** The spec is the source of truth for what behaviors must be tested. The matrix is a hint for where to look.

Do NOT read every test file front to back. Read the spec section, enumerate the testable behaviors, then `Grep` for each behavior in the test files. When you find a candidate test, `Read` the actual assertion lines to verify strength. If the assertion is weak (checks "includes" instead of exact value, checks exit code but not stderr, checks file exists but not content), the behavior is **uncovered** — report the gap.

### 3. Section-by-section scan

Pick the first section with status `open`. For that section:

a. **Read the spec section.** Read ONLY that section's lines from the spec (use Read with offset and limit).

b. **Enumerate every testable behavior FIRST.** Before touching any test file, write down a numbered list of every testable behavior in the section. Scan for ALL of these categories — missing a category means missing every gap inside it:

   - **Exit codes and return values** — every documented exit code, return type, or output format
   - **File outputs** — files created, appended, overwritten, or deleted
   - **Error messages and warnings** — specific strings in stderr or logs
   - **State machines** — every status/state the spec defines (ticket statuses, finding states, gate verdicts), every valid transition, and every invalid transition that must be rejected
   - **Label and tag lifecycle** — labels added, labels preserved, labels removed, additive-only policies, label-based filtering and routing decisions
   - **Phase and routing decisions** — which phases execute for which inputs, phase ordering, skip conditions, escalation blocking progression to subsequent phases
   - **Escalation triggers** — every condition that triggers an escalation, the escalation type produced, and the downstream effect (label applied, ticket blocked, pipeline halted)
   - **Eligibility and selection criteria** — what qualifies a ticket for pipeline entry, for each phase, for merge; what disqualifies it
   - **Loop termination** — gate round caps, iteration limits, oscillation detection, exhaustion handling
   - **Field validations and format contracts** — required fields, valid value ranges, format patterns (JSONL schemas, finding format, title format)
   - **Boundary conditions** — hard limits (N passes, N+1 triggers), inclusive vs exclusive
   - **Processing order guarantees** — sorting, priority, reverse-line-order, sequential phase execution
   - **Security properties** — shell injection prevention, path traversal guards, fail-closed vs fail-open decisions
   - **Composition correctness** — does the caller pass the right arguments to the callee? If a unit test proves `isClean()` works, does any test prove the gate loop calls it with the correct path and passWord?

   This list IS the source of truth — you are proving the spec, not checking the tests.

c. **For each behavior, verify test coverage with assertion strength.** Search the test files for each behavior. A behavior is covered ONLY if ALL of the following are true:
   1. A test exists that exercises this specific behavior (not a related one)
   2. The test has an assertion that checks the **specific observable** the spec requires (exit code, stderr content, file content, JSONL field value, state transition)
   3. The assertion would FAIL if the behavior broke — not pass vacuously

   **You MUST read the actual assertion** (use Read with offset/limit on the test file at the assertion line). Do not trust: test names, traceability matrix ✅ marks, grep matches for function names, or "tested indirectly through X." If you cannot point to a specific `assert(...)` line that would catch the defect, the behavior is uncovered.

d. **For each behavior, check coverage at every applicable level.** A unit test for a leaf function does NOT cover the orchestrator that calls it. Walk up the call chain:

   1. **Leaf function** — is the function itself tested? (unit)
   2. **Caller composition** — does any test verify the caller passes the right arguments, checks the right return value, and branches correctly? (integration or integration-mocked)
   3. **End-to-end flow** — does any test verify the full path from input to observable outcome? (e2e or acceptance)

   A gap at level 2 is distinct from a gap at level 1. Report both if both are missing. If level 1 is covered but level 2 is not, report level 2 — it catches composition bugs that unit tests cannot.

e. **For each uncovered behavior, verify implementation exists.** Grep or glob for the implementing code. Read enough to confirm the behavior is actually coded. "I didn't find it" is not proof it doesn't exist — try the function name, the error message, the exit code value, the status string, the label name, the routing condition. Only skip if you've done a thorough search and confirmed no code implements the behavior.

   **Testability is NOT a filter.** If the code exists but requires mocking an SDK, Docker, or network calls to test — that is still a gap. Report it with level `integration (mocked)`. The tdd skill decides how to mock. Do NOT skip a behavior because the implementing function has external dependencies. Orchestrator functions (gate loops, phase routing, escalation, status transitions, label management) are the highest-value gaps because they control the entire pipeline's correctness.

f. Apply the value filter (see `references/value-filter.md`). If the gap is not valuable, skip it.

g. Choose the test level (see `references/test-levels.md`).

h. Write the test case to the gap log (see `references/output-format.md`). Status: `open`.

i. **Zero new gaps:** mark the section `exhausted` in the manifest. Check for more `open` sections — if yes, scan the next one in the same invocation. If no, set manifest status to `COMPLETE`.

j. **Gaps found:** update the manifest (section scan count, total gaps). Present gaps to the user.

### 4. Implementation scan

After all spec sections are exhausted, scan ALL implementation files discovered in Step 2 for exported functions (e.g., `export function`, `export async function`, `export const`, `module.exports`). For each exported function:

1. Check if it was already covered by a spec-section scan in Step 3.
2. If not, grep the test files for references to that function name.
3. If untested and the function affects the ticket flow (state transitions, exit codes, data transformations consumed by other components), it is a gap — append to the gap log.

**Critical:** Do not limit this scan to a single directory. Every implementation file from Step 2 — entry points, libraries, orchestrator modules, shared utilities — must be checked.

### 5. Flow-level acceptance scan

After the section scan and implementation scan, step back and ask the cross-cutting question: **is there a test that proves each complete lifecycle works end-to-end?**

Steps 3 and 4 find gaps within individual sections and functions. This step finds gaps that span multiple sections — full flows where every component passes in isolation but the composition fails.

**5a. Identify the spec's lifecycles.** Read the spec for any flow that crosses multiple components or phases. Common patterns:
- **Happy path**: entity enters the system → phases execute in order → entity exits successfully
- **Escalation path**: entity enters → failure detected → escalated → human resolves → entity re-enters
- **Child entity lifecycle**: parent creates child → child processed → child auto-resolved
- **State machine full traversal**: entity visits every state the spec defines

**5b. For each lifecycle, check if an acceptance test exists.** Grep for test files that exercise the full flow — not individual components. An acceptance test for the pipeline lifecycle would:
- Start with a ticket in `open` status
- Drive it through phases (with mocked agents)
- Verify the final status, labels, and artifacts

**5c. Report missing lifecycles as acceptance (pipeline) gaps.** These do NOT require a browser. They run against mocked external dependencies (agents, Docker, tracker API) with real file I/O and real orchestrator logic. They are the highest-value gaps because they catch composition failures invisible at every lower level.

**5d. Skip lifecycles with no implementation.** If the spec describes a flow but no code implements it (e.g., "not yet implemented" features), skip — same rule as Step 3e.

### 6. Present results

Output the new test cases from this invocation. Group by spec section. End with a summary count.

If zero gaps found across all sections:

```
COMPLETE — all <N> spec sections and <M> exported functions covered. 0 new test cases.
```

## TGF entry lifecycle

Each TGF entry in the gap log has a status:

| Status | Meaning | Set by |
|--------|---------|--------|
| `open` | Gap identified, test not yet written | This skill |
| `implemented` | Test written and passing | Human or `tdd` skill (edits gap log) |
| `rejected` | Gap reviewed and determined not valuable | Human (edits gap log with reason) |

The manifest's `Gaps` column counts all entries (any status). The `Open` column counts only `open` entries. When all entries are `implemented` or `rejected` and all sections are `exhausted`, the manifest status is `COMPLETE`.

On re-run, the skill skips entries already in the gap log (match by spec quote + seam) and only reports new gaps.

## Grounding rules

- Every test case MUST have a concrete **why it matters**: what breaks in production. Not "could cause issues" — name the specific failure: ticket stalls in_progress forever, wrong phase executes, escalation label not applied, findings routed to wrong agent, ticket closes without passing gates, label removed when it shouldn't be, pipeline processes ineligible ticket.
- Every test case MUST name the **seam**: the public interface being tested. Not an internal function — the boundary the test observes through.
- If you cannot fill both fields with specific answers, the gap is not valuable. Drop it.
- Do NOT report:
  - Behaviors with no implementation code yet — BUT you must PROVE no code exists. Search by function name, error message, exit code, file path. Check `scripts/`, `.claude/hooks/`, `.sandcastle/` (excluding worktrees). "I didn't grep for it" is not proof. If the spec names a script or module, glob for it. If the spec names a behavior, grep for the error message or exit code. Log what you searched and where.
  - Gaps already covered by an existing test with a strong assertion — you must have READ the assertion line, not just found a test with a matching name
  - Gaps already in the gap log (dedup by spec quote + seam)
  - Marginal boundary tests where both sides of the boundary are already tested
  - Style, naming, or documentation concerns (that is linting/review, not testing)
  - Tests for test infrastructure (testing the test helpers)

## Boundaries

You MUST NOT:
- Write test code — you find gaps, you do not fill them
- Edit the spec, implementation, or existing tests
- Report a gap that an existing test already covers (read the assertion, not just the test name)
- Pad the list — zero gaps is a valid and good answer

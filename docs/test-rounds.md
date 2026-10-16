# Test Rounds Log — Rules Enforcement System

Tracks each round of the test-gap-finding process.

---

## Round 1

**Date:** 2026-10-15

### Finder results

| # | Technique | Candidates proposed | Accepted | Rejected | Duplicates |
|---|-----------|-------------------|----------|----------|------------|
| 1 | Spec sentence scan | 9 | 2 | 5 | 2 |
| 2 | Equivalence partitioning | 15 | 2 | 10 | 3 |
| 3 | State machine | 10 | 1 | 6 | 3 |
| 4 | Decision tables | 7 | 0 | 4 | 3 |
| 5 | Fault injection | 12 | 1 | 8 | 3 |
| 6 | User journey | 6 | 1 | 3 | 2 |
| 7 | Adversarial | 10 | 0 | 6 | 4 |
| **Total** | | **69** | **3** | **42** | **20** |

**Note:** 4 candidates were not accepted because they describe orchestrator/pipeline behavior with no implemented code to test (cycle detection, settlement atomicity via tracker). Remaining rejections were either already covered (duplicates of existing UCs), pointed to accepted deviations (DEV-01 through DEV-04), or had no reachable code path (multi-target parser format).

### Rejection reasons

| Reason | Count |
|--------|-------|
| Already covered by existing UC | 20 (duplicates) |
| Accepted deviation (DEV-01..04) | 8 |
| No code exists (orchestrator/cycle detection) | 7 |
| Spec-only (code doesn't implement the check) | 4 |
| Acceptance-level requiring Playwright (deferred) | 1 |
| Dead code path (parser doesn't produce targets) | 2 |

### Accepted use cases implemented

| UC ID | Title | Technique | Test level | File |
|-------|-------|-----------|-----------|------|
| UC-40a | Git commit fails once → retry after 2s → succeeds | spec-sentence-scan + equivalence-partitioning | Integration | `apply-fixer.test.mjs` |
| UC-59a | Reviewer scope > 50% without exclude → warning | adversarial + equivalence-partitioning | Integration | `audit-rules.test.mjs` |
| UC-60a | Revert cascade — cascaded re-verify fails → earlier finding reverted | state-machine | Integration | `apply-fixer.test.mjs` |

### RED/GREEN verification

| UC | RED confirmed? | Method |
|----|---------------|--------|
| UC-40a | Yes | Mock git fails first commit; without retry logic, finding would be `infra-failure` not `applied` |
| UC-59a | Yes | Without scope > 50% check, no warning in output; assertion on "broad-reviewer" + "5/6" + "without exclude" would fail |
| UC-60a | Yes | Without cascade revert logic, only 1 finding reverted (not 2); no "cascade" detail in JSONL |

### Traceability matrix update

- Before: 169 variants, 161 ✅, 2 🔴, 6 📝
- After: 172 variants, 165 ✅, 1 🔴, 6 📝
- UC-21c and UC-24e moved from 🔴 to ✅ (tests existed but matrix was stale)
- UC-40a moved from 🔴 to ✅ (new test)
- UC-59a added (new)
- UC-60a added (new)

### Spec questions logged

| # | Question | Source finders |
|---|----------|----------------|
| SQ-R1-1 | Multi-target finding format: the spec describes sub-entry syntax but `parseFindings()` doesn't parse it — the `targets` array code path is unreachable. Is this an implementation gap? | F2, F3, F7 |
| SQ-R1-2 | Cycle detection has no implementation. Spec describes 2nd/3rd recurrence escalation but no code exists. Intentionally deferred or missing? | F1, F3, F4, F5 |
| SQ-R1-3 | Settlement atomicity via tracker labels: spec says label is authoritative, but code uses JSONL (DEV-04). Are both paths needed? | F2, F3, F4, F5, F6, F7 |

### Test count change

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| apply-fixer.test.mjs | 42 | 44 | +2 |
| audit-rules.test.mjs | 31 | 32 | +1 |
| All others | unchanged | unchanged | 0 |
| **Total** | **259** | **262** | **+3** |

---

## Round 2

**Date:** 2026-10-15

### Finder results

| # | Technique | Candidates proposed | Accepted | Rejected | Duplicates |
|---|-----------|-------------------|----------|----------|------------|
| 1 | Spec sentence scan | 8 | 0 | 8 | 0 |
| 2 | Equivalence partitioning | 10 | 0 | 7 | 3 |
| 3 | State machine | 4 | 0 | 2 | 2 |
| 4 | Decision tables | 4 | 0 | 1 | 3 |
| 5 | Fault injection | 6 | 0 | 4 | 2 |
| 6 | User journey | 6 | 0 | 4 | 2 |
| 7 | Adversarial | 7 | 0 | 5 | 2 |
| **Total** | | **45** | **0** | **31** | **14** |

### Rejection reasons

| Reason | Count |
|--------|-------|
| No implementation code (ui-contract, orchestrator, phase gating) | 18 |
| Already covered or duplicate of existing UC / Round 1 | 14 |
| Acceptance-level requiring full pipeline (deferred) | 6 |
| Boundary tests on already-validated ranges (marginal value) | 5 |
| Internal-only trust boundary (not a spec concern) | 2 |

### Notable observations

- **Shell injection in `apply-t3.mjs:102`**: `diffRef` parameter interpolated unsanitized into `execSync()` shell command. Real security issue but not a spec gap — the spec doesn't mandate input sanitization on internal pipeline parameters. Logged as a code quality issue, not a test gap.
- **Path traversal in `group` field → payload filename**: `group` used directly in `visual-qa-${group}.md` filename without sanitization. Same category — internal trust boundary.
- **Boundary value tests** (priority=4, ID length=40, count=80): existing tests already cover these ranges; adding exact-boundary tests would be marginal improvement.

### Convergence assessment

Round 1: 3 accepted from 69 raw (4.3% yield)
Round 2: 0 accepted from 45 raw (0% yield)

**Convergence criteria met:** Two consecutive rounds where the second yields zero accepted candidates. All remaining gaps are either:
1. Orchestrator/pipeline features with no implementation code
2. Acceptance-level tests requiring full Playwright infrastructure
3. Accepted deviations (DEV-01 through DEV-04)
4. The one remaining 🔴 (UC-28a viewports acceptance test)

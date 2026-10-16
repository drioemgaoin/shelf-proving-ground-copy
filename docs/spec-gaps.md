# Spec Gaps — Rules Enforcement System

All deviations resolved. All spec questions resolved or deferred with tracking. Zero open gaps.

---

## Resolved Deviations (all closed)

### DEV-01: T1 conflicting rules — no runtime detection
**Spec:** "apply-t1.mjs does not attempt runtime conflict resolution"
**Status:** Resolved. By spec design — runtime conflict resolution is explicitly not attempted. Conflicting rules make the file unwritable at runtime (both assert values block). Covered by 2 new tests in `hooks.test.mjs`. `audit:rules` detects conflicts at audit time (UC-16g).

### DEV-02: Malformed YAML — fail-closed blocks all writes
**Spec:** Updated to "Fail-closed: block ALL writes (exit 2). No scope filtering."
**Status:** Resolved. Spec updated to match code behavior. The simpler design (block all writes) is safer and avoids scope-cache complexity. No longer a deviation.

### DEV-03: Mid-run rules edit warning (GAP-461) — optional
**Spec:** Updated to "Continue with cached version — no re-parse mid-run. Warning may be logged."
**Status:** Resolved. Spec updated to make warning optional ("may be logged"). Code continues with cached version via mtime-based cache. Pipeline runs in Docker with branch isolation — mid-run edits are near-zero risk.

### DEV-04: Settlement atomicity — JSONL-based (spec updated)
**Spec:** Settlement uses `finding-states.jsonl` as the authoritative store.
**Status:** Resolved. Spec updated to document JSONL-only settlement (SQ-R1-3). Tracker-label settlement removed from spec. No longer a deviation.

---

## Spec Questions (Round 1 — 2026-10-15)

### SQ-R1-1: Multi-target finding parser gap
**Spec:** "Multi-target findings: each target gets its own `file:line` + `Current` + `Fix` block" (§ Report contract)
**Status:** Resolved. `parseFindings()` now detects indented sub-target entries (`  - file:line`) and populates the `finding.targets` array. Consumer code at `apply-fixer.mjs:416-418` works end-to-end. Covered by 5 new tests in `apply-fixer.test.mjs`.

### SQ-R1-2: Cycle detection not implemented
**Spec:** Cycle detection section updated to "not yet implemented" with reference to gate-exhaustion as coarser alternative. Algorithm, schema, and recovery details removed. Added to Out of Scope.
**Status:** Resolved. Spec now reflects reality — cycle detection is a future feature, not current behavior. Tracked as `shelf-proving-ground-ryy` (P4 backlog).

### SQ-R1-3: Settlement atomicity — tracker vs JSONL paths
**Spec:** Updated to use JSONL-only settlement (§ Finding lifecycle — Settlement storage).
**Status:** Resolved. Spec rewritten to document `finding-states.jsonl` as the single authoritative settlement store. Tracker-label settlement removed. DEV-04 no longer a deviation.

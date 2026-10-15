# Spec Gaps — Rules Enforcement System

Resolved deviations from `docs/rules-enforcement.md`. None are blocking — each has an accepted rationale.

---

## Accepted Deviations (4)

### DEV-01: T1 conflicting rules — no runtime detection
**Spec:** "apply-t1.mjs does not attempt runtime conflict resolution"
**Status:** By design. The spec explicitly says runtime conflict resolution is not attempted. `audit:rules` detects and reports conflicts at audit time. At runtime, conflicting rules make the file unwritable — which is the correct consequence once `assert: present` is implemented (Gap 1).

### DEV-02: Malformed YAML — current behavior stricter than spec
**Spec:** "Fail-closed per file: block ALL writes to files matching ANY scope glob from that rules file (using mtime-cached scope list from last successful parse)."
**Status:** Accepted. Current code blocks ALL writes when a rules file is malformed (no per-scope filtering from cached parse). This is stricter than spec requires but achieves the same safety goal — enforcement never silently skips broken rules. Adding a scope-cache-on-success mechanism would increase complexity for a narrow edge case.

### DEV-03: Mid-run rules edit warning (GAP-461) — skipped
**Spec:** "Log warning with file path and timestamps. Continue with cached version — no re-parse mid-run."
**Status:** Skipped. The code already continues with cached version (by virtue of the mtime-based cache). The warning is advisory only. Pipeline runs in Docker with branch isolation — mid-run rules edits are near-zero risk in practice.

### DEV-04: Settlement atomicity — JSONL-based, not tracker-based
**Spec:** Settlement involves writing a `settled` label to the tracker AND rationale to ticket notes. Label is authoritative.
**Status:** Accepted. The Fixer uses `finding-states.jsonl` as the authoritative settlement store, not tracker labels. The orchestrator reads `finding-states.jsonl` directly. Tracker-based settlement is a future enhancement when the Fixer integrates with the tracker API.

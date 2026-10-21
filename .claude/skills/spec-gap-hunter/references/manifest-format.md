# Manifest Format

The manifest is a compact status dashboard. It tracks which sections exist and their scan status. It does NOT contain fingerprints — those live in separate per-section files (see `fingerprint-format.md`).

The manifest is always small (one header + one table row per section) regardless of how many gaps have been found.

## File location

`.spec-gap-hunter/<spec-basename>/manifest.md`

## Structure

```markdown
# Manifest: <spec filename without extension>

spec_path: <path to spec, relative to project root>
spec_hash: <short git hash at partition time, or "no-git">
status: SCANNING | CONVERGED
total_gaps: <count across all sections and all invocations>

| # | Section | Heading | Lines | Headings | Status | Scans | Gaps |
|---|---------|---------|-------|----------|--------|-------|------|
| 1 | <section-id> | <spec heading> | <start>-<end> | <count> | open | 0 | 0 |
| 2 | <section-id> | <spec heading> | <start>-<end> | <count> | exhausted | 3 | 15 |
```

## Example

```markdown
# Manifest: rules-enforcement

spec_path: docs/rules-enforcement.md
spec_hash: 5f92fa8
status: SCANNING
total_gaps: 47

| # | Section | Heading | Lines | Headings | Status | Scans | Gaps |
|---|---------|---------|-------|----------|--------|-------|------|
| 1 | mission-supply-chain | What problem this solves | 26-117 | 6 | exhausted | 3 | 15 |
| 2 | pipeline-agents-hooks | Key concepts: Pipeline agents & hooks | 118-200 | 6 | exhausted | 4 | 12 |
| 3 | ticket-statuses-report | Ticket statuses & report contract | 202-268 | 4 | open | 1 | 8 |
| 4 | finding-lifecycle-metadata | Finding lifecycle & metadata storage | 273-348 | 2 | open | 0 | 0 |
| 5 | sorting-test | The sorting test | 351-497 | 6 | open | 0 | 0 |
| 6 | tier-1-source-text | Tier 1 — Source text | 499-643 | 9 | exhausted | 2 | 12 |
| 7 | tier-2-runtime | Tier 2 — Runtime behavior | 646-780 | 7 | open | 0 | 0 |
| 8 | tier-3-intent | Tier 3 — Intent alignment | 783-973 | 9 | open | 0 | 0 |
| 9 | human-multi-tier | Human tier & multi-tier rules | 976-1103 | 6 | open | 0 | 0 |
| 10 | rule-creator-skill | The rule-creator skill | 1106-1233 | 13 | open | 0 | 0 |
| 11 | pipeline-outer-phases-1-2 | Pipeline: outer loop & phases 1-2 | 1236-1398 | 2 | open | 0 | 0 |
| 12 | pipeline-phases-3-5 | Pipeline: phases 3-5 & global T2 | 1400-1556 | 0 | open | 0 | 0 |
| 13 | prompt-expansion-fixer | Prompt expansion & Fixer enforcement | 1558-1688 | 6 | open | 0 | 0 |
| 14 | budget-overflow | Budget limits & overflow | 1691-1788 | 5 | open | 0 | 0 |
| 15 | audit-promotion-checklist | Audit, promotion & checklist | 1792-1909 | 4 | open | 0 | 0 |
```

This is ~20 lines for 15 sections. It stays ~20 lines even with 500 gaps.

## Field reference

| Field | Type | Description |
|-------|------|-------------|
| `spec_path` | string | Path to the spec file, relative to the project root. |
| `spec_hash` | string | Short git hash of the spec at partition time. Used to detect spec changes between invocations. `no-git` if not in a git repository. |
| `status` | enum | `SCANNING` while any section is `open`. `CONVERGED` when all sections are `exhausted`. |
| `total_gaps` | integer | Running count of all gaps found across all sections and all invocations. |
| `#` | integer | Row number for readability. |
| `Section` | string | Section ID — slug derived from heading: lowercase, spaces to hyphens, max 40 characters. |
| `Heading` | string | The spec heading (or merged headings) this section covers. |
| `Lines` | range | Inclusive line range in the spec (e.g., `26-117`). |
| `Status` | enum | `open` (not yet exhausted) or `exhausted` (scanned with zero new gaps found). |
| `Scans` | integer | How many times this section has been scanned. Starts at `0`. |
| `Headings` | integer | Count of `##` and `###` headings within this section's line range. Used for structural change detection — if the count changes, the spec was reorganized. |
| `Gaps` | integer | Total gaps found in this section across all scans. |

## Rules

- Sections are ordered by line number (spec reading order).
- Section IDs are stable across invocations — they do not change unless the section is split (see dynamic split in SKILL.md).
- The manifest never contains fingerprints. Fingerprints live in per-section files under `fingerprints/`.
- A section transitions from `open` to `exhausted` when a scan finds zero new gaps.
- The manifest transitions to `CONVERGED` when every section is `exhausted`.
- If the spec's git hash changes between invocations, sections whose line ranges overlap with changed regions are reset to `open` with `Scans: 0`. Their fingerprint files are preserved.
- When a section is dynamically split, its row is replaced by 2-3 new rows. The row numbers are reassigned sequentially.

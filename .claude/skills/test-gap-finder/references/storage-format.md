# Storage Format

All files live under `.test-gap-finder/<spec-basename>/`.

## Manifest

Compact status dashboard. One header + one table row per section. Always small regardless of gap count.

### Structure

```markdown
# Test Gap Manifest: <spec filename without extension>

spec_path: <path to spec, relative to project root>
spec_hash: <short git hash, or "no-git">
status: SCANNING | COMPLETE
total_gaps: <count across all sections>
open_gaps: <count of gaps with status open>

| # | Section | Lines | Status | Scans | Gaps | Open |
|---|---------|-------|--------|-------|------|------|
| 1 | <section-id> | <start>-<end> | open | 0 | 0 | 0 |
| 2 | <section-id> | <start>-<end> | exhausted | 2 | 5 | 3 |
```

### Field reference

| Field | Type | Description |
|-------|------|-------------|
| `spec_path` | string | Path to the spec file, relative to project root |
| `spec_hash` | string | Short git hash at partition time. Used to detect spec changes between invocations |
| `status` | enum | `SCANNING` while any section is `open`. `COMPLETE` when all sections `exhausted` and all gaps `implemented` or `rejected` |
| `total_gaps` | integer | All TGF entries across all sections, any status |
| `open_gaps` | integer | TGF entries with status `open` |
| `Section` | string | Slug from heading: lowercase, spaces to hyphens, max 40 chars |
| `Lines` | range | Inclusive line range in the spec |
| `Status` | enum | `open` or `exhausted` |
| `Scans` | integer | Times this section has been scanned. Starts at 0 |
| `Gaps` | integer | Total TGF entries found in this section |
| `Open` | integer | TGF entries in this section with status `open` |

### Status transitions

- Section: `open` → `exhausted` (scan finds zero new gaps)
- Manifest: `SCANNING` → `COMPLETE` (all sections exhausted AND open_gaps = 0)
- On spec change (git hash differs): reset affected sections to `open`, scans to 0. Existing gap log entries preserved.

---

## Gap Log

Append-only record of all TGF entries. Never remove or reorder existing entries.

### Structure

```markdown
# Test Gap Log: <spec filename without extension>

Spec: <spec_path>
Total: <count>

---

### TGF-<N>: <one-line title>

**Status:** open | implemented | rejected
**Why it matters:** <what breaks in the ticket flow>
**Spec:** "<exact quote>" (§ <section name>)
**Code:** `<file>:<line range>`
**Seam:** <public interface the test observes through>
**Level:** unit | integration | e2e | acceptance
**Starting state:** <setup>
**Action:** <what the test does>
**Expected:** <observable result>
**Closest existing test:** `<test name>` in `<file>` — <why it doesn't cover this>
```

### TGF entry lifecycle

| Status | Meaning | Set by |
|--------|---------|--------|
| `open` | Gap found, no test yet | test-gap-finder |
| `implemented` | Test written and green | Human or tdd skill — edit the Status line |
| `rejected` | Not valuable after review | Human — edit the Status line, add `**Reason:**` |

### Rules

- TGF IDs are sequential (`TGF-1`, `TGF-2`, ...), never reused
- The gap log is append-only — never remove, rewrite, or reorder entries
- Only the `Status` line (and optional `Reason` for rejected) may be edited on existing entries
- The `Total` count in the header is updated after each append
- Dedup: before appending, check existing entries by spec quote + seam. If a match exists, skip

### Spec questions

When the spec does not clearly decide a behavior, append as a spec question instead:

```markdown
### SQ-<N>: <the question>

**Status:** open | resolved
**Spec:** "<quote>" (§ <section>)
**Code assumes:** <what the implementation does>
**Why it matters:** <what decision this blocks>
```

SQ entries share the same sequential numbering as TGF entries (e.g., TGF-1, TGF-2, SQ-3, TGF-4).

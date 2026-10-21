# Spec Model Format

The spec model is a persistent coverage matrix. Each row is a question the spec should answer. Verification is deterministic: same rows × same spec text = same results.

## File location and naming

`<spec-basename>.model.md` — next to the spec, the gap log, and the Q&A log.

## Structure

```markdown
# Spec Model: <spec name>
spec_version: <short git hash or "not-in-git">
last_verified: <ISO 8601 date>
exploration_clean_runs: <0|1|2>

## Entities
<entity table>

## Coverage: <entity name>
<coverage matrix>

## Interface: <producer> → <consumer>
<interface matrix>

## State Machine: <entity lifecycle>
<state-event matrix>

## HAZOP: <component name>
<parameter × deviation matrix>

## Business Rules
<rule inventory>

## Chains
<claim chains>

## Summary
<cell counts, chain counts, status>
```

## Entity table

Every named component, script, agent, skill, format, data file, or data flow in the spec.

```
| # | Entity | Type | Section |
|---|--------|------|---------|
| 1 | apply-t1.mjs | script | Hooks and tools |
```

- `Type`: script, agent, skill, format, data-file, data-flow, hook, concept
- `Section`: the spec section where the entity is primarily defined

## Coverage matrix

One per entity. Each row is an aspect the spec should define for this entity.

```
| # | Question | Status | Line | Gap | Source |
|---|----------|--------|------|-----|--------|
| 1 | What are the inputs? | verified | 137 | — | build |
| 2 | What happens on timeout? | verified | 533 | GAP-513 | build |
| 3 | What is the invocation contract? | pending | — | — | build |
```

### Standard aspects (applied per entity type)

**Scripts/tools:** inputs, outputs, exit codes, invocation contract, error handling (per error category), timeout, caching, configuration
**Agents:** role, model, iteration limit, exhaustion behavior, escalation signal, what tiers it enforces
**Data files:** schema, field naming, append semantics, producer, consumer, crash recovery
**Data formats:** required fields, optional fields, validation rules, example
**Interfaces:** output format match, required fields match, error signaling match, timing/ordering
**Concepts:** definition, scope, lifecycle, boundary conditions

Not every aspect applies to every entity. Mark inapplicable rows as `verified` with Line = `N/A`.

### Status values

| Status | Meaning |
|--------|---------|
| `verified` | The spec answers this question. `Line` has the reference. |
| `gap` | The spec does not answer this question. `Gap` has the gap ID. |
| `pending` | Not yet checked against current spec version (new or affected by spec change). |

### Source values

| Source | Meaning |
|--------|---------|
| `build` | Created during Phase A model building (first run). |
| `explore-rN` | Added by Phase B exploration run N. |
| `change-vHASH` | Added after spec change detection for version HASH. |

## Interface matrix

One per producer-consumer pair. Uses the STPA-derived aspects from `sub-agent-briefs.md § Sub-agent 2`.

```
| # | Question | Status | Line | Gap | Source |
|---|----------|--------|------|-----|--------|
| 1 | Does output format match consumer expectation? | verified | 149,632 | — | build |
| 2 | How does producer signal errors to consumer? | gap | — | GAP-445 | build |
```

## State-event matrix

One per entity with state changes. Rows = state × event combinations.

```
| # | State × Event | Status | Line | Gap | Source |
|---|---------------|--------|------|-----|--------|
| 1 | pending × fix-applied | verified | 272 | — | build |
| 2 | applied × context-exceeded | verified | 1614 | GAP-514 | build |
```

## HAZOP matrix

One per component. Rows = parameter × deviation combinations. Guide words: NO/NONE, MORE, LESS, OTHER THAN, EARLY/LATE.

```
| # | Parameter × Deviation | Status | Line | Gap | Source |
|---|----------------------|--------|------|-----|--------|
| 1 | filePath × NO/NONE | verified | 351 | — | build |
| 2 | filePath × OTHER THAN | verified | 413 | GAP-413 | build |
```

## Business rules

Each business rule extracted from the spec, with testability and boundary checks.

```
| # | Rule | Testable | Boundary | Precedence | Status | Line | Gap | Source |
|---|------|----------|----------|------------|--------|------|-----|--------|
| 1 | 80 non-exempt per call | yes | inclusive (GAP-212) | — | verified | 1610 | — | build |
```

## Chains

A chain is a sequence of claims where each depends on the previous. If any link is missing, the chain breaks.

```
| # | Chain description | Links | Status | Gap |
|---|-------------------|-------|--------|-----|
| 1 | Fixer commits → prefix format → orchestrator filters → FIX_HISTORY populated | L259→L259→L1549→L1549 | complete | — |
| 2 | T1 blocks write → rejection shown → agent retries → fix field defined | L93→L571→L583→L557 | complete | — |
```

- `Links`: `L<line>` references for each claim in the chain, `→`-separated.
- `Status`: `complete` (all links present and consistent) or `broken at link N` (link N missing or contradicts).
- A broken chain = a gap.

### Building chains

Chains are derived from two sources:
1. **Prerequisite analysis**: For each behavioral claim, ask "What must be true before this works?" The prerequisite should also be a claim in the spec.
2. **Interface contracts**: Each producer-consumer interface creates a chain: producer guarantees X → consumer assumes X.

### Verifying chains

For each chain:
1. For each link: find the claim at the stored line. If found → present. If not found → missing.
2. If all links present: check logical consistency — does link N's output match link N+1's input?
3. Complete + consistent → `complete`. Missing link or inconsistency → `broken`.

## Summary

```
Total cells: 423 | Verified: 423 | Gaps: 0 | Pending: 0
Chains: 28 | Complete: 28 | Broken: 0
Exploration clean runs: 2
Status: CONVERGED
```

Status values: `BUILDING` (first run, model incomplete), `VERIFYING` (cells pending), `EXPLORING` (Phase B), `CONVERGED` (done).

## Verification algorithm

For each cell with status `pending`:

1. Read the spec text at the stored line number.
2. If the line no longer matches (spec was edited), search the spec for a 60-character quote fragment stored with the cell.
3. Ask the cell's question: "Does the spec define [aspect] of [entity]?"
4. This is a **reading** task — search the spec for the entity name and aspect keyword.
5. If found: quote the answer, set status to `verified`, update the line number.
6. If not found: set status to `gap`, create a gap entry in the gap log.

This is the same operation as spec-qa's answer logic. It reads and quotes — no creativity, no inference.

## Spec-change detection

When the spec is modified (patches applied, manual edits):

1. Compare `spec_version` in the model against the current git hash.
2. If different: compute `git diff <model_version> <current_version> -- <spec_path>`.
3. For each cell: if `cell.line` falls in a changed range → mark as `pending`.
4. For added sections (new spec text): run model-building sub-agents on the new text only → add new cells.
5. Re-verify all `pending` cells.
6. Update `spec_version` in the model.

If not in git: compare file mtime. If changed, re-verify all cells (no incremental detection).

## Integration with gap log

- The model REFERENCES gaps by ID but does not duplicate their content.
- Model cell says `gap | — | GAP-302`. Gap log has the full GAP-302 entry.
- When a gap is settled: re-verify the cell. If spec now answers the question → `verified`. If not → remains `gap` (settlement verification failed).
- When a gap is marked out of scope: set cell to `verified` (not the spec's responsibility).

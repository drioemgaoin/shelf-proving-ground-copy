# Spec Workflow

How to use the spec skills together: hunt for gaps, ask questions, and resolve decisions.

## Skills overview

| Skill | What it does | Invocation |
|-------|-------------|------------|
| `spec-gap-hunter` | Finds questions the spec cannot answer. Writes `<spec>.gaps.md` | `/spec-gap-hunter <path-to-spec>` |
| `spec-qa` | Answers a question using only the spec text. Logs unanswerable questions as new gaps | `/spec-qa <path-to-spec> <question>` |

Both skills share the same gap log (`<spec-basename>.gaps.md`) and Q&A evidence log (`<spec-basename>.qa.jsonl`). Format reference: `.claude/skills/spec-gap-hunter/references/gap-format.md`.

## Hunting gaps

Run `spec-gap-hunter` against a spec to produce or update the gap log.

```
/spec-gap-hunter docs/rules-enforcement.md
```

The skill:
1. Reads the spec and any existing gap log
2. Runs 4 parallel sub-agents (contradiction, component, lifecycle, adversarial)
3. Merges, deduplicates, and scope-filters findings
4. Runs a 5th verifier sub-agent to catch what the first 4 missed
5. Writes all findings to `<spec-basename>.gaps.md` under `## Open gaps`

Re-running the skill continues from where the gap log left off — it respects existing decisions and open gaps.

## Asking questions

Use `spec-qa` to check what the spec says about something specific.

```
/spec-qa docs/rules-enforcement.md "Does the 80-rule limit include critical rules?"
```

If the spec cannot answer the question, `spec-qa` logs a new gap automatically.

## Resolving gaps

When you have decisions for open gaps, paste the following prompt into a fresh session. Replace the decisions list with your actual choices.

---

### Prompt template

```
Resolve the following gaps in docs/rules-enforcement.md.

Reference file: docs/rules-enforcement.gaps.md
Format reference: .claude/skills/spec-gap-hunter/references/gap-format.md

For each decision below:
1. Read the gap entry in the gaps file to understand the section and context
2. Update the spec (docs/rules-enforcement.md) in the section referenced
   by the gap to incorporate the decision — rewrite prose, fix tables,
   add definitions, or resolve contradictions as needed
3. Move the gap from "## Open gaps" to "## Decisions" using the format:
   - GAP-<n>: <decision summary> (confirmed by user on <date>)
4. Remove the full gap entry from Open gaps (not just the heading —
   the entire block including all fields)
5. If other open gaps list this one as Parent, check whether the
   decision changes their framing or makes them obsolete
6. After all gaps are processed, run a consistency check: for each
   decision, grep the spec for related terms and verify no section
   still reflects the old/contradictory state

Decisions:

- GAP-1: option 1 — <rationale>
- GAP-2: option 1 — <rationale>
- GAP-3: option 2 — <rationale>
...
```

---

### Decision format

Each line is: `GAP-<id>: option <n> — <brief rationale>`

The option number refers to the "Possible answers" list in the gap entry. If your decision doesn't match any listed option, write it out in full:

```
- GAP-7: custom — <describe your decision and why>
```

### What the agent does

For each decision, the agent:

1. **Reads the gap entry** — gets the section reference, possible answers, and context
2. **Updates the spec** — modifies the referenced section to reflect the decision. This may mean rewriting a paragraph, fixing a table row, adding a definition, or removing contradictory text
3. **Updates the gap log** — removes the entry from `## Open gaps` and adds a one-liner under `## Decisions`
4. **Checks children** — if other gaps have `Parent: GAP-<n>`, evaluates whether the parent decision resolves or changes the child gap
5. **Cross-checks** — verifies the spec is internally consistent after the change

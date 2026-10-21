# Output Format

Test cases are persisted to the gap log (see `storage-format.md`) AND presented to the user in the conversation.

## Conversation output

Present each new TGF entry from this invocation using this format:

```
**TGF-<N>** (<level>) — **<title>**

> <spec quote>

**Seam:** `<seam>`
**Why it matters:** <what breaks in the ticket flow>
**Expected:** <observable result>
```

After all entries in the section, add a status line:

```
---
Section `<section-id>` scanned | <N> new gaps | <M> sections remaining
```

If zero gaps found and all sections exhausted:

```
---
COMPLETE — all <N> spec sections and <M> exported functions covered. 0 new test cases.
```

## Grouping

Group by spec section. Use a level-2 heading:

```
## § <Section name> (<N> gaps)
```

## Summary

End the output with:

```
---
**Total:** <N> test cases, <M> spec questions
**By level:** unit: <X> | integration: <Y> | e2e: <Z> | acceptance: <W>
**Open gaps:** <count> (ready for tdd)
```

## Rules

- Every field in the gap log entry is required. If you cannot fill a field, the gap is not specific enough — drop it.
- The `Expected` field must be a concrete observable: an exit code, a string in stderr, a file that exists or doesn't, a JSONL field value. Never "should work correctly."
- The `Closest existing test` field must name a real test. Read it. If it covers the behavior, drop the gap.
- Do not include implementation hints, code snippets, or design suggestions. The `tdd` skill makes those decisions.
- Do not present prose, summaries, or commentary outside the format above.

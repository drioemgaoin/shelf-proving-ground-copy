# Tone of Voice Rules for Spec Writing

These 10 rules are the frontier consensus from Google Developer Docs, GOV.UK Content Design, Stripe, Amazon 6-pager, Basecamp Shape Up, IETF RFC 7322, Addy Osmani, and plain language readability research. Every rule had 80%+ agreement across sources.

The spec-gap-fixer applies these when writing fix text. They are subordinate to the surrounding context — if the existing spec uses a pattern that conflicts with a rule, match the existing spec.

---

## 1. Active voice. Name the actor.

| Instead of | Write |
|---|---|
| "The file is blocked by the hook." | "The hook blocks the file." |
| "A warning is logged." | "The parser logs a warning." |
| "Errors are handled." | "The orchestrator retries once, then escalates." |

Why: Active voice makes clear WHO does WHAT. Passive voice hides responsibility. (Google, GOV.UK, Stripe, IETF — all prescribe active voice.)

Exception: Use passive when the actor is genuinely irrelevant or unknown. "The file is deleted" is fine when any of 5 components might delete it and the spec is describing the file's lifecycle, not a specific component's behavior.

## 2. One idea per sentence. One topic per paragraph.

| Instead of | Write |
|---|---|
| "The hook fires before each write, checks the file against all T1 blocks which are cached by mtime, and if any pattern matches it blocks the write and shows an error." | "The hook fires before each write. It checks the file against all T1 blocks (cached by mtime). If any pattern matches, the hook blocks the write. The agent sees an error with the file, line, match, and fix." |

Target: 15-25 words per sentence. Split at conjunctions ("and," "but," "which").

## 3. Front-load the important point.

| Instead of | Write |
|---|---|
| "After considering the trade-offs between fail-open and fail-closed, the system blocks all writes." | "The system blocks all writes (fail-closed). This is the safest default when enforcement state is unknown." |

Rule: The first sentence of every paragraph carries the key fact. Reasoning follows.

## 4. Concrete over abstract. Give the number, the name, the date.

| Instead of | Write |
|---|---|
| "The system handles errors appropriately." | "Exit code 0 means allow. Exit code 2 means block." |
| "Various components consume the output." | "Three parsers consume the output: apply-t1.mjs, ui-contract, and apply-t3.mjs." |

Kill these words: "appropriate," "various," "certain," "sufficient," "properly," "correctly." Replace with the specific value.

## 5. Use "the [component]" as subject, "you" for the reader.

| Context | Subject |
|---|---|
| Describing system behavior | "The Fixer reverts the change." "apply-t1.mjs exits with code 2." |
| Instructing the reader | "Configure the hook in settings.json." "Run npm run audit:rules." |
| General rule | "Every rule must have an enforcement block." |

Never use "one should" or "the system" when a specific component name is known.

## 6. No jargon without immediate inline definition.

| Instead of | Write |
|---|---|
| "Uses carry-forward semantics." | "Unfixed findings are re-detected in the next round with fresh content (carry-forward)." |
| "Applies scope-gating." | "Filters rules by file-glob match against the git diff (scope-gating) — rules whose scope doesn't match are excluded." |

The definition goes in parentheses or a dash clause, inline, on first use. Not in a glossary. Not in a footnote.

## 7. Show the structure, then fill it.

When presenting multiple items (exit codes, escalation reasons, field definitions), use a table or list FIRST, then prose explanation if needed. Not the other way around.

| Instead of | Write |
|---|---|
| A paragraph listing "Exit code 0 means allow, while exit code 2 means block, and any other exit code is treated as..." | A table with columns: Exit code, Meaning. Then a sentence explaining the rationale. |

## 8. State the rule, then the reason. Not the other way around.

| Instead of | Write |
|---|---|
| "Because LLMs lose attention beyond 80 rules, the limit is 80." | "Limit: 80 rules per call. Why: LLM attention degrades beyond 80." |

The reader scanning for constraints gets the number immediately. The reader who needs justification reads the next sentence.

## 9. Flat hierarchy. No nesting beyond 2 levels.

```
Good:                          Bad:
## Section                     ## Section
### Subsection                 ### Subsection
Content                        #### Sub-subsection
                               ##### Sub-sub-subsection
                               Content (buried 4 levels deep)
```

If you need a third level, the section is too dense. Split it into two sections.

## 10. No hedge words. Commit or flag as open.

| Instead of | Write |
|---|---|
| "The system should probably retry once." | "The system retries once." |
| "It might make sense to use fail-closed." | "The system uses fail-closed." |
| "In some cases, the hook blocks writes." | "The hook blocks writes when any T1 pattern matches." |

If the answer is genuinely uncertain, say so explicitly: "Open question: how many retries? Current assumption: 1." A hedge is a hidden open question. Make it visible.

# T3 instruction format

Every T3 enforcement block instruction is injected into an LLM agent prompt. It competes for attention with dozens of other instructions. To ensure zero divergence, hallucination, or attention loss:

## Structure (strict order)

```
[What to check] [Concrete signals] A violation is [condition]. Correct: [what good looks like].
```

1. **What to check** — imperative verb + scope. "Check every CSS rule block that...", "For each component with..."
2. **Concrete signals** — property names, class name patterns, token names, file paths. Never abstract nouns.
3. **A violation is** — one sentence, starts with "A violation is". Names the exact condition.
4. **Correct:** — one sentence. Names what correct output looks like.

## Calibration targets

| Metric | Target | Hard limit |
|--------|--------|------------|
| Character count | 400–550 | 650 |
| Sentences | 3–5 | 7 |
| Imperative verbs | 1–2 | — |
| Abstract nouns | 0 | 1 |
| Passive voice | 0 | 0 |

## Anti-patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| "You should check..." | Passive, dilutes attention | "Check..." |
| "It is important to..." | Filler, zero signal | Delete |
| "Make sure that..." | Weak imperative | "Verify..." or "Assert..." |
| Numbered list (1), (2), (3) | Splits attention into branches | Inline: "pattern-a, pattern-b, pattern-c" |
| Repeating what another block checks | Token waste, attention split | Delete — reference by block id if needed |
| Explaining WHY in the instruction | Bloat — the prose above explains why | State the check, not the rationale |

## Before/after example

**Before (911 chars, numbered list, redundant with other blocks):**
```
For every accessibility-related CSS rule block in the diff, verify the pattern is complete.
Known patterns and their required properties: (1) sr-only / visually-hidden (class names
containing live, sr-only, visually-hidden, or elements with aria-live): position: absolute,
overflow: hidden, width/inline-size: 1px, height/block-size: 1px, clip-path: inset(50%),
white-space: nowrap — all six required; (2) focus-visible indicator: must use outline +
outline-offset from tokens, not border or box-shadow (breaks Windows High Contrast Mode);
(3) animation with reduced-motion: every @keyframes or transition must have a
prefers-reduced-motion: reduce fallback that is either animation: none or opacity-only.
A violation is any accessibility CSS pattern missing required properties. The consequence
of an incomplete pattern is a silent a11y failure — the code compiles, tests may pass,
but real users are affected.
```

**After (649 chars, flat, zero redundancy):**
```
Check every CSS rule block that implements an accessibility pattern (sr-only,
visually-hidden, skip-link). The selector name or component context identifies these —
look for class names containing live, sr-only, visually-hidden. For sr-only: all six
properties are required — position: absolute, overflow: hidden, width/inline-size: 1px,
height/block-size: 1px, clip-path: inset(50%), white-space: nowrap. A violation is any
a11y CSS pattern missing required properties — incomplete patterns compile and pass tests
but silently break the accessibility contract. Correct: every property the pattern
requires is present, using tokens where they exist.
```

What changed: removed numbered list, removed focus-visible and reduced-motion (each has its own T3 block), removed "consequence" sentence (instruction tells the check, not the rationale), flattened structure.

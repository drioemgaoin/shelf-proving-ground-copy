# Fingerprint Format

Fingerprints are the dedup mechanism. Each section has its own fingerprint file containing only that section's gap topic labels. The LLM reads ONE fingerprint file per scan — never all of them.

## File location

`.spec-gap-hunter/<spec-basename>/fingerprints/<section-id>.md`

One file per section. Created empty at setup. Appended after each scan that finds gaps.

## Structure

```markdown
- <3-5 word topic label>
- <3-5 word topic label>
- <3-5 word topic label>
```

One fingerprint per line, prefixed with `- `. Nothing else. No descriptions, no heading paths — those live in `_anchors.md` (see `anchor-format.md`). Fingerprint files are scanned by the LLM, so every token counts.

## Example

File: `.spec-gap-hunter/rules-enforcement/fingerprints/tier-1-source-text.md`

```markdown
- malformed-yaml-no-cache-scope
- invalid-regex-timeout-threshold
- binary-file-detection-method
- conflicting-rules-resolution-order
- strip-engine-unmapped-extension
- cache-key-mtime-granularity
- exit-code-1-vs-2-distinction
- multiple-violations-ordering
- scope-glob-relative-resolution
- no-rules-fail-open-rationale
- mid-run-edit-stale-cache
- invalid-glob-fail-behavior
```

## Fingerprint quality rules

A fingerprint must:
- Be 3-5 words (short enough to scan, long enough to carry meaning)
- Name the specific topic, not the category (NOT "error handling" — YES "malformed-yaml-no-cache-scope")
- Be unique within the section (no two fingerprints in the same file should cover the same question)
- Use hyphens between words, lowercase, no special characters

A fingerprint is a recognition signal, not a description. The LLM reads it and recognizes "I already covered this topic" — it does not need to understand the full gap from the fingerprint alone.

## Why one file per section

| Alternative | Problem |
|---|---|
| All fingerprints in the manifest | Manifest grows to 500+ lines. Human can't read it. LLM reads irrelevant fingerprints. |
| All fingerprints in one file | LLM must scan 500 fingerprints to find the 20 relevant ones. Wastes tokens, risks false matches. |
| One file per section | LLM reads only the file for the section being scanned. 0-60 fingerprints. No noise. |

## Rules

- Fingerprint files are append-only during normal operation. They are rewritten during re-partition (SKILL.md § E) and dynamic split (SKILL.md § D).
- When a section is dynamically split (SKILL.md § D), its fingerprints are distributed to the new sub-section files using heading paths from `_anchors.md`. The original file is deleted.
- When the spec is structurally reorganized (SKILL.md § E), all fingerprint files are rewritten based on heading-path redistribution. Unmatched fingerprints go to `_orphaned.md`.
- An empty fingerprint file (first scan of a new section) is valid — it means no gaps have been found yet.
- Every fingerprint in a per-section file must have a corresponding entry in `_anchors.md`. Legacy fingerprints without anchors are treated as orphans during re-partition.
- The LLM reads the fingerprint file AFTER reading the spec section text and BEFORE scanning. This ordering ensures the fingerprints are in context during the scan, not buried after the findings.
- The LLM also reads `_orphaned.md` (if it exists) as secondary dedup. Orphan matches are moved to the correct section file during scanning.

## Sizing at scale

| Scenario | Fingerprints per file | File size | LLM tokens |
|---|---|---|---|
| Light section (10 gaps) | 10 lines | ~60 words | ~80 tokens |
| Medium section (25 gaps) | 25 lines | ~150 words | ~200 tokens |
| Dense section (50 gaps) | 50 lines | ~300 words | ~400 tokens |
| After dynamic split (was 50) | ~17 lines per sub-section | ~100 words | ~130 tokens |

Even at 50 fingerprints (400 tokens), the fingerprint file is small relative to the spec section text (80-200 lines, ~1500-3000 tokens). Fingerprints never dominate the scan context.

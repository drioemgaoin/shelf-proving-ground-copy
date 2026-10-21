# Anchor Format

The anchor index maps each fingerprint to its heading path in the spec. It is the redistribution mechanism — when the spec is structurally reorganized, anchors tell the re-partition algorithm where each fingerprint's content lived.

## File location

`.spec-gap-hunter/<spec-basename>/fingerprints/_anchors.md`

One file per spec. Created empty at setup. Appended when fingerprints are created.

## Structure

```markdown
<fingerprint-slug> | <## Parent> > <### Child>
```

One entry per line. Pipe-separated: fingerprint slug, then heading path. The heading path is `## Parent > ### Child` — the nearest `###` heading above the gap's location, qualified by its `##` parent.

No header, no metadata. One entry per line. Nothing else.

## Example

```markdown
missing-jsonl-schemas | Key concepts > Metadata storage model
human-tier-log-casing | Human tier — Subjective review > Review tracking
no-any | Tier 1 — Source text > Example
focus-trap-dialogs | Tier 2 — Runtime behavior > Examples
exit-not-slower | Tier 3 — Intent alignment > Examples
```

## How heading paths are built

1. Find the gap's location (line number) in the spec.
2. Scan upward from that line to find the nearest `### ` heading. This is the child.
3. Continue scanning upward to find the nearest `## ` heading (not `###`). This is the parent.
4. The heading path is `<parent text> > <child text>`, with leading `#` characters stripped.

If the gap is above all `###` headings (directly under a `##`), the path is just `<parent text>` with no child.

## Why heading paths

Heading paths are the most stable identifier for content location in a markdown spec:

- They survive line-number shifts (insertions, deletions, reordering).
- They survive content edits within a section (tone rewrites, clarifications).
- They are globally unique when qualified as `## Parent > ### Child` (tested: 68/68 unique in a 1927-line spec with 83 headings).
- They are structural signposts — less likely to change during tone rewrites than prose content.

## Redistribution algorithm

When the spec is structurally reorganized (step E in SKILL.md), the re-partition algorithm uses heading paths to relocate fingerprints:

| Priority | Match type | Condition |
|----------|-----------|-----------|
| 1 | Exact | Full heading path exists in new spec |
| 2 | Child-match | `### Child` exists under a different `## Parent` |
| 3 | Parent-fallback | `## Parent` exists but `### Child` is gone |
| 4 | Orphaned | Neither found — goes to `_orphaned.md` |

## Rules

- The anchor index is append-only during normal operation. It is rewritten only during re-partition (step E).
- Every fingerprint in every per-section file must have a corresponding entry in `_anchors.md`.
- Legacy fingerprints without anchor entries are treated as orphans during re-partition.
- The anchor index is never read during scanning — it adds zero tokens to scan context.

## Sizing at scale

| Scenario | Entries | File size | Tokens (read once during re-partition) |
|---|---|---|---|
| Light spec (10 gaps) | 10 lines | ~150 words | ~200 tokens |
| Medium spec (100 gaps) | 100 lines | ~1500 words | ~2000 tokens |
| Large spec (500 gaps) | 500 lines | ~7500 words | ~10000 tokens |

The anchor index is read once during re-partition, never during scanning. Even at 500 entries, the one-time cost is small relative to re-scanning 50 sections.

# Transcript — Edit-Reclassify Eval (without skill)

## Task

Two edits to `.claude/rules/frontend-standards.md`:

1. **z-index rule**: Add T1 enforcement block. A custom stylelint plugin (`plugin/no-raw-z-index`) now catches raw z-index values, so the rule should be classified as T1 (tool-enforced, automated).
2. **Color-alone rule**: Reclassify from T3 (visual-qa) to Human. The visual-qa agent produces too many false positives on color-only accessibility checks, so human judgment is required during PR review.

## Reasoning

### Change 1: z-index — no enforcement -> T1

The rule "Never set a raw `z-index` value" previously had no enforcement block. The user stated that a custom stylelint plugin has been built to catch violations. This means:

- **Tier**: T1 (automated tooling catches violations at lint time)
- **Tool**: stylelint (the linter that runs the plugin)
- **Rule**: `plugin/no-raw-z-index` (the custom plugin rule name)
- **Fix**: Guidance on how to resolve violations — use layer tokens from tokens.css

I added a T1 enforcement block with `tool: stylelint` and `rule: plugin/no-raw-z-index` to reflect that this is now machine-enforced. This follows the convention that T1 rules are caught by automated tooling (linters, type checkers) before code reaches review.

### Change 2: Color-alone — T3 visual-qa -> Human

The rule "Color alone does not convey meaning" was previously T3 with visual-qa as the enforcement mechanism. The user reported that the visual-qa agent cannot reliably judge this — too many false positives. This means:

- **Tier**: Human (requires manual human review)
- **Review**: Manual accessibility review during PR
- **Reason**: Documenting why this was reclassified — visual-qa false positives

I replaced the T3 visual-qa enforcement block with a Human enforcement block, including a `reason` field explaining the reclassification rationale. The Human tier means this rule is only checked during manual PR review by a human reviewer.

## Changes Made

- Added T1 enforcement block to the z-index rule with stylelint plugin reference
- Reclassified color-alone rule from T3 visual-qa to Human with reason documented
- Preserved all other rules and file structure unchanged

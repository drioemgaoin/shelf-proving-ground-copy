# Transcript: Edit-Reclassify Task

## Task

Two reclassification changes to `.claude/rules/frontend-standards.md`:

1. **z-index rule -> T1**: The "Never set a raw z-index value" rule had no enforcement block. A custom stylelint plugin now catches raw z-index values, so it qualifies for T1 (automated tooling enforcement). Added a T1 enforcement block with a regex pattern (`z-index:\s*\d`), `assert: never` semantics, scoped to CSS files, and a fix instruction pointing to the token system.

2. **Color-meaning rule -> Human**: The "Color alone does not convey meaning" rule was T3 visual-qa, but the visual-qa agent produces too many false positives on this check. Reclassified to Human tier with a note explaining the reason (false positives) and specifying manual accessibility review during PR as the enforcement mechanism.

## Reasoning

### Change 1: z-index T1 classification

- T1 means the rule is enforced by automated tooling (linter, stylelint plugin, CI check).
- Since a custom stylelint plugin now exists to catch raw z-index values, this rule can be mechanically enforced without human judgment.
- The enforcement block includes:
  - `tier: T1` — automated enforcement
  - `pattern: "z-index:\\s*\\d"` — regex matching raw numeric z-index declarations
  - `assert: never` — this pattern should never appear
  - `scope: "src/**/*.css"` — only CSS files in src
  - `fix:` — actionable remediation guidance

### Change 2: Color-meaning Human classification

- T3 visual-qa means enforcement is delegated to the visual-qa agent during automated review.
- The visual-qa agent cannot reliably judge whether color alone conveys meaning — it produces too many false positives.
- Human tier means a human reviewer must check this during PR review.
- The enforcement block includes:
  - `tier: Human` — requires human judgment
  - `review:` — describes when/how review happens
  - `reason:` — documents why automated enforcement was abandoned

## Actions Taken

1. Read the fixture file at the specified input path.
2. Wrote the modified `frontend-standards.md` to the outputs directory with both changes applied.
3. Wrote this transcript summarizing reasoning and actions.

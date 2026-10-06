# Transcript: Adding console.log cleanup rule

## Task

Add a rule to `.claude/rules/team-standards.md` preventing developers from leaving `console.log` (and similar debugging statements) in committed code.

## Reasoning

1. **Read the existing file.** The file already has a "Debugging" section with one bullet about using a logger utility instead of raw `console.*` calls. This is the natural place to add the new rule.

2. **Decided on placement.** Rather than creating a new section, I added a new bullet under the existing "Debugging" section since the topic fits perfectly there.

3. **Crafted the rule.** The rule needed to cover several aspects:
   - **Scope:** Not just `console.log` but also `console.debug`, `console.info`, and `console.warn` -- all common debugging variants.
   - **Clear action:** "Remove all debugging console calls before committing code."
   - **Escape hatch:** Sometimes a `console.error` in a catch block is intentional. The rule allows keeping console statements if they have an explanatory comment, so legitimate uses are not blocked.
   - **Enforcement guidance:** Tells reviewers to treat uncommented `console.*` calls as blocking issues in code review.

4. **Preserved the file structure.** The frontmatter (`paths: "src/**/*"`), existing rules, and formatting were all kept intact. Only the new bullet was added.

## Output

- `team-standards.md` -- Updated rules file with the new debugging rule added under the existing "Debugging" section.
- `transcript.md` -- This file.

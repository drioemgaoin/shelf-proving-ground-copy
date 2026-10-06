# Rule Creator Transcript

## Task

Add a rule to prevent developers from committing `console.log` debugging statements.

## Step 1: Discover rules files

Scanned `.claude/rules/` and found one rules file:
- `.claude/rules/team-standards.md` (scoped to `src/**/*`)

No other rules files or top-level `CODING_STANDARDS.md` found.

## Step 2: Count existing enforcement blocks

Grepped all discovered rules files for enforcement blocks:
- **T1:** 0
- **T2:** 0
- **T3:** 0
- **Human:** 0
- **Scopeless T3:** 0
- **Critical T3:** 0

No existing enforcement blocks in any file.

## Step 3: Determine placement

The file has three sections: Code Style, Debugging, Testing. The user's request is about removing `console.log` debugging calls before committing. The **Debugging** section is the closest thematic match -- it already contains a rule about using a logger utility instead of raw `console.*` calls.

Suggested placement: **Debugging** section, as a new bullet after the existing logger rule.

## Step 4: Write the rule text

> Do not commit `console.log`, `console.debug`, `console.info`, or `console.warn` calls.

One clear sentence, imperative mood. Covers the four most common console methods used for debugging. Does not include `console.error` since that may have legitimate production use (the existing rule about the logger utility covers that concern separately).

## Step 5: Sorting test

**Step 1: Can a tool catch it?**

Ask: "Can a regex, AST walker, or lint rule detect every violation of this rule without understanding intent?"

**Yes.** The pattern `console.(log|debug|info|warn)(` is a syntactic signature that is always wrong in committed code, regardless of context. No intent judgment is needed -- if the call is present in a source file, it violates the rule.

This is a textbook T1 case. Similar to ESLint's `no-console` rule, which is widely used and well-understood.

**Classification: T1** (deterministic, pre-commit)

## Step 6: Generate the enforcement block

Using the T1 template from `references/tier-formats.md`:

```yaml
enforcement:
  tier: T1
  pattern: "console\\.(log|debug|info|warn)\\s*\\("
  assert: "No console.log/debug/info/warn calls in committed source files"
  scope: "src/**/*.{ts,tsx}"
  fix: "Remove the console call. If logging is needed, use the project logger utility."
```

Field decisions:
- **pattern:** Regex matching the four banned console methods followed by a paren. The `\\s*` allows for optional whitespace before the paren.
- **scope:** Limited to `src/**/*.{ts,tsx}` since the rules file itself is scoped to `src/**/*` and the project is TypeScript/React.
- **fix:** Points developers to the existing logger utility, tying back to the adjacent rule.

## Step 7: Append to file

Appended the rule text and enforcement block as a new bullet in the Debugging section, after the existing logger utility rule.

## Step 8: Budget checks

**After adding this rule (aggregated across all discovered rules files):**

### Per-file breakdown

| File | T1 | T2 | T3 | Human | Scopeless T3 | Critical T3 |
|------|----|----|----|----|---|---|
| team-standards.md | 1 | 0 | 0 | 0 | 0 | 0 |

### Aggregated totals

| Budget | Current | Limit | Status |
|--------|---------|-------|--------|
| Total T3 rules | 0 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 | 0 | 10 | OK |
| Critical T3 | 0 | 10 | OK |

All budgets well within limits.

## Rule ID

Implicit stable ID: `team-standards:debugging:t1`

## Output

Modified file saved to: `rule-creator-workspace/iteration-9/eval-6/with_skill/outputs/team-standards.md`

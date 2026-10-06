# Rule Creator Transcript

## Task

Add a rule to prevent developers from committing `console.log` debugging statements.

## Step 1: Discovery

Found one rules file: `.claude/rules/team-standards.md` (scoped to `src/**/*`).

Sections: Code Style, Debugging, Testing.

Existing enforcement blocks: **0** (none of the current rules have enforcement blocks).

## Step 2: Placement decision

The rule belongs in the **Debugging** section. There is already a related bullet about using a dedicated logger instead of raw `console.*` calls. The new rule complements it by explicitly banning the debugging-oriented console methods.

## Step 3: Rule text

> Do not commit `console.log`, `console.debug`, or `console.info` calls.

Written in imperative mood, single clear sentence, no qualifiers. Scoped to the three console methods typically used for debugging. `console.warn` and `console.error` are intentionally excluded because they often serve legitimate purposes in production code (and the existing rule already guides developers toward a logger for persistent logging).

## Step 4: Sorting test

**Step 1 -- Can a tool catch it?**

Ask: "Can a regex, AST walker, or lint rule detect every violation of this rule without understanding intent?"

**Yes.** The violation has a clear syntactic signature: the literal tokens `console.log(`, `console.debug(`, `console.info(` in source files. A regex pattern `console\.(log|debug|info)\s*\(` matches these reliably. ESLint's built-in `no-console` rule also catches this. No understanding of developer intent is needed -- the presence of the call is the violation, regardless of context.

No adjective trap: the rule is binary (the call exists or it doesn't).

**Classification: T1** (deterministic, pre-commit).

## Step 5: Enforcement block

```yaml
enforcement:
  tier: T1
  pattern: "console\\.(log|debug|info)\\s*\\("
  assert: "No console.log/debug/info calls in committed source files"
  scope: "src/**/*.{ts,tsx}"
  fix: "Remove the console statement, or replace with the project's logger utility if the log is intentional"
```

Field reasoning:
- **pattern**: Regex matching the three banned console methods followed by an opening parenthesis. Specific enough to avoid false positives on strings like "console.error" which are intentionally allowed.
- **scope**: `src/**/*.{ts,tsx}` -- scoped to source files only, not config files, scripts, or test utilities where console usage may be acceptable.
- **fix**: Two options given -- remove (for debugging leftovers) or replace with logger (for intentional logging).

## Step 6: Budget check

Aggregated across all discovered rules files:

| Budget | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 rules | 0 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 | 0 | 10 | OK |
| Critical T3 | 0 | 10 | OK |

This rule is T1, so it has no impact on T3 budgets. All clear.

## Rule ID

Implicit ID: `team-standards:debugging:T1`

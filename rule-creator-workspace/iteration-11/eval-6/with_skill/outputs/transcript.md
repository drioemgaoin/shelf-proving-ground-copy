# Rule Creator Transcript

## Discovery

Found 1 rules file:
- `.claude/rules/team-standards.md`

No `CODING_STANDARDS.md` found.

### Existing enforcement blocks

| File | T1 | T2 | T3 | Human | Total |
|------|----|----|----|----|-------|
| team-standards.md | 0 | 0 | 0 | 0 | 0 |
| **Totals** | **0** | **0** | **0** | **0** | **0** |

No existing enforcement blocks. All budgets at zero.

## New Rule: No console.log calls

### Section selection

The file already has a "Debugging" section with a related rule about using a logger utility. The new rule belongs here -- it's the enforcement counterpart: the existing rule says *what to use instead*, the new rule says *what's forbidden*.

### Rule text

> Do not commit `console.log`, `console.debug`, `console.warn`, or `console.info` calls.

Written in imperative mood, one clear sentence. Covers all common console methods used for debugging. Does not include `console.error` since error logging to the console may be intentional in production error boundaries.

### Sorting test

**Step 1: Can a tool catch it?**

Ask: "Can a regex, AST walker, or lint rule detect every violation of this rule without understanding intent?"

**Yes.** The pattern `console.log(`, `console.debug(`, `console.warn(`, `console.info(` is a syntactic signature. A regex like `\bconsole\.(log|debug|warn|info)\s*\(` matches every violation. There is an existing ESLint rule (`no-console`) that does exactly this. The violation is always wrong in committed code regardless of context -- if persistent logging is needed, the team's own rule says to use a logger utility.

**Classification: T1** (deterministic, pre-commit).

No adjective trap -- the rule is about the presence of specific function calls, not a quality judgment.

### Generated enforcement block

```yaml
enforcement:
  tier: T1
  pattern: "\\bconsole\\.(log|debug|warn|info)\\s*\\("
  assert: "No console.log/debug/warn/info calls in committed source files"
  scope: "src/**/*.{ts,tsx,js,jsx}"
  fix: "Remove the console call, or replace with the project's logger utility if the log is intentional"
```

**Rule ID:** `team-standards:debugging:T1`

### Placement

Appended as a new bullet in the "Debugging" section, after the existing logger-utility rule. The enforcement block is indented under the bullet per the skill's formatting guidance.

## Budget checks

| Budget | Limit | Current (after) | Status |
|--------|-------|-----------------|--------|
| Total T3 rules | 150 warn / 200 soft / 300 hard | 0 | OK |
| Scopeless T3 (`scope: "*"` or missing) | 10 | 0 | OK |
| Critical T3 (`critical: true`) | 10 | 0 | OK |

**Per-file breakdown:**

| File | T1 | T2 | T3 | Human | Total |
|------|----|----|----|----|-------|
| team-standards.md | 1 | 0 | 0 | 0 | 1 |
| **Totals** | **1** | **0** | **0** | **0** | **1** |

All budgets well within limits. No action needed.

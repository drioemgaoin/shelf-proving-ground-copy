# Rule Creator Transcript

## Task
Add a rule to prevent developers from committing `console.log` debugging statements.

## Discovery
Found rules file: `.claude/rules/team-standards.md` (scoped to `src/**/*`).

Existing sections: Code Style (2 rules), Debugging (1 rule), Testing (1 rule).

Existing enforcement blocks: 0 across all sections.

## Rule Placement Decision
The "Debugging" section is the natural home. The existing rule there covers the *alternative* to use (logger utility for persistent logging). The new rule covers the *prohibition* (no console.log in commits). They complement each other.

## Rule Text
"Do not commit `console.log` statements; remove all debugging console calls before committing."

Written in imperative mood, single clear sentence, states what is forbidden.

## Sorting Test

### Step 1: Can a tool catch it?
**Question:** Can a regex, AST walker, or lint rule detect every violation without understanding intent?

**Answer:** Yes. `console.log(` is a syntactic signature that is always wrong in committed code (per this team's standards). ESLint's `no-console` rule or a simple regex `console\.log\(` catches every instance deterministically. No understanding of intent required -- the rule is a blanket prohibition on `console.log` in source files.

**Adjective trap check:** No qualifying adjectives in this rule. The prohibition is absolute, not judgment-based.

**Result:** T1 (deterministic, pre-commit).

### Steps 2-4: Not needed
T1 was confirmed at Step 1.

## Enforcement Block
Generated a T1 block with:
- **pattern:** `console\.log\(` -- matches any console.log call
- **assert:** "No console.log calls exist in committed source files"
- **scope:** `src/**/*.{ts,tsx,js,jsx}` -- narrowed to source files only (not config, not test utilities)
- **fix:** "Remove the console.log call. If persistent logging is needed, use the project's logger utility instead." -- ties back to the existing logger rule

## Budget Check
Aggregated across all discovered rules files:
- T3 rules: 0 (limit: 150 warn / 200 soft cap / 300 hard cap) -- well within budget
- Scopeless T3: 0 (limit: 10) -- no impact
- Critical T3: 0 (limit: 10) -- no impact

Adding a T1 rule has no effect on T3 budgets.

## Rule ID
Implicit ID: `team-standards:debugging:T1`

## Output
Modified `team-standards.md` with the new rule and enforcement block inserted as the first item under the Debugging section, before the existing logger utility rule.

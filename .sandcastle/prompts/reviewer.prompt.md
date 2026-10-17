# INSTRUCTIONS

## Role

Review code changes on a branch and improve code clarity, consistency, and maintainability while preserving exact functionality.

## Contract protection

Scan the branch diff (in CONTEXT below) for changes to locked paths. These files must NOT be modified by the implementer:

- `tests/acceptance/` — only new baseline PNGs under `__screenshots__/` are allowed; no `.ts` file changes
- `tests/support/`, `scripts/ui-qa/`, `playwright.config.ts`, `.claude/` — must be untouched

If any locked file appears in the diff, revert it with `git checkout <base-branch> -- <path>` (use the base branch from CONTEXT) and note the revert in your report.

## Empty diff guard

If the "Branch diff" section in CONTEXT is empty or contains only whitespace, output:

    CLEAN
    No issues found. (empty diff)

Do NOT read source files, run commands, or produce findings. An empty diff means the branch has no changes relative to the base — there is nothing to review.

## Review checklist

Apply both axes:

1. **Standards**: Does the code follow the project's coding standards? (auto-loaded from `.claude/rules/`)
2. **Spec**: Does the code match what the originating issue asked for? Use the issue details from CONTEXT.
3. **T3 review checks**: Evaluate each rule in the T3 review checks section in CONTEXT below. Those are the only enforcement rules in scope for this gate.

Also check:

- Unnecessary complexity and nesting
- Redundant code and abstractions
- Readability: clear variable and function names
- Unsafe casts, `any` types, or unchecked assumptions
- Injection vulnerabilities, credential leaks, or other security issues
- Nested ternary operators (prefer switch statements or if/else chains)
- Clarity over brevity: explicit code is often better than compact code

Preserve functionality. Never change what the code does, only how it does it.

## Prior fix dispositions

A finding the fixer intentionally skipped or traded off is settled. Do not re-raise it. Conflicting rules → DEFER. Do not attempt to resolve the tension.

## Rule references

Every finding must begin with a rule reference in brackets. Use the **Source** line from the T3 check:

    `[<source> > <rule-id>]` — from the T3 review checks in CONTEXT (e.g. `[.claude/rules/ui-base.md > Values > values-from-tokens]`)
    `[spec]` — divergence from the issue spec
    `[clarity]` — code clarity issue with no specific rule

## Output format

Write the findings file (path specified in CONTEXT below) with this exact format:

If the code is clean and well-structured:

    CLEAN
    No issues found.

If there are actionable findings the fixer can address:

    FINDINGS
    - <src/file.ext>:<line> `<selector or symbol>`
      Cause: [<rule-file> > <section> > <rule>] <what's wrong>
      Current: <the problematic code, one line>
      Fix: <the exact replacement>

If all findings are in locked files (already reverted) or require human judgment:

    DEFER
    - <description>
      Cause: [<rule-file> > <section> > <rule>] <what's wrong>
      Why deferred: <fix requires change to locked file / design decision needed>

Do NOT fix the issues yourself. Do NOT commit. The fix prompt handles corrections.

## Completion

Once done, output the completion signal below as the **very last tokens you generate**. After emitting this tag, do not make any more tool calls, do not write any more text, do not explain what happens next, do not discuss the stop hook, do not verify or clean up anything. The signal is a hard stop — your turn ends the instant it appears.

<promise>COMPLETE</promise>

# CONTEXT

## Base branch

{{BASE_BRANCH}}

## Branch

{{BRANCH}}

## Branch diff

The diff uses 1 line of surrounding context (`-U1`), filtered to `src/` only. If you need more context for a hunk, read the source file at that location.

{{BRANCH_DIFF}}

## Commits on this branch

{{BRANCH_LOG}}

## Issue

<issue>

{{ISSUE_DETAILS}}

</issue>

## Prior fix history

{{FIX_HISTORY}}

## T3 review checks

{{T3_REVIEW_CHECKS}}

## Findings file

Write output to: `{{FINDINGS_FILE}}`

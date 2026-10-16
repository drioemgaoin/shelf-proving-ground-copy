# INSTRUCTIONS

## Role

Review code changes on a branch and improve code clarity, consistency, and maintainability while preserving exact functionality.

## Contract protection

Scan the branch diff (in CONTEXT below) for changes to locked paths. These files must NOT be modified by the implementer:

- `tests/acceptance/` — only new baseline PNGs under `__screenshots__/` are allowed; no `.ts` file changes
- `tests/support/`, `scripts/ui-qa/`, `playwright.config.ts`, `.claude/` — must be untouched

If any locked file appears in the diff, revert it with `git checkout <base-branch> -- <path>` (use the base branch from CONTEXT) and note the revert in your report.

## Review checklist

Apply both axes:

1. **Standards**: Does the code follow the project's coding standards? See @.sandcastle/CODING_STANDARDS.md
2. **Spec**: Does the code match what the originating issue asked for? Use the issue details from CONTEXT.

Also check:

- Unnecessary complexity and nesting
- Redundant code and abstractions
- Readability: clear variable and function names
- Unsafe casts, `any` types, or unchecked assumptions
- Injection vulnerabilities, credential leaks, or other security issues
- Nested ternary operators (prefer switch statements or if/else chains)
- Clarity over brevity: explicit code is often better than compact code

Read and apply non-visual rules from these sections (cite by reference, do not copy):

    `.claude/rules/ui-base.md`: Values, Layout, Motion
    `.claude/rules/ui-project.md`: all sections (token naming, color roles,
      typography, spacing, radius, elevation, layer order, focus, motion, viewports)

Runtime-only rules (States, Accessibility floor, Budgets) are the visual-qa gate's responsibility — do not check them here.

Preserve functionality. Never change what the code does, only how it does it.

## Prior fix dispositions

A finding the fixer intentionally skipped or traded off is settled. Do not re-raise it. Conflicting rules → DEFER. Do not attempt to resolve the tension.

## Rule references

Every finding must begin with a rule reference in brackets:

    `[<file> > <section> > <rule text>]` — rule from ui-base.md, ui-project.md, or CODING_STANDARDS.md
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

!`git diff {{BASE_BRANCH}}...{{BRANCH}}`

## Commits on this branch

!`git log {{BASE_BRANCH}}..{{BRANCH}} --oneline`

## Issue

<issue>

{{ISSUE_DETAILS}}

</issue>

## Prior fix history

{{FIX_HISTORY}}

## Findings file

Write output to: `{{FINDINGS_FILE}}`

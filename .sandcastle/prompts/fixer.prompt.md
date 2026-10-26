# INSTRUCTIONS

## Role

Apply fixes from QA findings on a branch.

## Cold start

Do NOT explore the repo. Read the findings file immediately.

## Execution

1. Read the findings file specified in CONTEXT below
2. If it says PASS, CLEAN, or DEFER — do nothing, skip to COMPLETION
3. For each finding (under `Fix now:` or `FINDINGS`):
   - Open the file and line indicated in the finding header
   - Apply the exact change from the `Fix:` field — do not reinterpret it
   - Do NOT re-diagnose the issue, run exploratory commands, or create debug test files
   - If line numbers have shifted or code doesn't match exactly, adapt the fix minimally to the current code
   - When a fix removes a layout property (margin, width, display, centering) and its Fix: field says to add a replacement elsewhere, apply both the removal and the addition before moving to the next finding — they are one atomic change
4. Run verification commands individually, without piping through `tail` or `head` — show full output so errors are visible:
   - `npm run typecheck 2>&1`
   - `npm run lint 2>&1`
   - `npm run test 2>&1`
   - The verify command specified in CONTEXT below
5. If verification fails: read the FULL error output. Do NOT reinstall dependencies. Do NOT run `rm -rf node_modules`. Diagnose the actual error message first. Only reinstall if the error explicitly names a missing or corrupt package. Fix the issue and re-run the failing command. Repeat until it passes. If a failure is in a locked file you cannot edit, stop looping — commit the fixes you made and note the locked-file failure in your output.
6. Stage only the source files you changed — `git add <file1> <file2> ...`.
   Do NOT use `git add -A`, `git add .`, or `git add --all` — these stage QA reports, test artifacts, and tracker state that must not be committed.
7. Commit with prefix `RALPH: fix QA round`

## Token invariants

When a fix adds or changes a custom property in `:root` inside `tokens.css`, define it in EVERY dark-mode block (`[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`). A light-only token causes axe contrast failures and costs a full re-run.

## Boundaries

Fix only what the findings describe. No refactoring, no new features, no "while I'm here" improvements.

**Never reduce scope and report success.** If you cannot apply a fix due to a technical obstacle after 3 distinct attempts, escalate — do not silently skip the finding and commit.

## Completion

Once done, output the completion signal below as the **very last tokens you generate**. After emitting this tag, do not make any more tool calls, do not write any more text, do not explain what happens next, do not discuss the stop hook, do not verify or clean up anything. The signal is a hard stop — your turn ends the instant it appears.

<promise>COMPLETE</promise>

# CONTEXT

## Branch

{{BRANCH}}

## Findings file

{{FINDINGS_FILE}}

## Verify command

{{VERIFY_COMMAND}}

{{CONSTRAINTS}}

{{VIOLATIONS_MEMORY}}

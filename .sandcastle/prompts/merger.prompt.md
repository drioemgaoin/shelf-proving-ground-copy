# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`
2. If there are merge conflicts, resolve them by reading both sides of the conflict markers and choosing the correct resolution. Only edit inside conflict regions — do not refactor, improve, or "fix" source code outside of conflict markers.
3. After resolving conflicts, run `npm run typecheck` and `npm run test` to verify everything works
4. If verification fails after the merge, the failure is caused by the merge itself — resolve it by adjusting your conflict resolution (re-read both sides, pick the correct version). Do NOT edit source files to fix bugs, type errors, or test failures that require new code. If the failure cannot be resolved by re-doing the conflict resolution, abort the merge with `git merge --abort` and report the issue.

After all branches are merged, make a single commit summarizing the merge.

## Boundaries

- Do NOT push to remote — the orchestrator handles that
- Do NOT delete branches — the orchestrator handles cleanup
- Do NOT edit source files outside of merge conflict resolution
- Do NOT install or remove dependencies

# CLOSE ISSUES

For each branch that was merged, close its issue using the following command (replace `<ID>` with the issue ID):

`{{CLOSE_TASK_COMMAND}}`

Here are all the issues:

{{ISSUES}}

## Completion

Once done, output the completion signal below as the **very last tokens you generate**. After emitting this tag, do not make any more tool calls, do not write any more text, do not explain what happens next, do not discuss the stop hook, do not verify or clean up anything. The signal is a hard stop — your turn ends the instant it appears.

<promise>COMPLETE</promise>

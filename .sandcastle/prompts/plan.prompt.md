# TASK

Analyze the open issues and build a dependency graph. For each issue, determine whether it **blocks** or **is blocked by** any other open issue.

An issue B is **blocked by** issue A if:

- B requires code or infrastructure that A introduces
- B and A modify overlapping files or modules, making concurrent work likely to produce merge conflicts
- B's requirements depend on a decision or API shape that A will establish

An issue is **unblocked** if it has zero blocking dependencies on other open issues.

For each unblocked issue, assign a branch name using the exact format `sandcastle/issue-{id}` (no slug or other suffix). This must be deterministic so that re-planning the same issue always produces the same branch name and accumulated progress is preserved.

# OUTPUT

Output your plan as a JSON object wrapped in `<plan>` tags:

<plan>
{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42", "touchesUI": false, "scope": "src/api/**"}]}
</plan>

For each issue:

- `touchesUI`: `true` if the work involves UI rendering, components, styling, layout, or visual behavior. `false` for infrastructure, tooling, data logic, or configuration-only work. Use the `ui` label as a strong hint. When in doubt, set `true`.
- `scope`: a comma-separated glob pattern covering ONLY the files the agent will read or write. Never use bare `src/**` — use directory globs for the specific subtrees involved. For a component ticket, scope the component subtree plus shared modules it imports (e.g., `"src/components/Drawer/**,src/App.tsx,src/styles/tokens.css"`). Do NOT list individual files in the same directory as separate segments — merge them into a single directory glob (e.g., `"src/**"` instead of `"src/App.tsx,src/api.ts,src/fixtures.ts"`). Separate scope segments are only useful for **disjoint directories** (e.g., `"src/**,tests/acceptance/shelf-grid/**"`). Default to `"src/**"` only if the ticket truly touches every source file. This generates a codemap — fewer segments means fewer wasted tokens.

Include only unblocked issues. If every issue is blocked, include the single highest-priority candidate (the one with the fewest or weakest dependencies).

Always emit the `<plan>` tags, even when there is nothing to do. If there are no issues to work on at all, output `<plan>{"issues": []}</plan>` so the run can exit cleanly.

## Completion

Once done, output the completion signal below as the **very last tokens you generate**. After emitting this tag, do not make any more tool calls, do not write any more text, do not explain what happens next, do not discuss the stop hook, do not verify or clean up anything. The signal is a hard stop — your turn ends the instant it appears.

<promise>COMPLETE</promise>

# ISSUES

Here are the open issues in the repo (pre-filtered to issues ready for work):

<issues-json>

{{READY_ISSUES}}

</issues-json>

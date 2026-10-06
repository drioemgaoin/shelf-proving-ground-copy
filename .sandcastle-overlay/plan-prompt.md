# ISSUES

Here are the open issues in the repo (pre-filtered to issues ready for work):

<issues-json>

{{READY_ISSUES}}

</issues-json>

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
- `scope`: a comma-separated glob pattern covering the directories/files the agent will need to work in (e.g., `"src/**"`, `"src/api.ts,src/fixtures.ts"`). This is used to generate a codemap — a navigation cheat sheet so the agent skips file exploration. Scope should be tight (just the working area), not the whole repo. Default to `"src/**"` if unsure.

Include only unblocked issues. If every issue is blocked, include the single highest-priority candidate (the one with the fewest or weakest dependencies).

Always emit the `<plan>` tags, even when there is nothing to do. If there are no issues to work on at all, output `<plan>{"issues": []}</plan>` so the run can exit cleanly.

# TASK

Review the code changes on branch `{{BRANCH}}` and improve code clarity, consistency, and maintainability while preserving exact functionality.

# CONTEXT

## Branch diff

!`git diff {{TARGET_BRANCH}}...{{BRANCH}}`

## Commits on this branch

!`git log {{TARGET_BRANCH}}..{{BRANCH}} --oneline`

# CONTRACT PROTECTION

Verify that the locked files were not modified by the implementer:

- `e2e/acceptance/` — only new baseline PNGs under `__screenshots__/` are allowed
- `e2e/support/`, `scripts/ui-qa/`, `playwright.config.ts`, `.claude/` — must be untouched

If any were modified, revert the changes with `git checkout {{TARGET_BRANCH}} -- <path>` before proceeding.

# REVIEW PROCESS

Use the code-review skill. Apply both axes:

1. **Standards**: Does the code follow the project's coding standards? See @.sandcastle/CODING_STANDARDS.md
2. **Spec**: Does the code match what the originating issue asked for? Pull the issue with `bd show`.

Also check:

- Unnecessary complexity and nesting
- Redundant code and abstractions
- Readability: clear variable and function names
- Unsafe casts, `any` types, or unchecked assumptions
- Injection vulnerabilities, credential leaks, or other security issues
- Nested ternary operators (prefer switch statements or if/else chains)
- Clarity over brevity: explicit code is often better than compact code

Preserve functionality. Never change what the code does, only how it does it.

# EXECUTION

If you find improvements to make:

1. Make the changes directly on this branch
2. Run `npm run typecheck` and `npm run test` to ensure nothing is broken
3. Commit describing the refinements

If you made changes that touch UI files (`src/`), delegate to the **visual-qa** agent to re-validate. The finish hook requires a passing QA report when UI files changed.

If the code is already clean and well-structured, do nothing.

Once complete, output <promise>COMPLETE</promise>.

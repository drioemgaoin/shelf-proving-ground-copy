# Shelf

A small personal reading-list web app. Its real purpose is to be a test bed for the UI kit: every feature is chosen to exercise a part of the UI review and fix flow (states, dialogs, motion, responsive layout, dark mode, accessibility).

## Product

A reader keeps a list of books.

- **Welcome** (`/`): the existing starter screen. Left as is on purpose: it's the "old screen with no tests" used to test cover mode.
- **Book list** (`/books`): books as cards in a responsive grid. Loading, empty, error and populated states. Long titles are truncated with a way to read the full title.
- **Add book** dialog: title (required), author, status (to read, reading, finished). Inline validation, focus trapped, Escape closes, a toast confirms success.
- **Book details** drawer: opens from a card. Slides in from the right on desktop, from the bottom on mobile. Change status or remove the book (with undo).
- **Theme**: light, dark, or system, remembered between visits.

Data lives in memory behind a small async API module with a realistic delay. No backend.

## Stack and commands

Vite, React, TypeScript. Vitest for unit tests, Playwright for UI tests.

| Command | Does |
|---|---|
| `npm run dev` | Start the app |
| `npm run typecheck` | Type-check app and tests |
| `npm run lint` | Lint |
| `npm test` | Unit tests |
| `npm run e2e` | All Playwright tests |
| `npm run ui:qa` | UI gate: all projects, compact summary, report for the finish hook |
| `npm run sandcastle` | Build the next ready ticket in a sandbox |

## Conventions the tests rely on

- **Fixtures.** In dev, the API reads `?fixture=` from the URL: `empty`, `error`, `slow` (3 s delay), `long` (very long titles and names), `many` (60 books). Tests use these to show every state on demand. The first ticket that touches data must build this.
- **Dynamic content.** Anything that changes between runs (dates, relative times) carries `data-dynamic`, so screenshots mask it.
- **Accessible names.** Every control has one. Tests find elements by role and name only.

## How work happens

All app code is written in Sandcastle, never in an interactive session. A hook blocks edits to `src/` on the host (except `src/styles/tokens.css`, owned by ui-foundation).

**Day shift (you, interactive `claude`):** decide and specify.

| Situation | Flow |
|---|---|
| New feature | grill-with-docs → to-spec → ui-contract (feature) → to-tickets |
| Bug report | triage → ui-contract (bug) |
| Old screen without tests | ui-contract (cover) |
| Design change | ui-foundation |

**Night shift (`npm run sandcastle`):** one ticket per run in Docker. The builder uses the tdd skill, makes the ticket's acceptance tests pass, delegates to the visual-qa agent, and can't finish until the checks pass. Then a reviewer runs the code-review skill.

**Morning (you):** review the branch, look at every new screenshot under `e2e/__screenshots__/`, merge. Merging approves the baselines. Triage anything visual-qa filed.

Tickets ready for an agent carry the `Sandcastle` label.

## UI rules

`.claude/rules/ui-base.md` (universal) and `.claude/rules/ui-project.md` (this project) load automatically when working in `src/`. Token values live only in `src/styles/tokens.css`.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

# Shelf

A small personal reading-list web app. Its real purpose is to be a test bed for the UI kit: every feature is chosen to exercise a part of the UI review and fix flow (states, dialogs, motion, responsive layout, dark mode, accessibility).

## Product

A reader manages a single list of books they want to track — adding, browsing, and organizing by reading status. Data is in-memory with no backend or persistence.

- **Shelf grid**: Fluid card grid showing all books. Filter by status via multi-select chips with an "All" default. Newest-first insertion order. Exercises responsive layout (1–4 columns), skeleton loading, staggered card entrance animation, empty state, and full-page error state.
- **Book card**: Displays title (2-line truncate), author (1-line truncate), and status badge (colored pill, top-right). Tap to open Drawer. Exercises truncation, dark-mode theming, and keyboard navigation (tab through cards, Enter to open).
- **Drawer**: Modal side panel (right on desktop, bottom sheet on mobile, max ~70vh). Two modes — Add mode (empty fields, focus title on open) and Detail mode (pre-filled fields, segmented status control, inline delete with confirm/cancel transformation). All changes immediate. Close via X / click-outside / swipe-down / Escape with focus return to trigger. Exercises focus trap, `aria-modal`, responsive panel, slide animation, and live-region announcements for all mutations.
- **FAB**: Floating action button (bottom-right) opens Drawer in Add mode. Hidden when Drawer is open. Exercises z-index layering and mobile safe-area insets.
- **Fixture system**: URL parameter (`?fixture=`) switches the in-memory API to deterministic test states: `empty` (zero books, empty-state CTA), `error` (load failure, full-page retry), `slow` (2s delay, 6 skeleton cards), `long` (absurd titles/authors for truncation stress), `many` (200 books for scroll/grid stress). Default (no param): 5–8 seed books across all three statuses.

## Stack and commands

Vite, React, TypeScript. Vitest for unit tests, Playwright for UI tests.

| Command              | Does                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `npm run dev`        | Start the app                                                      |
| `npm run typecheck`  | Type-check app and tests                                           |
| `npm run lint`       | Lint                                                               |
| `npm test`           | Unit tests                                                         |
| `npm run e2e`        | All Playwright tests                                               |
| `npm run ui:qa`      | UI gate: all projects, compact summary, report for the finish hook |
| `npm run sandcastle` | Build the next ready ticket in a sandbox                           |

## Conventions the tests rely on

- **Fixtures.** The query parameter `?fixture=` controls app state. Valid values: `empty`, `error`, `slow`, `long`, `many`. No parameter = default seed data (5–8 books). Playwright sets this directly on navigation.
- **Dynamic content.** Seed/fixture data is fully deterministic — no randomness or timestamps that would destabilize screenshots. UUIDs in fixture data are hardcoded, not generated.
- **Accessible names.** Every interactive control has an accessible name. Tests locate elements by role and accessible name only — never by CSS class, `data-testid`, or DOM structure. The Drawer is `role="dialog"` with `aria-modal="true"`. Status changes and add/delete mutations announce via `aria-live="polite"`.

## How work happens

All app code is written in Sandcastle, never in an interactive session. A hook blocks edits to `src/` on the host (except `src/styles/tokens.css`, owned by ui-foundation).

**Day shift (you, interactive `claude`):** decide and specify.

| Situation                | Flow                                                           |
| ------------------------ | -------------------------------------------------------------- |
| New product (greenfield) | grill-with-docs → to-product                                   |
| New feature              | grill-with-docs → to-spec → ui-contract (feature) → to-tickets |
| Bug report               | triage → ui-contract (bug)                                     |
| Old screen without tests | ui-contract (cover)                                            |
| Design change            | ui-foundation                                                  |

**Specs vs tickets.** Issues carry a kind label (see `docs/agents/issue-kinds.md`). A `spec` is a parent issue with the full design — not buildable by itself. A `ticket` is a child issue scoped for one context window — buildable by an agent. to-spec creates specs; to-tickets creates child tickets under them. A spec is complete when all its child tickets are closed. The tracker determines how parent/child relationships are expressed (Beads: `--parent=<id>`; GitHub: reference in body + label; custom: whatever the project uses).

**to-tickets default input.** When `to-tickets` is invoked without an explicit spec reference, it must automatically find the first available spec — using the project's tracker (e.g. `bd ready` for Beads, the oldest open `spec`-labeled issue for GitHub) — and use that as the spec to break down. Do not prompt the user to choose.

**Night shift (`npm run sandcastle`):** one ticket per run in Docker. The builder uses the tdd skill and makes the ticket's acceptance tests pass. Then the orchestrator runs visual-qa and code-review as separate phases — the builder does not spawn these itself.

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

## Agent skills

### Issue tracker

Issues are tracked with Beads (`bd`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary. See `docs/agents/triage-labels.md`.

### Issue kinds

Specs vs tickets. See `docs/agents/issue-kinds.md`.

### Domain docs

Single-context layout. See `docs/agents/domain.md`.

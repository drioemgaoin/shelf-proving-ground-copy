# UI kit for Claude Code + Matt Pocock's skills + Sandcastle

Everything needed to specify, build, review and fix UI with agents, with no visual surprises. Copy the contents into a repo root.

To try it end to end, the kit doubles as the starter for **Shelf**, a small test app: see `CLAUDE.md` for the app and `TEST-PLAN.md` for the step-by-step validation.

## What's inside

### Yours (the UI layer)

| Artifact | Type | Path | Mission |
|---|---|---|---|
| ui-foundation | Skill | `.claude/skills/ui-foundation/` | Create design tokens in code and the project UI rules |
| ui-contract | Skill | `.claude/skills/ui-contract/` | Write locked UI tests: feature, bug, or cover mode |
| visual-qa | Agent | `.claude/agents/visual-qa.md` | Check the UI in its own context, report, never fix |
| ui-base | Rule | `.claude/rules/ui-base.md` | Universal UI rules, loaded when `src/` is touched |
| ui-project | Rule | `.claude/rules/ui-project.md` | Project rules, written by ui-foundation |
| guard | Hook (before each action) | `.claude/hooks/guard.mjs` | Lock the contract in the sandbox; lock app code on the host |
| backpressure | Hook (on finish) | `.claude/hooks/backpressure.mjs` | Block finishing until checks and visual QA pass |
| hook wiring | Config | `.claude/settings.json` | Registers both hooks |
| css-patterns | Skill | `.claude/skills/css-patterns/` | Your styling patterns, used by ui-foundation |
| ui:qa | Script | `scripts/ui-qa/` | Run all UI tests, print a short summary, write the report |
| Test helpers | Test code | `e2e/support/` | Console guard, screenshots, tokens, motion, layout, focus, axe |
| Playwright config | Test config | `playwright.config.ts` | Viewports, dark, 200% zoom, WebKit; tag routing |
| Sandcastle overlay | Loop config | `.sandcastle-overlay/` | Implement + review loop with the UI guard on |
| Bootstrap | Script | `scripts/bootstrap.sh` | One-time setup of the Shelf test app |

### Matt Pocock's (unchanged, MIT licensed, see `THIRD_PARTY_LICENSE-mattpocock-skills.txt`)

`grill-me`, `grilling`, `grill-with-docs`, `domain-modeling`, `to-spec`, `to-tickets`, `implement`, `tdd`, `code-review`, `diagnosing-bugs`, `triage`, `handoff`, `prototype`, `setup-matt-pocock-skills`.

Copied from github.com/mattpocock/skills as project files. If you prefer his managed plugin (`claude plugins install mattpocock-skills`), delete these folders so you don't have every skill twice.

## How the pieces connect

Pocock's skills run the pipeline and are not modified. The UI layer plugs in at three points:

1. **ui-foundation** once per project, before feature work.
2. **ui-contract** right after `to-spec` (feature), `triage` (bug), or on its own (cover).
3. Automatically during every Sandcastle run: the rules load when `src/` is touched, the builder delegates to **visual-qa**, and the hooks enforce the rest.

They share work through the issue tracker (spec, "UI acceptance" section, tickets naming their tests) and the locked test files in `e2e/acceptance/`.

## Environment switches

| Variable | Where | Effect |
|---|---|---|
| `UI_GUARD=afk` | Set by `.sandcastle/main.ts` | Sandbox mode: contract locked, finish hook on |
| `UI_GUARD_BASE` | Set by `.sandcastle/main.ts` | Branch the work started from |
| `UI_HOST_LOCK=off` | Your shell, rarely | Allow a deliberate manual edit of `src/` on the host |
| `UI_CHECK_CMDS` | Optional | Finish-hook checks, `;;`-separated (default typecheck, lint, test) |
| `UI_PATHS` | Optional | Which changes count as UI (default `src/`, `index.html`, `public/`) |
| `UI_CONSOLE_ALLOW` | Optional | Regex of console errors to ignore |
| `SANDCASTLE_MAX_ITERATIONS`, `SANDCASTLE_AUTO_MERGE` | Your shell | Tickets per run; auto-merge green branches |

## Known limits

- Layout-shift, filmstrip and frame checks are Chromium only; WebKit covers behavior, layout, visuals and a11y.
- Path-scoped rule loading has varied across Claude Code versions. `TEST-PLAN.md` Phase 0 checks it and gives the fallback.
- The guard stops accidents and shortcuts, not a determined adversary. The finish hook's git check and your review are the backstop.
- Your `css-patterns` skill references gate scripts (`verify.sh` and friends) that weren't in the copy available to me. Add them to `.claude/skills/css-patterns/` and append the gate to `UI_CHECK_CMDS`.

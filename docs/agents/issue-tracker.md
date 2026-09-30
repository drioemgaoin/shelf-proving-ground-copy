# Issue tracker: Beads

Issues and specs for this repo live in the local Beads database (`bd`).

## Conventions

- Create issues with `bd create --title="..." --description="..." --type=task|bug|feature --priority=2`
- Hierarchical children: `bd create ... --parent=<id>`
- Dependencies: `bd dep add <issue> <depends-on>`
- Labels are applied via `bd update <id> --labels=<label>`

## When a skill says "publish to the issue tracker"

Run `bd create` with the appropriate title, description, type, and priority.

## When a skill says "fetch the relevant ticket"

Run `bd show <id>`. The user will normally pass the issue ID directly.

## When a skill says "apply a triage label"

Run `bd update <id> --labels=<label>` using the label from `triage-labels.md`.

## When a skill says "list issues" or "find issues"

Run `bd list`, `bd search <query>`, or `bd ready` as appropriate.

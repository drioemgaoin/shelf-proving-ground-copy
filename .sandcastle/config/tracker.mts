// Issue tracker command templates.
// Each command uses <ID>, <COMMENT>, <TITLE>, <DESCRIPTION> as placeholders.
//
// To switch trackers (GitHub, custom), change these strings.
// The --tickets flag overrides them at runtime in main.mts.

export const VIEW_TASK_COMMAND = "bd show <ID>";
export const LIST_READY_COMMAND = "bd ready --json --label=Sandcastle";
export const CLOSE_TASK_COMMAND = 'bd close <ID> --reason="Completed by Sandcastle"';
export const COMMENT_TASK_COMMAND = 'bd update <ID> --notes "<COMMENT>"';
export const CREATE_BUG_COMMAND =
  'bd create --type=bug --label=ready-for-human --title="<TITLE>" --description="<DESCRIPTION>"';
export const LABEL_TASK_COMMAND = "bd label add <ID> ready-for-human";

/** Override commands for --tickets mode (no real tracker). */
export const TICKET_OVERRIDES = {
  VIEW_TASK_COMMAND: "",
  LIST_READY_COMMAND: "",
  CLOSE_TASK_COMMAND: 'echo "ticket <ID> complete"',
  COMMENT_TASK_COMMAND: 'echo "ticket <ID>: <COMMENT>"',
  CREATE_BUG_COMMAND: 'echo "bug: <TITLE>"',
  LABEL_TASK_COMMAND: 'echo "label <ID>"',
} as const;

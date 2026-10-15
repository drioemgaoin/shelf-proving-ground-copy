// Orchestrator-level constants.

/** Maximum number of plan → execute → merge cycles before stopping. */
export const MAX_ITERATIONS = 10;

/** Maximum QA gate rounds (checker → fixer) before escalating. */
export const MAX_GATE_ROUNDS = 3;

// Orchestrator-level constants.

/** Maximum number of plan → execute → merge cycles before stopping. */
export const MAX_ITERATIONS = 10;

/** Maximum QA gate rounds (checker → fixer) before escalating. */
export const MAX_GATE_ROUNDS = 3;

/** Maximum fixer passes within one round (shrinking backlog). */
export const MAX_FIXER_PASSES = 5;

/** Maximum findings per fixer batch (avoids context overflow). */
export const BATCH_SIZE = 30;

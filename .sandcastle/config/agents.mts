// Agent role assignments — change the model/provider here;
// stats and pricing follow automatically via TaggedAgent.

import { claude } from "../lib/tagged-agent.mjs";

export const PLANNER = claude("claude-opus-4-8");
export const IMPLEMENTER = claude("claude-opus-4-8");
export const VISUAL_QA = claude("claude-sonnet-4-6");
export const VISUAL_FIXER = claude("claude-opus-4-8");
export const REVIEWER = claude("claude-sonnet-4-6");
export const CODE_FIXER = claude("claude-opus-4-8");
export const MERGER = claude("claude-opus-4-8");

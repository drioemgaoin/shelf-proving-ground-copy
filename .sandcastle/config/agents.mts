// Agent role assignments — change the model/provider here;
// stats and pricing follow automatically via TaggedAgent.

import { claude } from "../lib/tagged-agent.mjs";

// 1-hour prompt cache TTL — the default 5-min TTL expires mid-pipeline
// (a full ticket flow takes ~12 min). 1h ensures the entire flow and the
// next run both benefit from cached prefixes.
const CACHE_ENV = { ENABLE_PROMPT_CACHING_1H: "1" };

export const PLANNER = claude("claude-opus-4-8", { env: CACHE_ENV });
export const IMPLEMENTER = claude("claude-opus-4-8", { env: CACHE_ENV });
export const VISUAL_QA = claude("claude-sonnet-4-6", { env: CACHE_ENV });
export const VISUAL_FIXER = claude("claude-opus-4-8", { env: CACHE_ENV });
export const REVIEWER = claude("claude-sonnet-4-6", { env: CACHE_ENV });
export const CODE_FIXER = claude("claude-opus-4-8", { env: CACHE_ENV });
export const MERGER = claude("claude-opus-4-8", { env: CACHE_ENV });

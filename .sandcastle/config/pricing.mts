// Model pricing per million tokens ($/M).
// Keyed by model-name substring; first match wins — order specific → general.

export const MODEL_PRICING: {
  pattern: string;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}[] = [
  // Anthropic
  { pattern: "opus", input: 15, cacheRead: 1.5, cacheWrite: 18.75, output: 75 },
  { pattern: "sonnet", input: 3, cacheRead: 0.3, cacheWrite: 3.75, output: 15 },
  { pattern: "haiku", input: 0.8, cacheRead: 0.08, cacheWrite: 1, output: 4 },
  // OpenAI
  { pattern: "o3", input: 10, cacheRead: 2.5, cacheWrite: 10, output: 40 },
  { pattern: "o4-mini", input: 1.1, cacheRead: 0.275, cacheWrite: 1.1, output: 4.4 },
  { pattern: "gpt-4.1", input: 2, cacheRead: 0.5, cacheWrite: 2, output: 8 },
  { pattern: "gpt-4o", input: 2.5, cacheRead: 1.25, cacheWrite: 2.5, output: 10 },
];

export const FALLBACK_PRICING = {
  input: 0,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
};

/** Tokens above this threshold trigger a context-size warning. */
export const SMART_ZONE_LIMIT = 100_000;

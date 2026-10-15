// Tagged agents — wraps sandcastle providers with model metadata
// so logging and pricing derive automatically from the agent.

import * as sandcastle from "@ai-hero/sandcastle";
import { log, fmt } from "./logging.mjs";
import { MODEL_PRICING, FALLBACK_PRICING, SMART_ZONE_LIMIT } from "../config/pricing.mjs";

// Gap 12: Cost ceiling enforcement.
let cumulativeCostUsd = 0;
let costCeilingUsd = 50; // default, overridable via setCostCeiling()

export function setCostCeiling(ceiling: number): void {
  costCeilingUsd = ceiling;
}

export function getCumulativeCost(): number {
  return cumulativeCostUsd;
}

export class CostCeilingExceededError extends Error {
  constructor(cost: number, ceiling: number) {
    super(`Pipeline cost ceiling exceeded: $${cost.toFixed(2)} >= $${ceiling}`);
    this.name = "CostCeilingExceededError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaggedAgent {
  provider: sandcastle.AgentProvider;
  model: string;
}

interface HasIterations {
  iterations: ReadonlyArray<{
    usage?: {
      inputTokens: number;
      cacheCreationInputTokens: number;
      cacheReadInputTokens: number;
      outputTokens: number;
    };
  }>;
}

// ---------------------------------------------------------------------------
// Provider factories
// ---------------------------------------------------------------------------

export function claude(
  model: string,
  options?: Parameters<typeof sandcastle.claudeCode>[1],
): TaggedAgent {
  return { provider: sandcastle.claudeCode(model, options), model };
}

export function codex(
  model: string,
  options?: Parameters<typeof sandcastle.codex>[1],
): TaggedAgent {
  return { provider: sandcastle.codex(model, options), model };
}

// ---------------------------------------------------------------------------
// Timed run wrappers
// ---------------------------------------------------------------------------

export async function timedRun<
  T extends Awaited<ReturnType<typeof sandcastle.run>>,
>(
  label: string,
  ta: TaggedAgent,
  opts: Omit<Parameters<typeof sandcastle.run>[0], "agent"> & { output?: any },
): Promise<T> {
  const start = Date.now();
  const result = (await sandcastle.run({
    ...opts,
    agent: ta.provider,
  } as any)) as unknown as T;
  logRunStats(label, ta.model, start, result);
  return result;
}

export async function timedSandboxRun(
  label: string,
  ta: TaggedAgent,
  sandbox: sandcastle.Sandbox,
  opts: Omit<Parameters<sandcastle.Sandbox["run"]>[0], "agent">,
) {
  const start = Date.now();
  const result = await sandbox.run({ ...opts, agent: ta.provider });
  logRunStats(label, ta.model, start, result);
  return result;
}

// ---------------------------------------------------------------------------
// Stats logging
// ---------------------------------------------------------------------------

function logRunStats(
  label: string,
  model: string,
  startMs: number,
  result: HasIterations,
): void {
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  let totalInput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalOutput = 0;
  let hasUsage = false;

  for (const iter of result.iterations) {
    if (iter.usage) {
      hasUsage = true;
      totalInput += iter.usage.inputTokens;
      totalCacheRead += iter.usage.cacheReadInputTokens;
      totalCacheWrite += iter.usage.cacheCreationInputTokens;
      totalOutput += iter.usage.outputTokens;
    }
  }

  if (!hasUsage) {
    log(`  📊 ${label}: ${elapsed}s | no usage data`);
    return;
  }

  const totalContextTokens = totalInput + totalCacheRead + totalCacheWrite;
  const inSmartZone = totalContextTokens <= SMART_ZONE_LIMIT;
  const zoneTag = inSmartZone
    ? "✅ ≤100K"
    : `⚠️  ${Math.round(totalContextTokens / 1000)}K`;

  const lower = model.toLowerCase();
  const pricing =
    MODEL_PRICING.find((p) => lower.includes(p.pattern)) ?? FALLBACK_PRICING;
  const cost =
    (totalInput / 1_000_000) * pricing.input +
    (totalCacheRead / 1_000_000) * pricing.cacheRead +
    (totalCacheWrite / 1_000_000) * pricing.cacheWrite +
    (totalOutput / 1_000_000) * pricing.output;
  const costPart = cost > 0 ? ` | ~$${cost.toFixed(2)}` : "";

  // Gap 12: Accumulate cost and check ceiling.
  if (cost > 0) {
    cumulativeCostUsd += cost;
    if (cumulativeCostUsd >= costCeilingUsd) {
      log(`  ⛔ Cost ceiling reached: $${cumulativeCostUsd.toFixed(2)} >= $${costCeilingUsd}`);
      throw new CostCeilingExceededError(cumulativeCostUsd, costCeilingUsd);
    }
  }

  const cacheParts =
    totalCacheRead || totalCacheWrite
      ? ` cache-r:${fmt(totalCacheRead)} cache-w:${fmt(totalCacheWrite)}`
      : "";

  log(
    `  📊 ${label}: ${elapsed}s | in:${fmt(totalInput)}${cacheParts} out:${fmt(totalOutput)} | ctx:${fmt(totalContextTokens)} [${zoneTag}]${costPart}`,
  );
}

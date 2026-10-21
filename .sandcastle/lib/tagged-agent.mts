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

// ---------------------------------------------------------------------------
// Cost ledger — records every phase cost for per-ticket summaries
// ---------------------------------------------------------------------------

export interface CostEntry {
  label: string;
  model: string;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  cost: number;
}

const costLedger: CostEntry[] = [];

export function getCostLedger(): readonly CostEntry[] {
  return costLedger;
}

function resolvePricing(model: string) {
  return MODEL_PRICING.find((p) => model.toLowerCase().includes(p.pattern)) ?? FALLBACK_PRICING;
}

function costBreakdown(entry: CostEntry): string {
  const p = resolvePricing(entry.model);
  const cw = (entry.cacheWrite / 1_000_000) * p.cacheWrite;
  const cr = (entry.cacheRead / 1_000_000) * p.cacheRead;
  const out = (entry.output / 1_000_000) * p.output;
  const inp = (entry.input / 1_000_000) * p.input;
  const parts: string[] = [];
  if (cw >= 0.001) parts.push(`cw:$${cw.toFixed(3)}`);
  if (cr >= 0.001) parts.push(`cr:$${cr.toFixed(3)}`);
  if (inp >= 0.001) parts.push(`in:$${inp.toFixed(3)}`);
  if (out >= 0.001) parts.push(`out:$${out.toFixed(3)}`);
  return parts.join(" ");
}

/**
 * Print a cost summary grouped by ticket, with per-phase breakdown.
 * Safe to call at any point (SIGINT, end-of-flow) — shows whatever was recorded.
 */
export function printCostSummary(): void {
  if (costLedger.length === 0) return;

  log("");
  log("💰 Cost summary");
  log("─".repeat(72));

  // Group by ticket — extract ticket ID from labels like "Implementer [foo-123]"
  const byTicket = new Map<string, CostEntry[]>();
  for (const entry of costLedger) {
    const match = entry.label.match(/\[([^\]]+)\]/);
    const ticket = match ? match[1] : "_pipeline";
    if (!byTicket.has(ticket)) byTicket.set(ticket, []);
    byTicket.get(ticket)!.push(entry);
  }

  for (const [ticket, entries] of byTicket) {
    const ticketTotal = entries.reduce((s, e) => s + e.cost, 0);
    log(`  ${ticket}: $${ticketTotal.toFixed(2)}`);
    for (const e of entries) {
      const phase = e.label.replace(/\s*\[[^\]]+\]\s*/, "");
      log(`    ${phase.padEnd(24)} $${e.cost.toFixed(3)}  (${costBreakdown(e)})`);
    }
  }

  log("─".repeat(72));
  log(`  Total: $${cumulativeCostUsd.toFixed(2)}`);
  log("");
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

  const pricing = resolvePricing(model);
  const cost =
    (totalInput / 1_000_000) * pricing.input +
    (totalCacheRead / 1_000_000) * pricing.cacheRead +
    (totalCacheWrite / 1_000_000) * pricing.cacheWrite +
    (totalOutput / 1_000_000) * pricing.output;

  // Record to the ledger for the end-of-flow summary.
  const entry: CostEntry = {
    label, model,
    input: totalInput, cacheRead: totalCacheRead,
    cacheWrite: totalCacheWrite, output: totalOutput,
    cost,
  };
  costLedger.push(entry);

  // Gap 12: Accumulate cost and check ceiling.
  if (cost > 0) {
    cumulativeCostUsd += cost;
    if (cumulativeCostUsd >= costCeilingUsd) {
      log(`  ⛔ Cost ceiling reached: $${cumulativeCostUsd.toFixed(2)} >= $${costCeilingUsd}`);
      throw new CostCeilingExceededError(cumulativeCostUsd, costCeilingUsd);
    }
  }

  const costPart = cost > 0 ? ` | ~$${cost.toFixed(2)} (${costBreakdown(entry)})` : "";

  const cacheParts =
    totalCacheRead || totalCacheWrite
      ? ` cache-r:${fmt(totalCacheRead)} cache-w:${fmt(totalCacheWrite)}`
      : "";

  log(
    `  📊 ${label}: ${elapsed}s | ${model} | in:${fmt(totalInput)}${cacheParts} out:${fmt(totalOutput)} | ctx:${fmt(totalContextTokens)} [${zoneTag}]${costPart}`,
  );
}

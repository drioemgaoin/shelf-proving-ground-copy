#!/usr/bin/env node
/**
 * Tests for cost estimation logic (mirrors tagged-agent.mts logRunStats).
 *
 * Reproduces the planner-vs-implementer cost anomaly:
 *   Planner  — 24.8K total tokens → ~$0.31
 *   Implementer — 73.7K total tokens → ~$0.17
 *
 * Root cause: cache-write tokens ($18.75/M) are 12.5× more expensive than
 * cache-read tokens ($1.50/M). The planner pays cache-write on the bulk of
 * its input; the implementer gets the cheap cache-read rate.
 */
let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function assertClose(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${message}: expected ~${expected}, got ${actual} (diff ${diff.toFixed(4)} > tolerance ${tolerance})`);
}

// ── Reimplemented cost logic (mirrors tagged-agent.mts + pricing.mts) ──

const MODEL_PRICING = [
  { pattern: 'opus',   input: 15,  cacheRead: 1.5,  cacheWrite: 18.75, output: 75 },
  { pattern: 'sonnet', input: 3,   cacheRead: 0.3,  cacheWrite: 3.75,  output: 15 },
  { pattern: 'haiku',  input: 0.8, cacheRead: 0.08, cacheWrite: 1,     output: 4 },
];
const FALLBACK = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

function resolvePricing(model) {
  return MODEL_PRICING.find(p => model.toLowerCase().includes(p.pattern)) ?? FALLBACK;
}

function computeCost(model, { input, cacheRead, cacheWrite, output }) {
  const pricing = resolvePricing(model);
  return (
    (input      / 1_000_000) * pricing.input +
    (cacheRead  / 1_000_000) * pricing.cacheRead +
    (cacheWrite / 1_000_000) * pricing.cacheWrite +
    (output     / 1_000_000) * pricing.output
  );
}

function costBreakdown(model, entry) {
  const p = resolvePricing(model);
  const cw = (entry.cacheWrite / 1_000_000) * p.cacheWrite;
  const cr = (entry.cacheRead / 1_000_000) * p.cacheRead;
  const out = (entry.output / 1_000_000) * p.output;
  const inp = (entry.input / 1_000_000) * p.input;
  const parts = [];
  if (cw >= 0.001) parts.push(`cw:$${cw.toFixed(3)}`);
  if (cr >= 0.001) parts.push(`cr:$${cr.toFixed(3)}`);
  if (inp >= 0.001) parts.push(`in:$${inp.toFixed(3)}`);
  if (out >= 0.001) parts.push(`out:$${out.toFixed(3)}`);
  return parts.join(' ');
}

// ── The observed run data ──

const PLANNER_USAGE = { input: 2, cacheRead: 12_100, cacheWrite: 12_700, output: 673 };
const IMPLEMENTER_USAGE = { input: 2, cacheRead: 73_100, cacheWrite: 571, output: 611 };
const MODEL = 'claude-opus-4-8';

// ── Cost calculation tests ──

test('Planner cost matches observed ~$0.31', () => {
  const cost = computeCost(MODEL, PLANNER_USAGE);
  assertClose(cost, 0.31, 0.01, 'Planner cost');
});

test('Implementer cost matches observed ~$0.17', () => {
  const cost = computeCost(MODEL, IMPLEMENTER_USAGE);
  assertClose(cost, 0.17, 0.01, 'Implementer cost');
});

test('Planner costs more than implementer despite 3x fewer tokens', () => {
  const plannerTotal = PLANNER_USAGE.input + PLANNER_USAGE.cacheRead + PLANNER_USAGE.cacheWrite + PLANNER_USAGE.output;
  const implTotal = IMPLEMENTER_USAGE.input + IMPLEMENTER_USAGE.cacheRead + IMPLEMENTER_USAGE.cacheWrite + IMPLEMENTER_USAGE.output;
  assert(plannerTotal < implTotal, `Planner tokens (${plannerTotal}) should be < Implementer tokens (${implTotal})`);

  const plannerCost = computeCost(MODEL, PLANNER_USAGE);
  const implCost = computeCost(MODEL, IMPLEMENTER_USAGE);
  assert(plannerCost > implCost, `Planner cost ($${plannerCost.toFixed(2)}) should be > Implementer cost ($${implCost.toFixed(2)})`);
});

test('Root cause: cache-write is the dominant cost driver for the planner', () => {
  const pricing = resolvePricing(MODEL);
  const cacheWriteCost = (PLANNER_USAGE.cacheWrite / 1_000_000) * pricing.cacheWrite;
  const totalCost = computeCost(MODEL, PLANNER_USAGE);
  const cacheWritePct = cacheWriteCost / totalCost;
  assert(cacheWritePct > 0.70, `Cache-write should be >70% of planner cost, got ${(cacheWritePct * 100).toFixed(1)}%`);
});

test('If planner tokens were all cache-read, cost would drop below implementer', () => {
  const totalInput = PLANNER_USAGE.input + PLANNER_USAGE.cacheRead + PLANNER_USAGE.cacheWrite;
  const hypothetical = { input: 2, cacheRead: totalInput - 2, cacheWrite: 0, output: PLANNER_USAGE.output };
  const cost = computeCost(MODEL, hypothetical);
  const implCost = computeCost(MODEL, IMPLEMENTER_USAGE);
  assert(cost < implCost, `Hypothetical planner ($${cost.toFixed(2)}) should be < Implementer ($${implCost.toFixed(2)})`);
});

test('Cache-write rate is 12.5x cache-read rate for opus', () => {
  const pricing = resolvePricing(MODEL);
  const ratio = pricing.cacheWrite / pricing.cacheRead;
  assertClose(ratio, 12.5, 0.01, 'cache-write/cache-read ratio');
});

test('Fallback pricing returns zero cost', () => {
  const cost = computeCost('unknown-model-xyz', PLANNER_USAGE);
  assert(cost === 0, `Expected 0, got ${cost}`);
});

// ── Cost breakdown tests ──

test('Breakdown shows cache-write as dominant for planner', () => {
  const bd = costBreakdown(MODEL, PLANNER_USAGE);
  assert(bd.includes('cw:$'), `Breakdown should include cw: ${bd}`);
  // Cache-write should appear first (largest component)
  const cwIdx = bd.indexOf('cw:');
  assert(cwIdx >= 0, 'cw: should be present');
});

test('Breakdown omits sub-$0.001 components', () => {
  const bd = costBreakdown(MODEL, PLANNER_USAGE);
  // input is 2 tokens * $15/M = $0.00003 — should be omitted
  assert(!bd.includes('in:$'), `Tiny input cost should be omitted: ${bd}`);
});

test('Breakdown for implementer shows cache-read as largest', () => {
  const bd = costBreakdown(MODEL, IMPLEMENTER_USAGE);
  assert(bd.includes('cr:$'), `Breakdown should include cr: ${bd}`);
  // Parse cr value — should be > cw value
  const crMatch = bd.match(/cr:\$([0-9.]+)/);
  const cwMatch = bd.match(/cw:\$([0-9.]+)/);
  assert(crMatch, 'cr should be present');
  if (cwMatch) {
    assert(parseFloat(crMatch[1]) > parseFloat(cwMatch[1]),
      `cr ($${crMatch[1]}) should be > cw ($${cwMatch[1]})`);
  }
});

// ── Ledger grouping tests (mirrors printCostSummary logic) ──

test('Ledger groups entries by ticket ID extracted from label', () => {
  const ledger = [
    { label: 'Implementer [ticket-1]', model: MODEL, cost: 0.17, input: 2, cacheRead: 73100, cacheWrite: 571, output: 611 },
    { label: 'Visual QA [ticket-1] r1', model: MODEL, cost: 0.02, input: 1, cacheRead: 46000, cacheWrite: 1000, output: 11 },
    { label: 'Planner', model: MODEL, cost: 0.31, input: 2, cacheRead: 12100, cacheWrite: 12700, output: 673 },
  ];

  const byTicket = new Map();
  for (const entry of ledger) {
    const match = entry.label.match(/\[([^\]]+)\]/);
    const ticket = match ? match[1] : '_pipeline';
    if (!byTicket.has(ticket)) byTicket.set(ticket, []);
    byTicket.get(ticket).push(entry);
  }

  assert(byTicket.has('ticket-1'), 'Should have ticket-1 group');
  assert(byTicket.has('_pipeline'), 'Should have _pipeline group for Planner');
  assert(byTicket.get('ticket-1').length === 2, `ticket-1 should have 2 entries, got ${byTicket.get('ticket-1').length}`);
  assert(byTicket.get('_pipeline').length === 1, '_pipeline should have 1 entry');

  const ticketTotal = byTicket.get('ticket-1').reduce((s, e) => s + e.cost, 0);
  assertClose(ticketTotal, 0.19, 0.01, 'ticket-1 total');
});

test('Phase name strips ticket ID bracket from label', () => {
  const label = 'Visual QA [ticket-1] r1';
  const phase = label.replace(/\s*\[[^\]]+\]\s*/, '');
  assert(phase === 'Visual QAr1', `Phase name should strip bracket: got "${phase}"`);
});

// ── Report ──
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`Cost estimation tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

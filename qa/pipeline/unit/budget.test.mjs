#!/usr/bin/env node
/**
 * Tests for budget/cost ceiling logic.
 * Verifies the cost ceiling protocol without importing TypeScript modules.
 */
let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

// Reimplement cost ceiling logic (mirrors tagged-agent.mts)
class CostCeilingExceededError extends Error {
  constructor(cost, ceiling) {
    super(`Pipeline cost ceiling exceeded: $${cost.toFixed(2)} >= $${ceiling}`);
    this.name = 'CostCeilingExceededError';
  }
}

function createBudgetTracker(ceiling) {
  let cumulative = 0;
  return {
    add(cost) {
      cumulative += cost;
      if (cumulative >= ceiling) throw new CostCeilingExceededError(cumulative, ceiling);
    },
    get total() { return cumulative; },
  };
}

// UC-57a: Cost below ceiling → proceeds
test('UC-57a: cost below ceiling → proceeds', () => {
  const tracker = createBudgetTracker(50);
  tracker.add(10);
  tracker.add(20);
  assert(tracker.total === 30, `Expected 30, got ${tracker.total}`);
});

// UC-57b: Cost at/above ceiling → CostCeilingExceededError
test('UC-57b: cost at ceiling → CostCeilingExceededError', () => {
  const tracker = createBudgetTracker(50);
  tracker.add(30);
  let threw = false;
  try {
    tracker.add(20); // 50 >= 50 → throw
  } catch (e) {
    threw = true;
    assert(e instanceof CostCeilingExceededError, `Expected CostCeilingExceededError, got ${e.constructor.name}`);
    assert(e.message.includes('50'), 'Expected ceiling amount in message');
  }
  assert(threw, 'Expected CostCeilingExceededError to be thrown');
});

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`Budget tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

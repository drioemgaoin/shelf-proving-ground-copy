#!/usr/bin/env node
/**
 * Unit tests for scripts/monitor/query.mjs
 */
import { createQueryApi } from '../../../scripts/monitor/query.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`FAIL: ${label} — ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** In-memory mock sink for testing query logic */
function mockSink(events) {
  return {
    write() {},
    query(filter) {
      return events.filter(e => {
        if (filter.tier && e.tier !== filter.tier) return false;
        if (filter.ruleId && e.ruleId !== filter.ruleId) return false;
        if (filter.sessionId && e.sessionId !== filter.sessionId) return false;
        return true;
      });
    },
    close() {},
  };
}

function ev(overrides) {
  return {
    id: `id-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: '2026-10-17T10:00:00.000Z',
    tier: 'T1',
    ruleId: 'test-rule',
    sessionId: 'sess-1',
    runId: null,
    turnIndex: 0,
    file: null,
    outcome: 'blocked',
    agent: null,
    details: {},
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════

test('getEvents returns filtered events', () => {
  const api = createQueryApi(mockSink([ev({ tier: 'T1' }), ev({ tier: 'T2' })]));
  const results = api.getEvents({ tier: 'T1' });
  assert(results.length === 1, `Expected 1, got ${results.length}`);
});

test('getMetrics computes trigger count per rule', () => {
  const events = [
    ev({ ruleId: 'a', outcome: 'blocked' }),
    ev({ ruleId: 'a', outcome: 'passed' }),
    ev({ ruleId: 'b', outcome: 'blocked' }),
  ];
  const api = createQueryApi(mockSink(events));
  const metrics = api.getMetrics();
  const ruleA = metrics.find(m => m.ruleId === 'a');
  assert(ruleA.triggerCount === 2, `Expected triggerCount=2 for a, got ${ruleA.triggerCount}`);
  const ruleB = metrics.find(m => m.ruleId === 'b');
  assert(ruleB.triggerCount === 1, `Expected triggerCount=1 for b, got ${ruleB.triggerCount}`);
});

test('getMetrics computes block rate', () => {
  const events = [
    ev({ ruleId: 'a', outcome: 'blocked' }),
    ev({ ruleId: 'a', outcome: 'passed' }),
    ev({ ruleId: 'a', outcome: 'blocked' }),
    ev({ ruleId: 'a', outcome: 'passed' }),
  ];
  const api = createQueryApi(mockSink(events));
  const metrics = api.getMetrics();
  const ruleA = metrics.find(m => m.ruleId === 'a');
  assert(ruleA.blockCount === 2, `Expected blockCount=2, got ${ruleA.blockCount}`);
  assert(ruleA.blockRate === 0.5, `Expected blockRate=0.5, got ${ruleA.blockRate}`);
});

test('getMetrics computes fix rate', () => {
  const events = [
    ev({ ruleId: 'a', outcome: 'blocked' }),
    ev({ ruleId: 'a', outcome: 'fixed' }),
    ev({ ruleId: 'a', outcome: 'blocked' }),
  ];
  const api = createQueryApi(mockSink(events));
  const metrics = api.getMetrics();
  const ruleA = metrics.find(m => m.ruleId === 'a');
  assert(ruleA.fixCount === 1, `Expected fixCount=1, got ${ruleA.fixCount}`);
  assert(ruleA.fixRate === 0.5, `Expected fixRate=0.5 (1 fix / 2 blocks), got ${ruleA.fixRate}`);
});

test('getUnusedRules identifies rules with zero events', () => {
  const events = [ev({ ruleId: 'a' })];
  const api = createQueryApi(mockSink(events));
  const unused = api.getUnusedRules(['a', 'b', 'c']);
  assert(unused.length === 2, `Expected 2 unused, got ${unused.length}`);
  assert(unused.includes('b') && unused.includes('c'), `Expected b and c, got ${unused}`);
});

test('getFixCorrelation finds blocked-then-fixed pairs', () => {
  const events = [
    ev({ ruleId: 'a', sessionId: 's1', file: 'f.css', turnIndex: 0, outcome: 'blocked' }),
    ev({ ruleId: 'a', sessionId: 's1', file: 'f.css', turnIndex: 1, outcome: 'fixed' }),
    ev({ ruleId: 'a', sessionId: 's1', file: 'f.css', turnIndex: 5, outcome: 'blocked' }),
    // no fix follows turn 5
  ];
  const api = createQueryApi(mockSink(events));
  const corr = api.getFixCorrelation('a');
  assert(corr.blocked === 2, `Expected blocked=2, got ${corr.blocked}`);
  assert(corr.fixedNextTurn === 1, `Expected fixedNextTurn=1, got ${corr.fixedNextTurn}`);
  assert(corr.fixRate === 0.5, `Expected fixRate=0.5, got ${corr.fixRate}`);
});

test('getFixCorrelation returns 0 when no fixes follow blocks', () => {
  const events = [
    ev({ ruleId: 'a', sessionId: 's1', turnIndex: 0, outcome: 'blocked' }),
    ev({ ruleId: 'a', sessionId: 's1', turnIndex: 1, outcome: 'blocked' }),
  ];
  const api = createQueryApi(mockSink(events));
  const corr = api.getFixCorrelation('a');
  assert(corr.fixedNextTurn === 0, `Expected 0, got ${corr.fixedNextTurn}`);
  assert(corr.fixRate === 0, `Expected 0, got ${corr.fixRate}`);
});

test('empty dataset returns empty metrics', () => {
  const api = createQueryApi(mockSink([]));
  const metrics = api.getMetrics();
  assert(metrics.length === 0, `Expected 0, got ${metrics.length}`);
});

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`Query API tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

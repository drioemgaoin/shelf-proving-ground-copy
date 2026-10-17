#!/usr/bin/env node
/**
 * Unit tests for scripts/monitor/schema.mjs
 */
import { createEvent, validateEvent, TIERS, OUTCOMES, AGENTS } from '../../../scripts/monitor/schema.mjs';

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

// ═══════════════════════════════════════════════════════════════════
// createEvent tests
// ═══════════════════════════════════════════════════════════════════

test('createEvent fills id and timestamp when omitted', () => {
  const e = createEvent({ tier: 'T1', ruleId: 'test-rule', sessionId: 's1', turnIndex: 0, outcome: 'blocked', details: {} });
  assert(typeof e.id === 'string' && e.id.length > 0, `Expected non-empty id, got "${e.id}"`);
  assert(typeof e.timestamp === 'string' && e.timestamp.includes('T'), `Expected ISO timestamp, got "${e.timestamp}"`);
});

test('createEvent preserves caller-supplied id and timestamp', () => {
  const e = createEvent({ id: 'my-id', timestamp: '2026-01-01T00:00:00.000Z', tier: 'T1', ruleId: 'r', sessionId: 's', turnIndex: 0, outcome: 'passed', details: {} });
  assert(e.id === 'my-id', `Expected "my-id", got "${e.id}"`);
  assert(e.timestamp === '2026-01-01T00:00:00.000Z', `Expected preserved timestamp, got "${e.timestamp}"`);
});

// ═══════════════════════════════════════════════════════════════════
// validateEvent tests
// ═══════════════════════════════════════════════════════════════════

test('validateEvent accepts a complete valid event', () => {
  const e = createEvent({ tier: 'T1', ruleId: 'values-from-tokens', sessionId: 's1', turnIndex: 0, outcome: 'blocked', file: 'src/App.css', agent: null, runId: null, details: { match: '#fff' } });
  const result = validateEvent(e);
  assert(result.valid === true, `Expected valid, got errors: ${result.errors.join(', ')}`);
});

test('validateEvent rejects missing tier', () => {
  const e = { id: 'x', timestamp: '2026-01-01T00:00:00.000Z', ruleId: 'r', sessionId: 's', turnIndex: 0, outcome: 'blocked', details: {} };
  const result = validateEvent(e);
  assert(result.valid === false, 'Expected invalid');
  assert(result.errors.some(err => err.includes('tier')), `Expected tier error, got: ${result.errors}`);
});

test('validateEvent rejects invalid tier value', () => {
  const e = createEvent({ tier: 'T4', ruleId: 'r', sessionId: 's', turnIndex: 0, outcome: 'blocked', details: {} });
  const result = validateEvent(e);
  assert(result.valid === false, 'Expected invalid');
  assert(result.errors.some(err => err.includes('tier')), `Expected tier error, got: ${result.errors}`);
});

test('validateEvent rejects missing ruleId', () => {
  const e = { id: 'x', timestamp: '2026-01-01T00:00:00.000Z', tier: 'T1', sessionId: 's', turnIndex: 0, outcome: 'blocked', details: {} };
  const result = validateEvent(e);
  assert(result.valid === false, 'Expected invalid');
  assert(result.errors.some(err => err.includes('ruleId')), `Expected ruleId error, got: ${result.errors}`);
});

test('validateEvent rejects invalid outcome', () => {
  const e = createEvent({ tier: 'T1', ruleId: 'r', sessionId: 's', turnIndex: 0, outcome: 'unknown', details: {} });
  const result = validateEvent(e);
  assert(result.valid === false, 'Expected invalid');
  assert(result.errors.some(err => err.includes('outcome')), `Expected outcome error, got: ${result.errors}`);
});

test('validateEvent accepts null runId, file, agent', () => {
  const e = createEvent({ tier: 'T1', ruleId: 'r', sessionId: 's', turnIndex: 0, outcome: 'passed', runId: null, file: null, agent: null, details: {} });
  const result = validateEvent(e);
  assert(result.valid === true, `Expected valid, got errors: ${result.errors.join(', ')}`);
});

test('validateEvent rejects negative turnIndex', () => {
  const e = createEvent({ tier: 'T1', ruleId: 'r', sessionId: 's', turnIndex: -1, outcome: 'passed', details: {} });
  const result = validateEvent(e);
  assert(result.valid === false, 'Expected invalid');
  assert(result.errors.some(err => err.includes('turnIndex')), `Expected turnIndex error, got: ${result.errors}`);
});

// ═══════════════════════════════════════════════════════════════════
// Enum exports
// ═══════════════════════════════════════════════════════════════════

test('TIERS contains T1, T2, T3', () => {
  assert(TIERS.includes('T1') && TIERS.includes('T2') && TIERS.includes('T3'), `Unexpected TIERS: ${TIERS}`);
  assert(TIERS.length === 3, `Expected 3 tiers, got ${TIERS.length}`);
});

test('OUTCOMES contains expected values', () => {
  for (const v of ['blocked', 'passed', 'violation_found', 'fixed']) {
    assert(OUTCOMES.includes(v), `Missing outcome: ${v}`);
  }
});

test('AGENTS contains expected values', () => {
  for (const v of ['visual-qa', 'reviewer']) {
    assert(AGENTS.includes(v), `Missing agent: ${v}`);
  }
});

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`Schema tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

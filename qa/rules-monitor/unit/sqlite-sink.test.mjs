#!/usr/bin/env node
/**
 * Unit tests for scripts/monitor/sinks/sqlite.mjs
 * All tests skip if node:sqlite is unavailable.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let passed = 0;
let failed = 0;
let skipped = 0;
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

// Check if node:sqlite is available
let sqliteAvailable = false;
try {
  await import('node:sqlite');
  sqliteAvailable = true;
} catch {
  // not available
}

if (!sqliteAvailable) {
  console.log('\nSQLite sink tests: SKIPPED (node:sqlite not available)');
  console.log('Run with --experimental-sqlite to enable');
  process.exit(0);
}

const { createSqliteSink } = await import('../../../scripts/monitor/sinks/sqlite.mjs');
const { createEvent } = await import('../../../scripts/monitor/schema.mjs');

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'sqlite-sink-test-'));
}

function makeEvent(overrides = {}) {
  return createEvent({
    tier: 'T1',
    ruleId: 'test-rule',
    sessionId: 'sess-1',
    turnIndex: 0,
    outcome: 'blocked',
    details: { match: '#fff' },
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════════

test('creates DB and table on first write', () => {
  const tmp = tmpDir();
  const sink = createSqliteSink({ sqlite: { path: join(tmp, 'test.db') } });
  sink.write(makeEvent());
  const results = sink.query({});
  assert(results.length === 1, `Expected 1 event, got ${results.length}`);
  sink.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('write and query round-trip preserves fields', () => {
  const tmp = tmpDir();
  const sink = createSqliteSink({ sqlite: { path: join(tmp, 'test.db') } });
  const event = makeEvent({ ruleId: 'my-rule', file: 'src/App.css', agent: 'reviewer' });
  sink.write(event);
  const results = sink.query({});
  assert(results[0].ruleId === 'my-rule', `Expected ruleId=my-rule, got ${results[0].ruleId}`);
  assert(results[0].file === 'src/App.css', `Expected file=src/App.css`);
  assert(results[0].agent === 'reviewer', `Expected agent=reviewer`);
  assert(typeof results[0].details === 'object', 'details should be parsed object');
  sink.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('query filters by tier, ruleId, sessionId', () => {
  const tmp = tmpDir();
  const sink = createSqliteSink({ sqlite: { path: join(tmp, 'test.db') } });
  sink.write(makeEvent({ tier: 'T1', ruleId: 'a', sessionId: 's1' }));
  sink.write(makeEvent({ tier: 'T2', ruleId: 'b', sessionId: 's2' }));
  sink.write(makeEvent({ tier: 'T1', ruleId: 'a', sessionId: 's2' }));

  assert(sink.query({ tier: 'T1' }).length === 2, 'tier filter');
  assert(sink.query({ ruleId: 'b' }).length === 1, 'ruleId filter');
  assert(sink.query({ sessionId: 's1' }).length === 1, 'sessionId filter');
  sink.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('close releases the DB handle', () => {
  const tmp = tmpDir();
  const sink = createSqliteSink({ sqlite: { path: join(tmp, 'test.db') } });
  sink.write(makeEvent());
  sink.close();
  // Should not throw on double close
  sink.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('duplicate id does not throw', () => {
  const tmp = tmpDir();
  const sink = createSqliteSink({ sqlite: { path: join(tmp, 'test.db') } });
  const event = makeEvent({ id: 'dup-id' });
  sink.write(event);
  sink.write(event); // same id
  const results = sink.query({});
  assert(results.length === 1, `Expected 1 (deduplicated), got ${results.length}`);
  sink.close();
  rmSync(tmp, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`SQLite sink tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

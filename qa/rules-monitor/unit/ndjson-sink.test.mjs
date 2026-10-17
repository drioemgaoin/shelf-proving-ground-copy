#!/usr/bin/env node
/**
 * Unit tests for scripts/monitor/sinks/ndjson.mjs
 */
import { createNdjsonSink } from '../../../scripts/monitor/sinks/ndjson.mjs';
import { createEvent } from '../../../scripts/monitor/schema.mjs';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'ndjson-sink-test-'));
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

test('write creates directory if missing', () => {
  const tmp = tmpDir();
  const dir = join(tmp, 'nested', 'dir');
  const sink = createNdjsonSink({ ndjson: { dir } });
  sink.write(makeEvent());
  // If we got here without error, directory was created
  const files = readFileSync(join(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`), 'utf-8');
  assert(files.length > 0, 'Expected non-empty file');
  rmSync(tmp, { recursive: true, force: true });
});

test('write appends a parseable JSON line', () => {
  const tmp = tmpDir();
  const sink = createNdjsonSink({ ndjson: { dir: tmp } });
  const event = makeEvent();
  sink.write(event);
  const content = readFileSync(join(tmp, `${new Date().toISOString().slice(0, 10)}.jsonl`), 'utf-8');
  const parsed = JSON.parse(content.trim());
  assert(parsed.ruleId === 'test-rule', `Expected ruleId=test-rule, got ${parsed.ruleId}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('multiple writes produce multiple lines', () => {
  const tmp = tmpDir();
  const sink = createNdjsonSink({ ndjson: { dir: tmp } });
  sink.write(makeEvent({ ruleId: 'r1' }));
  sink.write(makeEvent({ ruleId: 'r2' }));
  sink.write(makeEvent({ ruleId: 'r3' }));
  const content = readFileSync(join(tmp, `${new Date().toISOString().slice(0, 10)}.jsonl`), 'utf-8');
  const lines = content.trim().split('\n');
  assert(lines.length === 3, `Expected 3 lines, got ${lines.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('query with empty filter returns all events', () => {
  const tmp = tmpDir();
  const sink = createNdjsonSink({ ndjson: { dir: tmp } });
  sink.write(makeEvent({ ruleId: 'r1' }));
  sink.write(makeEvent({ ruleId: 'r2' }));
  const results = sink.query({});
  assert(results.length === 2, `Expected 2 events, got ${results.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('query filters by tier', () => {
  const tmp = tmpDir();
  const sink = createNdjsonSink({ ndjson: { dir: tmp } });
  sink.write(makeEvent({ tier: 'T1' }));
  sink.write(makeEvent({ tier: 'T2' }));
  sink.write(makeEvent({ tier: 'T1' }));
  const results = sink.query({ tier: 'T1' });
  assert(results.length === 2, `Expected 2 T1 events, got ${results.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('query filters by ruleId', () => {
  const tmp = tmpDir();
  const sink = createNdjsonSink({ ndjson: { dir: tmp } });
  sink.write(makeEvent({ ruleId: 'a' }));
  sink.write(makeEvent({ ruleId: 'b' }));
  const results = sink.query({ ruleId: 'a' });
  assert(results.length === 1, `Expected 1 event, got ${results.length}`);
  assert(results[0].ruleId === 'a', `Expected ruleId=a, got ${results[0].ruleId}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('query filters by date range', () => {
  const tmp = tmpDir();
  const sink = createNdjsonSink({ ndjson: { dir: tmp } });
  // Write events with explicit timestamps to different daily files
  const e1 = makeEvent({ timestamp: '2026-10-15T10:00:00.000Z' });
  const e2 = makeEvent({ timestamp: '2026-10-16T10:00:00.000Z' });
  const e3 = makeEvent({ timestamp: '2026-10-17T10:00:00.000Z' });
  // Write directly to dated files to simulate multi-day data
  writeFileSync(join(tmp, '2026-10-15.jsonl'), JSON.stringify(e1) + '\n');
  writeFileSync(join(tmp, '2026-10-16.jsonl'), JSON.stringify(e2) + '\n');
  writeFileSync(join(tmp, '2026-10-17.jsonl'), JSON.stringify(e3) + '\n');
  const results = sink.query({ from: '2026-10-16', to: '2026-10-16' });
  assert(results.length === 1, `Expected 1 event in range, got ${results.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('corrupted line skipped, others still returned', () => {
  const tmp = tmpDir();
  const today = new Date().toISOString().slice(0, 10);
  const good = makeEvent({ ruleId: 'good' });
  writeFileSync(join(tmp, `${today}.jsonl`), JSON.stringify(good) + '\n{broken json\n');
  const sink = createNdjsonSink({ ndjson: { dir: tmp } });
  const results = sink.query({});
  assert(results.length === 1, `Expected 1 good event, got ${results.length}`);
  assert(results[0].ruleId === 'good', `Expected ruleId=good, got ${results[0].ruleId}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('empty directory returns empty array', () => {
  const tmp = tmpDir();
  const sink = createNdjsonSink({ ndjson: { dir: tmp } });
  const results = sink.query({});
  assert(results.length === 0, `Expected 0 events, got ${results.length}`);
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
console.log(`NDJSON sink tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

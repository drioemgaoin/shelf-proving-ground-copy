#!/usr/bin/env node
/**
 * Unit tests for scripts/monitor/recorder.mjs
 */
import { createRecorder } from '../../../scripts/monitor/recorder.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
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

function makeTempProject(monitorConfig = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'recorder-test-'));
  mkdirSync(join(tmp, '.sandcastle'), { recursive: true });
  writeFileSync(join(tmp, '.sandcastle', 'config.json'), JSON.stringify({ monitor: { sink: 'ndjson', ndjson: { dir: join(tmp, 'logs') }, ...monitorConfig } }));
  return tmp;
}

function readEvents(tmp) {
  const dir = join(tmp, 'logs');
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    const events = [];
    for (const file of files) {
      for (const line of readFileSync(join(dir, file), 'utf-8').split('\n')) {
        if (line.trim()) events.push(JSON.parse(line));
      }
    }
    return events;
  } catch {
    return [];
  }
}

// Save and restore env vars
const origSession = process.env.CLAUDE_SESSION_ID;
const origRun = process.env.SANDCASTLE_RUN_ID;

function cleanEnv() {
  delete process.env.CLAUDE_SESSION_ID;
  delete process.env.SANDCASTLE_RUN_ID;
}

function restoreEnv() {
  if (origSession !== undefined) process.env.CLAUDE_SESSION_ID = origSession;
  else delete process.env.CLAUDE_SESSION_ID;
  if (origRun !== undefined) process.env.SANDCASTLE_RUN_ID = origRun;
  else delete process.env.SANDCASTLE_RUN_ID;
}

// ═══════════════════════════════════════════════════════════════════

test('creates recorder with default NDJSON sink', () => {
  const tmp = makeTempProject();
  cleanEnv();
  const recorder = createRecorder(tmp);
  assert(recorder && typeof recorder.record === 'function', 'Expected record function');
  assert(typeof recorder.close === 'function', 'Expected close function');
  recorder.close();
  restoreEnv();
  rmSync(tmp, { recursive: true, force: true });
});

test('record writes event to sink', () => {
  const tmp = makeTempProject();
  cleanEnv();
  const recorder = createRecorder(tmp);
  recorder.record({ tier: 'T1', ruleId: 'test-rule', outcome: 'blocked', turnIndex: 0, details: {} });
  const events = readEvents(tmp);
  assert(events.length === 1, `Expected 1 event, got ${events.length}`);
  assert(events[0].ruleId === 'test-rule', 'Expected ruleId=test-rule');
  recorder.close();
  restoreEnv();
  rmSync(tmp, { recursive: true, force: true });
});

test('record rejects invalid event and does not write', () => {
  const tmp = makeTempProject();
  cleanEnv();
  const recorder = createRecorder(tmp);
  const result = recorder.record({ tier: 'INVALID' }); // missing required fields
  assert(result.ok === false, 'Expected rejection');
  const events = readEvents(tmp);
  assert(events.length === 0, `Expected 0 events, got ${events.length}`);
  recorder.close();
  restoreEnv();
  rmSync(tmp, { recursive: true, force: true });
});

test('disabled config makes record a no-op', () => {
  const tmp = makeTempProject({ enabled: false });
  cleanEnv();
  const recorder = createRecorder(tmp);
  recorder.record({ tier: 'T1', ruleId: 'r', outcome: 'blocked', turnIndex: 0, details: {} });
  const events = readEvents(tmp);
  assert(events.length === 0, `Expected 0 events (disabled), got ${events.length}`);
  recorder.close();
  restoreEnv();
  rmSync(tmp, { recursive: true, force: true });
});

test('sessionId from CLAUDE_SESSION_ID env', () => {
  const tmp = makeTempProject();
  process.env.CLAUDE_SESSION_ID = 'env-session-123';
  delete process.env.SANDCASTLE_RUN_ID;
  const recorder = createRecorder(tmp);
  recorder.record({ tier: 'T1', ruleId: 'r', outcome: 'passed', turnIndex: 0, details: {} });
  const events = readEvents(tmp);
  assert(events[0].sessionId === 'env-session-123', `Expected env-session-123, got ${events[0].sessionId}`);
  recorder.close();
  restoreEnv();
  rmSync(tmp, { recursive: true, force: true });
});

test('sessionId generated when env absent', () => {
  const tmp = makeTempProject();
  cleanEnv();
  const recorder = createRecorder(tmp);
  recorder.record({ tier: 'T1', ruleId: 'r', outcome: 'passed', turnIndex: 0, details: {} });
  const events = readEvents(tmp);
  assert(typeof events[0].sessionId === 'string' && events[0].sessionId.length > 0, 'Expected generated sessionId');
  recorder.close();
  restoreEnv();
  rmSync(tmp, { recursive: true, force: true });
});

test('runId from SANDCASTLE_RUN_ID env', () => {
  const tmp = makeTempProject();
  cleanEnv();
  process.env.SANDCASTLE_RUN_ID = 'run-abc';
  const recorder = createRecorder(tmp);
  recorder.record({ tier: 'T1', ruleId: 'r', outcome: 'passed', turnIndex: 0, details: {} });
  const events = readEvents(tmp);
  assert(events[0].runId === 'run-abc', `Expected run-abc, got ${events[0].runId}`);
  recorder.close();
  restoreEnv();
  rmSync(tmp, { recursive: true, force: true });
});

test('close calls sink close', () => {
  const tmp = makeTempProject();
  cleanEnv();
  const recorder = createRecorder(tmp);
  recorder.close();
  // Double close should not throw
  recorder.close();
  restoreEnv();
  rmSync(tmp, { recursive: true, force: true });
});

test('turnIndex auto-increments when not provided', () => {
  const tmp = makeTempProject();
  cleanEnv();
  const recorder = createRecorder(tmp);
  recorder.record({ tier: 'T1', ruleId: 'r1', outcome: 'blocked', details: {} });
  recorder.record({ tier: 'T1', ruleId: 'r2', outcome: 'passed', details: {} });
  const events = readEvents(tmp);
  assert(events[0].turnIndex === 0, `Expected turnIndex=0, got ${events[0].turnIndex}`);
  assert(events[1].turnIndex === 1, `Expected turnIndex=1, got ${events[1].turnIndex}`);
  recorder.close();
  restoreEnv();
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
console.log(`Recorder tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

#!/usr/bin/env node
/**
 * Unit tests for scripts/monitor/config.mjs
 */
import { loadConfig } from '../../../scripts/monitor/config.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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

function makeTempProject(files = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'monitor-config-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(tmp, relPath);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return tmp;
}

// ═══════════════════════════════════════════════════════════════════

test('returns defaults when config file missing', () => {
  const tmp = makeTempProject();
  const config = loadConfig(tmp);
  assert(config.enabled === true, `Expected enabled=true, got ${config.enabled}`);
  assert(config.sink === 'ndjson', `Expected sink=ndjson, got ${config.sink}`);
  assert(typeof config.ndjson.dir === 'string', 'Expected ndjson.dir');
  rmSync(tmp, { recursive: true, force: true });
});

test('returns defaults when monitor key absent', () => {
  const tmp = makeTempProject({ '.sandcastle/config.json': '{"other": 1}' });
  const config = loadConfig(tmp);
  assert(config.enabled === true, `Expected enabled=true, got ${config.enabled}`);
  assert(config.sink === 'ndjson', `Expected sink=ndjson, got ${config.sink}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('merges partial overrides', () => {
  const tmp = makeTempProject({ '.sandcastle/config.json': JSON.stringify({ monitor: { sink: 'sqlite' } }) });
  const config = loadConfig(tmp);
  assert(config.sink === 'sqlite', `Expected sink=sqlite, got ${config.sink}`);
  assert(config.enabled === true, 'enabled should default to true');
  assert(typeof config.ndjson.dir === 'string', 'ndjson.dir should still have default');
  rmSync(tmp, { recursive: true, force: true });
});

test('enabled false propagated', () => {
  const tmp = makeTempProject({ '.sandcastle/config.json': JSON.stringify({ monitor: { enabled: false } }) });
  const config = loadConfig(tmp);
  assert(config.enabled === false, `Expected enabled=false, got ${config.enabled}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('custom sink path resolved relative to projectRoot', () => {
  const tmp = makeTempProject({ '.sandcastle/config.json': JSON.stringify({ monitor: { sink: './my-sink.mjs' } }) });
  const config = loadConfig(tmp);
  assert(config.sink.startsWith(tmp), `Expected absolute path starting with ${tmp}, got ${config.sink}`);
  assert(config.sink.endsWith('my-sink.mjs'), `Expected path ending with my-sink.mjs, got ${config.sink}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('malformed JSON returns defaults with no crash', () => {
  const tmp = makeTempProject({ '.sandcastle/config.json': '{not valid json' });
  const config = loadConfig(tmp);
  assert(config.enabled === true, `Expected defaults, got enabled=${config.enabled}`);
  assert(config.sink === 'ndjson', `Expected defaults, got sink=${config.sink}`);
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
console.log(`Config tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

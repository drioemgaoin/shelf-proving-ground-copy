#!/usr/bin/env node
/**
 * Integration tests for T1 hook monitoring.
 * Spawns apply-t1.mjs against a temp project and verifies NDJSON events.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

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

const hookPath = join(process.cwd(), '.claude', 'hooks', 'apply-t1.mjs');

function makeTempProject() {
  const tmp = mkdtempSync(join(tmpdir(), 't1-monitor-test-'));
  const logsDir = join(tmp, '.sandcastle', 'logs', 'monitor');

  // Create a simple rule file with a T1 block
  mkdirSync(join(tmp, '.claude', 'rules'), { recursive: true });
  writeFileSync(join(tmp, '.claude', 'rules', 'test.md'), `
# Test rule

- No raw hex colors.

  \`\`\`enforcement
  id: "no-hex-colors"
  tier: T1
  - pattern: "#[0-9a-fA-F]{3,8}"
    assert: absent
    scope: "src/**/*.css"
    fix: "Use a token"
  \`\`\`
`);

  // Create monitor config
  mkdirSync(join(tmp, '.sandcastle'), { recursive: true });
  writeFileSync(join(tmp, '.sandcastle', 'config.json'), JSON.stringify({
    monitor: { enabled: true, sink: 'ndjson', ndjson: { dir: logsDir } },
  }));

  return { tmp, logsDir };
}

function readMonitorEvents(logsDir) {
  try {
    const files = readdirSync(logsDir).filter(f => f.endsWith('.jsonl'));
    const events = [];
    for (const file of files) {
      for (const line of readFileSync(join(logsDir, file), 'utf-8').split('\n')) {
        if (line.trim()) events.push(JSON.parse(line));
      }
    }
    return events;
  } catch {
    return [];
  }
}

function runT1(tmp, toolInput) {
  const input = JSON.stringify({ tool_name: 'Write', tool_input: toolInput });
  try {
    execFileSync('node', [hookPath], {
      input,
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0 };
  } catch (e) {
    return { exitCode: e.status };
  }
}

// ═══════════════════════════════════════════════════════════════════

test('violation records blocked event', () => {
  const { tmp, logsDir } = makeTempProject();
  // Write CSS with a hex color violation
  const result = runT1(tmp, { file_path: join(tmp, 'src', 'app.css'), content: 'body { color: #ff0000; }' });
  assert(result.exitCode === 2, `Expected exit 2, got ${result.exitCode}`);
  const events = readMonitorEvents(logsDir);
  assert(events.length >= 1, `Expected at least 1 event, got ${events.length}`);
  const blocked = events.find(e => e.outcome === 'blocked');
  assert(blocked, 'Expected a blocked event');
  assert(blocked.tier === 'T1', `Expected tier=T1, got ${blocked.tier}`);
  assert(blocked.ruleId === 'no-hex-colors', `Expected ruleId=no-hex-colors, got ${blocked.ruleId}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('clean pass records passed event', () => {
  const { tmp, logsDir } = makeTempProject();
  // Write CSS with no violations
  const result = runT1(tmp, { file_path: join(tmp, 'src', 'app.css'), content: 'body { color: var(--shelf-fg); }' });
  assert(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
  const events = readMonitorEvents(logsDir);
  assert(events.length >= 1, `Expected at least 1 event, got ${events.length}`);
  const passedEv = events.find(e => e.outcome === 'passed');
  assert(passedEv, 'Expected a passed event');
  assert(passedEv.ruleId === 'no-hex-colors', `Expected ruleId=no-hex-colors`);
  rmSync(tmp, { recursive: true, force: true });
});

test('ruleId matches enforcement block id', () => {
  const { tmp, logsDir } = makeTempProject();
  runT1(tmp, { file_path: join(tmp, 'src', 'app.css'), content: 'body { color: #fff; }' });
  const events = readMonitorEvents(logsDir);
  assert(events[0].ruleId === 'no-hex-colors', `Expected no-hex-colors, got ${events[0].ruleId}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('monitoring failure does not change T1 exit code', () => {
  const { tmp } = makeTempProject();
  // Point monitor to a bad location (read-only /dev/null dir equivalent)
  writeFileSync(join(tmp, '.sandcastle', 'config.json'), JSON.stringify({
    monitor: { enabled: true, sink: 'ndjson', ndjson: { dir: '/dev/null/impossible' } },
  }));
  // Should still exit 2 for violation, not crash
  const result = runT1(tmp, { file_path: join(tmp, 'src', 'app.css'), content: 'body { color: #fff; }' });
  assert(result.exitCode === 2, `Expected exit 2 (violation), got ${result.exitCode}`);
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
console.log(`T1 integration tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

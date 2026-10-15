#!/usr/bin/env node
/**
 * Tests for configuration loading.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverRulesFiles } from '../../../.claude/hooks/lib/rules.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

function makeTempProject(files) {
  const tmp = mkdtempSync(join(tmpdir(), 'config-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(tmp, relPath);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return tmp;
}

// UC-58a: Missing config file → all defaults (standard locations only)
test('UC-58a: missing config → defaults', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': '# rules',
  });
  // No .sandcastle/config.json → should still discover standard rules
  const files = discoverRulesFiles(tmp);
  assert(files.length >= 1, `Expected at least 1 file, got ${files.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

// UC-58b: Invalid JSON → continues (silent error in discoverRulesFiles)
test('UC-58b: invalid JSON config → continues without error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': '# rules',
    '.sandcastle/config.json': '{not valid json!!!',
  });
  // Should not throw, should still find standard rules
  const files = discoverRulesFiles(tmp);
  assert(files.length >= 1, `Expected at least 1 file, got ${files.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

// UC-58c: Missing key → default for that key (extraPaths not present)
test('UC-58c: config missing extraPaths key → default empty', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': '# rules',
    '.sandcastle/config.json': '{"rules": {}}',
  });
  // Config exists but no extraPaths → standard rules only
  const files = discoverRulesFiles(tmp);
  assert(files.length >= 1, `Expected at least 1 file, got ${files.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`Config tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

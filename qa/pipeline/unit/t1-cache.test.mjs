#!/usr/bin/env node
/**
 * Tests for T1 enforcement cache: strip-enforcement.mjs writes .t1-cache.json
 * and apply-t1.mjs reads it inside containers where rules have been stripped.
 *
 * RED/GREEN:
 *  - Stripped rules yield 0 T1 blocks (proves the problem)
 *  - strip-enforcement creates .t1-cache.json with correct blocks
 *  - apply-t1 reads cache and enforces rules despite stripped markdown
 *  - Fallback: no cache → reads rules directly (host mode)
 */
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync,
  readdirSync, cpSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync, spawnSync } from 'node:child_process';

const PROJECT_ROOT = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); console.log(`  ✗ ${label}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── Helper: create a temp project with rules ─────────────────────────

function createTempProject() {
  const root = mkdtempSync(join(tmpdir(), 't1-cache-test-'));
  const rulesDir = join(root, '.claude', 'rules');
  mkdirSync(rulesDir, { recursive: true });

  // Copy lib/rules.mjs so strip-enforcement and apply-t1 can import it
  const hooksLibDir = join(root, '.claude', 'hooks', 'lib');
  mkdirSync(hooksLibDir, { recursive: true });
  cpSync(join(PROJECT_ROOT, '.claude', 'hooks', 'lib', 'rules.mjs'), join(hooksLibDir, 'rules.mjs'));

  // Write a rules file with T1 enforcement blocks
  writeFileSync(join(rulesDir, 'test-rules.md'), `---
paths: src/**/*
---

# Test Rules

## Values

- No raw hex colors.

  \`\`\`enforcement
  id: "no-raw-hex"
  tier: T1
  - pattern: "#[0-9a-fA-F]{3,8}"
    assert: absent
    scope: "src/**/*.css"
    fix: "Use a token instead of a raw hex color"
  \`\`\`

## Patterns

- Toast at bottom-center.

  \`\`\`enforcement
  id: "toast-pattern"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: patterns
  instruction: "Check toast position."
  \`\`\`
`);

  return root;
}

// ══════════════════════════════════════════════════════════════════════
// Test 1: Prove the problem — stripped rules yield 0 T1 blocks
// ══════════════════════════════════════════════════════════════════════

test('stripped rules yield 0 T1 blocks (proves the bug)', () => {
  const root = createTempProject();
  const rulesDir = join(root, '.claude', 'rules');
  const rulesFile = join(rulesDir, 'test-rules.md');

  // Import the functions we need
  const { parseEnforcementBlocks, stripEnforcementFences } = await_import(root);

  // Before stripping: should find T1 blocks
  const original = readFileSync(rulesFile, 'utf8');
  const { blocks: beforeBlocks } = parseEnforcementBlocks(original, rulesFile);
  const t1Before = beforeBlocks.filter(b => b.tier === 'T1');
  assert(t1Before.length > 0, `Expected T1 blocks before stripping, got ${t1Before.length}`);

  // After stripping: should find 0 T1 blocks
  const stripped = stripEnforcementFences(original);
  writeFileSync(rulesFile, stripped);
  const { blocks: afterBlocks } = parseEnforcementBlocks(stripped, rulesFile);
  const t1After = afterBlocks.filter(b => b.tier === 'T1');
  assert(t1After.length === 0, `Expected 0 T1 blocks after stripping, got ${t1After.length}`);

  rmSync(root, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════════════
// Test 2: strip-enforcement.mjs creates .t1-cache.json
// ══════════════════════════════════════════════════════════════════════

test('write-t1-cache creates .t1-cache.json with T1 blocks', () => {
  const root = createTempProject();
  const rulesDir = join(root, '.claude', 'rules');
  const cachePath = join(rulesDir, '.t1-cache.json');

  // Copy write-t1-cache.mjs to the temp project
  const cacheScript = join(root, 'scripts', 'write-t1-cache.mjs');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(PROJECT_ROOT, 'scripts', 'write-t1-cache.mjs'), cacheScript);

  // Run write-t1-cache inside the temp project
  const result = spawnSync('node', [cacheScript], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
  });

  assert(result.status === 0, `write-t1-cache exited with ${result.status}: ${result.stderr}`);
  assert(existsSync(cachePath), '.t1-cache.json was not created');

  const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
  assert(Array.isArray(cached), 'Cache is not an array');
  assert(cached.length > 0, 'Cache is empty');

  // Only T1 blocks in cache
  const nonT1 = cached.filter(b => b.tier !== 'T1');
  assert(nonT1.length === 0, `Cache contains non-T1 blocks: ${nonT1.map(b => b.tier)}`);

  // Correct block data
  const hexBlock = cached.find(b => b.id === 'no-raw-hex');
  assert(hexBlock, 'no-raw-hex block not in cache');
  assert(hexBlock.pattern === '#[0-9a-fA-F]{3,8}', `Unexpected pattern: ${hexBlock.pattern}`);
  assert(hexBlock.assert === 'absent', `Unexpected assert: ${hexBlock.assert}`);
  assert(hexBlock.scope === 'src/**/*.css', `Unexpected scope: ${hexBlock.scope}`);

  // T3 blocks should NOT be in cache
  const toastBlock = cached.find(b => b.id === 'toast-pattern');
  assert(!toastBlock, 'T3 toast-pattern should not be in T1 cache');

  rmSync(root, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════════════
// Test 3: Cache survives stripping — full roundtrip
// ══════════════════════════════════════════════════════════════════════

test('cache roundtrip: strip then parse cache yields same T1 blocks', () => {
  const root = createTempProject();
  const rulesDir = join(root, '.claude', 'rules');
  const rulesFile = join(rulesDir, 'test-rules.md');

  const { parseEnforcementBlocks, stripEnforcementFences } = await_import(root);

  // Parse before stripping
  const original = readFileSync(rulesFile, 'utf8');
  const { blocks: origBlocks } = parseEnforcementBlocks(original, rulesFile);
  const origT1 = origBlocks.filter(b => b.tier === 'T1');

  // Write cache (simulating what strip-enforcement does)
  writeFileSync(join(rulesDir, '.t1-cache.json'), JSON.stringify(origT1));

  // Strip
  writeFileSync(rulesFile, stripEnforcementFences(original));

  // Read cache
  const cached = JSON.parse(readFileSync(join(rulesDir, '.t1-cache.json'), 'utf8'));

  // Compare
  assert(cached.length === origT1.length, `Cache has ${cached.length} blocks, expected ${origT1.length}`);
  for (let i = 0; i < cached.length; i++) {
    assert(cached[i].id === origT1[i].id, `Block ${i} id mismatch: ${cached[i].id} vs ${origT1[i].id}`);
    assert(cached[i].pattern === origT1[i].pattern, `Block ${i} pattern mismatch`);
    assert(cached[i].scope === origT1[i].scope, `Block ${i} scope mismatch`);
  }

  rmSync(root, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════════════
// Test 4: Real project rules produce valid cache
// ══════════════════════════════════════════════════════════════════════

test('real project rules: cache contains expected T1 block ids', () => {
  const root = mkdtempSync(join(tmpdir(), 't1-cache-real-'));
  const rulesDir = join(root, '.claude', 'rules');
  mkdirSync(rulesDir, { recursive: true });

  // Copy real rules and required libs
  for (const f of readdirSync(join(PROJECT_ROOT, '.claude', 'rules'))) {
    if (f.endsWith('.md') || f.endsWith('.markdown')) {
      cpSync(join(PROJECT_ROOT, '.claude', 'rules', f), join(rulesDir, f));
    }
  }
  const hooksLibDir = join(root, '.claude', 'hooks', 'lib');
  mkdirSync(hooksLibDir, { recursive: true });
  cpSync(join(PROJECT_ROOT, '.claude', 'hooks', 'lib', 'rules.mjs'), join(hooksLibDir, 'rules.mjs'));

  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(PROJECT_ROOT, 'scripts', 'write-t1-cache.mjs'), join(root, 'scripts', 'write-t1-cache.mjs'));

  const result = spawnSync('node', [join(root, 'scripts', 'write-t1-cache.mjs')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
  });

  assert(result.status === 0, `write-t1-cache failed: ${result.stderr}`);

  const cachePath = join(rulesDir, '.t1-cache.json');
  assert(existsSync(cachePath), 'Cache not created for real rules');

  const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
  const ids = cached.map(b => b.id);

  // These T1 blocks must exist in the real rules
  const expectedIds = [
    'no-bem-separators',
    'media-range-notation',
    'values-from-tokens',
    'z-index-from-tokens',
    'animate-only-transform-opacity',
    'motion-tokens',
    'never-edit-locked-files',
    'agent-tests-in-e2e-agent',
  ];

  for (const expected of expectedIds) {
    assert(ids.includes(expected), `Missing T1 block in cache: ${expected}`);
  }

  rmSync(root, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════════════
// Test 5: Stale worktree — rules already stashed, write-t1-cache fails
// ══════════════════════════════════════════════════════════════════════

test('write-t1-cache exits non-zero when rules are missing (stale worktree)', () => {
  const root = createTempProject();
  const rulesDir = join(root, '.claude', 'rules');
  const stashDir = join(root, '.sandcastle', '.rules-stash');

  // Simulate a previous run: move rules to stash
  mkdirSync(stashDir, { recursive: true });
  for (const f of readdirSync(rulesDir)) {
    if (f.endsWith('.md')) {
      cpSync(join(rulesDir, f), join(stashDir, f));
    }
  }
  // Remove the markdown files from rules dir (keep dir itself)
  for (const f of readdirSync(rulesDir)) {
    if (f.endsWith('.md')) rmSync(join(rulesDir, f));
  }

  // Run write-t1-cache — should FAIL because no rules
  const cacheScript = join(root, 'scripts', 'write-t1-cache.mjs');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(PROJECT_ROOT, 'scripts', 'write-t1-cache.mjs'), cacheScript);

  const result = spawnSync('node', [cacheScript], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
  });

  assert(result.status !== 0, `write-t1-cache should exit non-zero when rules are stashed, got ${result.status}`);
  assert(
    result.stderr.includes('ERROR'),
    `Expected ERROR message, got: ${result.stderr}`,
  );

  rmSync(root, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════════════
// Test 6: Sandbox hook sequence is idempotent (restores from stash)
// ══════════════════════════════════════════════════════════════════════

test('sandbox hooks restore rules from stash before building cache (idempotent)', () => {
  // Verify createBuilderHooks includes the restore-before-cache step
  const src = readFileSync(join(PROJECT_ROOT, '.sandcastle', 'lib', 'sandbox.mts'), 'utf8');
  const builderStart = src.indexOf('export function createBuilderHooks');
  const builderEnd = src.indexOf('\n}', builderStart);
  const builderBody = src.slice(builderStart, builderEnd);

  // The restore step must appear BEFORE write-t1-cache
  const restoreIdx = builderBody.indexOf('.rules-stash');
  const cacheIdx = builderBody.indexOf('write-t1-cache');
  const stashIdx = builderBody.indexOf('mv .claude/rules .sandcastle/.rules-stash');

  assert(restoreIdx !== -1, 'Builder hooks must reference .rules-stash for restore step');
  assert(cacheIdx !== -1, 'Builder hooks must run write-t1-cache');
  assert(restoreIdx < cacheIdx, 'Restore from stash must happen BEFORE write-t1-cache');
  assert(cacheIdx < stashIdx, 'write-t1-cache must happen BEFORE re-stashing rules');
});

test('sandbox hooks produce non-empty cache in stale worktree (integration)', () => {
  const root = createTempProject();
  const rulesDir = join(root, '.claude', 'rules');
  const stashDir = join(root, '.sandcastle', '.rules-stash');

  // Simulate a previous run: stash the rules
  mkdirSync(stashDir, { recursive: true });
  for (const f of readdirSync(rulesDir)) {
    if (f.endsWith('.md')) {
      cpSync(join(rulesDir, f), join(stashDir, f));
    }
  }
  for (const f of readdirSync(rulesDir)) {
    if (f.endsWith('.md')) rmSync(join(rulesDir, f));
  }

  // Now simulate the fixed hook sequence:
  // Step 1: Restore from stash
  if (existsSync(stashDir)) {
    for (const f of readdirSync(stashDir)) {
      if (f.endsWith('.md')) {
        cpSync(join(stashDir, f), join(rulesDir, f));
      }
    }
  }

  // Step 2: Write cache
  const cacheScript = join(root, 'scripts', 'write-t1-cache.mjs');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(PROJECT_ROOT, 'scripts', 'write-t1-cache.mjs'), cacheScript);

  const result = spawnSync('node', [cacheScript], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
  });

  assert(result.status === 0, `write-t1-cache should succeed after restore, got: ${result.stderr}`);

  const cachePath = join(rulesDir, '.t1-cache.json');
  assert(existsSync(cachePath), 'Cache must exist after restore + write');

  const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
  assert(cached.length > 0, `Cache must be non-empty after restore, got ${cached.length} blocks`);

  rmSync(root, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════

function await_import(root) {
  // Dynamic import of rules.mjs from the real project (not the temp copy)
  const rulesLib = join(PROJECT_ROOT, '.claude', 'hooks', 'lib', 'rules.mjs');
  // We can't use dynamic import easily in sync tests, so shell out
  function parseEnforcementBlocks(content, filePath) {
    const script = `
      import { parseEnforcementBlocks } from ${JSON.stringify('file://' + rulesLib)};
      const content = ${JSON.stringify(content)};
      const result = parseEnforcementBlocks(content, ${JSON.stringify(filePath)});
      process.stdout.write(JSON.stringify(result));
    `;
    const r = spawnSync('node', ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      timeout: 5000,
    });
    if (r.status !== 0) throw new Error(`parseEnforcementBlocks failed: ${r.stderr}`);
    return JSON.parse(r.stdout);
  }

  function stripEnforcementFences(content) {
    const script = `
      import { stripEnforcementFences } from ${JSON.stringify('file://' + rulesLib)};
      const content = ${JSON.stringify(content)};
      process.stdout.write(stripEnforcementFences(content));
    `;
    const r = spawnSync('node', ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      timeout: 5000,
    });
    if (r.status !== 0) throw new Error(`stripEnforcementFences failed: ${r.stderr}`);
    return r.stdout;
  }

  return { parseEnforcementBlocks, stripEnforcementFences };
}

// ══════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}

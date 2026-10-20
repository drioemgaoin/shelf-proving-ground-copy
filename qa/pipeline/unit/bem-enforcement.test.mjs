#!/usr/bin/env node
/**
 * Tests for BEM enforcement rules in ui-project.md.
 * Validates the regex patterns and confirms the rules exist.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT_ROOT = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); console.log(`  ✗ ${label}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── Parse the real rules ─────────────────────────────────────────────

function parseRealRules() {
  const rulesPath = join(PROJECT_ROOT, '.claude', 'rules', 'ui-project.md');
  const content = readFileSync(rulesPath, 'utf8');
  const rulesLib = join(PROJECT_ROOT, '.claude', 'hooks', 'lib', 'rules.mjs');
  const script = `
    import { parseEnforcementBlocks } from ${JSON.stringify('file://' + rulesLib)};
    const content = ${JSON.stringify(content)};
    const result = parseEnforcementBlocks(content, ${JSON.stringify(rulesPath)});
    process.stdout.write(JSON.stringify(result));
  `;
  const r = spawnSync('node', ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (r.status !== 0) throw new Error(`parseEnforcementBlocks failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const { blocks } = parseRealRules();
const t1Blocks = blocks.filter(b => b.tier === 'T1');

// ══════════════════════════════════════════════════════════════════════
// Test: no-bem-separators block exists
// ══════════════════════════════════════════════════════════════════════

test('ui-project.md contains no-bem-separators T1 blocks', () => {
  const bemBlocks = t1Blocks.filter(b => b.id === 'no-bem-separators');
  assert(bemBlocks.length === 2, `Expected 2 no-bem-separators entries (__ and --), got ${bemBlocks.length}`);
});

// ══════════════════════════════════════════════════════════════════════
// Test: media-range-notation block exists
// ══════════════════════════════════════════════════════════════════════

test('ui-project.md contains media-range-notation T1 block', () => {
  const mrBlocks = t1Blocks.filter(b => b.id === 'media-range-notation');
  assert(mrBlocks.length >= 1, `Expected media-range-notation T1 block, got ${mrBlocks.length}`);
});

// ══════════════════════════════════════════════════════════════════════
// Test: BEM __ pattern matches BEM-style classes
// ══════════════════════════════════════════════════════════════════════

test('BEM __ pattern matches .card__title', () => {
  const block = t1Blocks.find(b => b.id === 'no-bem-separators' && b.pattern.includes('__'));
  assert(block, 'no-bem-separators __ block not found');
  const re = new RegExp(block.pattern);
  assert(re.test('.card__title'), '.card__title should match');
  assert(re.test('.block__element'), '.block__element should match');
  assert(re.test('.nav__item'), '.nav__item should match');
});

// ══════════════════════════════════════════════════════════════════════
// Test: BEM -- pattern matches BEM-style modifiers
// ══════════════════════════════════════════════════════════════════════

test('BEM -- pattern matches .btn--primary', () => {
  const block = t1Blocks.find(b => b.id === 'no-bem-separators' && b.pattern.includes('--'));
  assert(block, 'no-bem-separators -- block not found');
  const re = new RegExp(block.pattern);
  assert(re.test('.btn--primary'), '.btn--primary should match');
  assert(re.test('.card--active'), '.card--active should match');
});

// ══════════════════════════════════════════════════════════════════════
// Test: BEM patterns do NOT match kebab-case
// ══════════════════════════════════════════════════════════════════════

test('BEM patterns do not match kebab-case .card-title', () => {
  for (const block of t1Blocks.filter(b => b.id === 'no-bem-separators')) {
    const re = new RegExp(block.pattern);
    assert(!re.test('.card-title'), `.card-title should NOT match pattern ${block.pattern}`);
    assert(!re.test('.btn-primary'), `.btn-primary should NOT match pattern ${block.pattern}`);
  }
});

// ══════════════════════════════════════════════════════════════════════
// Test: BEM -- pattern does NOT match CSS custom properties
// ══════════════════════════════════════════════════════════════════════

test('BEM -- pattern does not match --shelf-color-default', () => {
  const block = t1Blocks.find(b => b.id === 'no-bem-separators' && b.pattern.includes('--'));
  assert(block, 'no-bem-separators -- block not found');
  const re = new RegExp(block.pattern);
  assert(!re.test('--shelf-color-default'), '--shelf-color-default should NOT match');
  assert(!re.test('var(--shelf-space-md)'), 'var(--shelf-space-md) should NOT match');
});

// ══════════════════════════════════════════════════════════════════════
// Test: media-range pattern matches legacy syntax
// ══════════════════════════════════════════════════════════════════════

test('media-range pattern matches (min-width: 768px)', () => {
  const block = t1Blocks.find(b => b.id === 'media-range-notation');
  assert(block, 'media-range-notation block not found');
  const re = new RegExp(block.pattern);
  assert(re.test('(min-width: 768px)'), '(min-width: 768px) should match');
  assert(re.test('(max-height: 600px)'), '(max-height: 600px) should match');
});

// ══════════════════════════════════════════════════════════════════════
// Test: media-range pattern does NOT match modern range syntax
// ══════════════════════════════════════════════════════════════════════

test('media-range pattern does not match (width >= 768px)', () => {
  const block = t1Blocks.find(b => b.id === 'media-range-notation');
  assert(block, 'media-range-notation block not found');
  const re = new RegExp(block.pattern);
  assert(!re.test('(width >= 768px)'), '(width >= 768px) should NOT match');
  assert(!re.test('(768px <= width <= 1024px)'), 'range syntax should NOT match');
});

// ══════════════════════════════════════════════════════════════════════
// Test: all blocks have required fields per SKILL.md
// ══════════════════════════════════════════════════════════════════════

test('BEM and media-range blocks have required fields', () => {
  const syntaxBlocks = t1Blocks.filter(b =>
    b.id === 'no-bem-separators' || b.id === 'media-range-notation'
  );
  for (const block of syntaxBlocks) {
    assert(block.tier === 'T1', `${block.id}: tier should be T1`);
    assert(block.assert === 'absent', `${block.id}: assert should be absent`);
    assert(block.scope === 'src/**/*.css', `${block.id}: scope should be src/**/*.css`);
    assert(block.strip === 'comments', `${block.id}: strip should be comments`);
    assert(block.fix, `${block.id}: fix is required`);
  }
});

// ══════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}

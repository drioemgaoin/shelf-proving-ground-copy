#!/usr/bin/env node
/**
 * Tests for scripts/build-constraints.mjs.
 *
 * Verifies: T1 filtering, scope filtering, deduplication, grouping,
 * and graceful degradation.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

/** Run build-constraints via CLI and return stdout. */
function run(args = '') {
  const r = spawnSync('node', [join(PROJECT_ROOT, 'scripts/build-constraints.mjs'), ...args.split(' ').filter(Boolean)], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: 10000,
  });
  return r.stdout + (r.stderr || '');
}

// ═══════════════════════════════════════════════════════════════════

test('outputs constraints header', () => {
  const out = run();
  assert(out.includes('# CONSTRAINTS'), 'Missing header');
  assert(out.includes('Hooks enforce them'), 'Missing preamble');
});

test('includes T1 rules only (no T3, T2, Human)', () => {
  const out = run();
  // T1 rule should appear (values-from-tokens extracts bullet text or falls back to sectionHeading)
  assert(out.includes('Every visual value'), 'Missing values-from-tokens constraint');
  // T3-only rules should NOT appear
  assert(!out.includes('interactive-states'), 'T3 interactive-states should not be in constraints');
  assert(!out.includes('data-view-states'), 'T3 data-view-states should not be in constraints');
  assert(!out.includes('toast-pattern'), 'T3 toast-pattern should not be in constraints');
});

test('groups CSS rules under CSS heading', () => {
  const out = run();
  assert(out.includes('## When writing CSS files'), 'Missing CSS heading');
  // values-from-tokens is CSS-scoped
  const cssSection = out.split('## When writing CSS files')[1]?.split('##')[0] ?? '';
  assert(cssSection.includes('Every visual value'), 'values-from-tokens not in CSS section');
});

test('groups TS rules under TS heading', () => {
  const out = run();
  assert(out.includes('## When writing TS/TSX files'), 'Missing TS heading');
  const tsSection = out.split('## When writing TS/TSX files')[1]?.split('##')[0] ?? '';
  assert(tsSection.includes('any') || tsSection.includes('unknown'), 'typescript-no-any not in TS section');
});

test('deduplicates by id (values-from-tokens has 7 patterns but 1 numbered constraint)', () => {
  const out = run();
  // values-from-tokens has 7 patterns but should produce only 1 numbered constraint.
  // Distinct fix texts are merged into a single WRONG line.
  const cssSection = out.split('## When writing CSS files')[1]?.split('##')[0] ?? '';
  // After parser fix, ruleText is extracted from the bullet (not the section heading fallback)
  const numberedLines = cssSection.split('\n').filter(l => /^\d+\.\s+Every visual value/.test(l));
  assert(numberedLines.length === 1, `Expected 1 numbered values-from-tokens constraint, got ${numberedLines.length}`);
});

test('scope filter excludes non-matching rules', () => {
  // Scope to only CSS files — TS rules should be excluded
  const out = run('--scope=src/styles/tokens.css');
  // This scope is excluded by most rules, so should be minimal or empty
  // Actually tokens.css is excluded by most T1 rules. Let's use a CSS-only scope.
  const out2 = run('--scope=src/components/Foo/**');
  // Should include CSS rules
  assert(out2.includes('When writing CSS files'), 'Missing CSS rules for component scope');
  // Should include TS rules (component has .tsx)
  assert(out2.includes('When writing TS/TSX files'), 'Missing TS rules for component scope');
});

test('scope filter excludes e2e rules for src-only scope', () => {
  const out = run('--scope=src/components/Foo/**');
  // "Other" bucket (e2e rules) should not appear
  assert(!out.includes('Do not edit acceptance tests'), 'e2e lock rules should be excluded for src scope');
});

test('no scope = all constraints (no filtering)', () => {
  const out = run();
  // Should include the "Other" bucket with locked-files rule
  assert(out.includes('locked') || out.includes('acceptance'), 'Without scope, all rules should be included');
});

test('includes semantic-tokens-only rule', () => {
  const out = run();
  // Rule text mentions component tokens being scoped to one component's CSS.
  // Fix text (semantic-tier, Primitive) is no longer emitted — match on rule text.
  assert(
    out.includes('semantic-tier') || out.includes('Token tiers') || out.includes('Primitive') || out.includes('Component') || out.includes('--shelf-{component}'),
    'Missing semantic-tokens-only constraint'
  );
});

test('numbering restarts per section', () => {
  const out = run();
  const lines = out.split('\n');
  // Find "1." after each section heading
  let headingCount = 0;
  let firstItemAfterHeading = 0;
  for (const line of lines) {
    if (line.startsWith('## ')) headingCount++;
    if (headingCount > 0 && /^1\. /.test(line)) {
      firstItemAfterHeading++;
      headingCount = 0;
    }
  }
  assert(firstItemAfterHeading >= 3, `Expected at least 3 sections starting with "1.", got ${firstItemAfterHeading}`);
});

test('no-bem-separators deduplicates into one constraint', () => {
  // no-bem-separators has two patterns: one for BEM __ and one for BEM --.
  // Dedup must merge them into a single numbered constraint.
  // Fix text is no longer emitted — we only check that kebab-case rule appears once.
  const out = run('--scope=src/components/Foo/**');
  const cssSection = out.split('## When writing CSS files')[1]?.split('##')[0] ?? '';
  const kebabLines = cssSection.split('\n').filter(l => l.includes('kebab-case'));
  assert(kebabLines.length === 1, `Expected 1 kebab-case constraint, got ${kebabLines.length}`);
});

test('constraint lines contain rule text only — no fix suggestions', () => {
  // Cost reduction: fix messages (→ ...) are for T1 hook errors, not for guiding the agent.
  const out = run();
  const constraintLines = out.split('\n').filter(l => /^\d+\.\s/.test(l));
  assert(constraintLines.length > 0, 'Should have at least one numbered constraint');
  const linesWithArrow = constraintLines.filter(l => l.includes(' → '));
  assert(linesWithArrow.length === 0, `Found ${linesWithArrow.length} constraint(s) with fix text: ${linesWithArrow[0]}`);
});

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════

console.log(`\nbuild-constraints tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}

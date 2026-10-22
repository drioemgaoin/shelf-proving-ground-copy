#!/usr/bin/env node
/**
 * TGF-41: scopeOverlaps bidirectional edge cases.
 *
 * Tests that buildConstraints correctly includes/excludes T1 rules
 * when ticket scope and rule scope overlap bidirectionally, including
 * brace expansion patterns.
 *
 * Seam: buildConstraints(projectDir, { ticketScope }) — scope filtering.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildConstraints } from '../../../scripts/build-constraints.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); console.log(`  ✗ ${label}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------------------------------------------------------------------------
// Fixture: synthetic project with rules of known scopes
// ---------------------------------------------------------------------------

let tmpDir;

function setup() {
  tmpDir = mkdtempSync(join(tmpdir(), 'tgf41-'));
  const rulesDir = join(tmpDir, '.claude', 'rules');
  mkdirSync(rulesDir, { recursive: true });

  // Rule A: narrow CSS scope
  writeFileSync(join(rulesDir, 'narrow-css.md'), `---
paths: src/**/*
---

# Narrow CSS rule

\`\`\`enforcement
id: "narrow-css-rule"
tier: T1
- pattern: "hardcoded-color"
  assert: absent
  scope: "src/styles/*.css"
  fix: "Use a token instead of hardcoded-color"
\`\`\`
`);

  // Rule B: broad TS scope with brace expansion
  writeFileSync(join(rulesDir, 'broad-ts.md'), `---
paths: src/**/*
---

# Broad TS rule

\`\`\`enforcement
id: "broad-ts-rule"
tier: T1
- pattern: "any"
  assert: absent
  scope: "src/**/*.{ts,tsx}"
  fix: "Use unknown instead of any"
\`\`\`
`);

  // Rule C: tests-only scope (for non-overlap verification)
  writeFileSync(join(rulesDir, 'tests-only.md'), `---
paths: tests/**/*
---

# Tests-only rule

\`\`\`enforcement
id: "tests-only-rule"
tier: T1
- pattern: "forbidden"
  assert: absent
  scope: "tests/**/*.ts"
  fix: "Remove forbidden call"
\`\`\`
`);
}

function teardown() {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

setup();

test('(a) broad ticket src/** includes narrow rule src/styles/*.css', () => {
  const { constraints } = buildConstraints(tmpDir, { ticketScope: 'src/**' });
  assert(constraints.includes('hardcoded-color') || constraints.includes('narrow-css-rule'),
    'narrow CSS rule should be included when ticket scope is broad src/**');
});

test('(b) narrow ticket src/components/Card.tsx includes broad rule src/**/*.{ts,tsx}', () => {
  const { constraints } = buildConstraints(tmpDir, { ticketScope: 'src/components/Card.tsx' });
  assert(constraints.includes('unknown') || constraints.includes('broad-ts-rule'),
    'broad TS rule should be included when ticket is a single .tsx file');
});

test('(c) non-overlapping: ticket tests/** excludes rule src/styles/*.css', () => {
  const { constraints } = buildConstraints(tmpDir, { ticketScope: 'tests/**' });
  assert(!constraints.includes('hardcoded-color') && !constraints.includes('narrow-css-rule'),
    'CSS rule scoped to src/styles/ should be excluded for tests/** ticket');
});

test('(d) brace pattern: rule src/**/*.{ts,tsx} matches ticket with .ts file', () => {
  const { constraints } = buildConstraints(tmpDir, { ticketScope: 'src/utils/helpers.ts' });
  assert(constraints.includes('unknown') || constraints.includes('broad-ts-rule'),
    'rule with {ts,tsx} brace scope should match a .ts ticket file');
});

teardown();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nscopeOverlaps tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}

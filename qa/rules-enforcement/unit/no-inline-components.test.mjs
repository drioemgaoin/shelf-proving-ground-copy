#!/usr/bin/env node
/**
 * Eval: no-inline-components
 *
 * Reproduces: djk.1 run 4e4e325 — builder defined SkeletonCard and BookCard
 *   as local functions inside BookGrid.tsx instead of extracting them to
 *   their own component directories.
 * Root cause: No T1 enforcement prevented inline component definitions.
 *   The single-responsibility T3 rule existed but the builder never saw it.
 * Fix: Added T1 enforcement block "no-inline-components" in composable-blocks.md
 *   that catches non-exported uppercase function/const declarations in component files.
 *
 * Seam: .claude/rules/composable-blocks.md
 * Level: unit
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, detail) {
  if (condition) { passed++; }
  else { failed++; failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`); }
}

const rulesFile = readFileSync('.claude/rules/composable-blocks.md', 'utf8');

// ─── Block exists ────────────────────────────────────────────────

assert(
  'no-inline-components block exists',
  rulesFile.includes('id: "no-inline-components"'),
  'enforcement block with id "no-inline-components" not found',
);

assert(
  'no-inline-components is T1',
  /id:\s*"no-inline-components"\s*\n\s*tier:\s*T1/.test(rulesFile),
  'block should be tier T1',
);

// ─── Pattern catches non-exported uppercase functions ────────────

assert(
  'pattern targets uppercase function declarations',
  rulesFile.includes('function\\s+[A-Z]'),
  'pattern should match non-exported functions starting with uppercase',
);

assert(
  'pattern targets uppercase const arrow components',
  rulesFile.includes('const\\s+[A-Z]'),
  'pattern should match non-exported const arrow-function components',
);

// ─── Scope is component files only ──────────────────────────────

assert(
  'scope targets component .tsx files',
  rulesFile.includes('scope: "src/components/**/*.tsx"'),
  'scope should be src/components/**/*.tsx',
);

// ─── Skip-lines exempts exported functions ──────────────────────

assert(
  'skip-lines exempts export function',
  rulesFile.includes('skip-lines:') && rulesFile.includes('export'),
  'skip-lines should exempt exported functions (the main component)',
);

// ─── Assert direction is absent ─────────────────────────────────

// Extract the enforcement block content
const blockMatch = rulesFile.match(/id:\s*"no-inline-components"[\s\S]*?```/);
assert(
  'enforcement block is parseable',
  blockMatch !== null,
  'could not extract the no-inline-components enforcement block',
);

if (blockMatch) {
  const block = blockMatch[0];
  assert(
    'assert: absent for function pattern',
    block.includes('assert: absent'),
    'patterns should use assert: absent (banning inline components)',
  );

  // ─── Multi-export pattern exists ────────────────────────────────

  assert(
    'multi-line pattern catches multiple exported components',
    block.includes('export') && block.includes('\\n') && block.includes('Only one component per file'),
    'third pattern should use multi-line matching (\\n) to detect 2+ exported components in one file',
  );
}

// ─── Rule prose exists ──────────────────────────────────────────

assert(
  'rule section heading exists',
  rulesFile.includes('## No inline components'),
  'missing section heading "## No inline components"',
);

assert(
  'CORRECT example shows import pattern',
  rulesFile.includes("import { BookCard } from '../BookCard/BookCard'"),
  'CORRECT example should show importing from own directory',
);

assert(
  'WRONG example shows local function',
  rulesFile.includes('function BookCard({ book }'),
  'WRONG example should show local function definition',
);

// ─── Single-responsibility T3 updated ───────────────────────────

const srBlock = rulesFile.match(/id:\s*"single-responsibility"[\s\S]*?```/);
assert(
  'single-responsibility instruction mentions inline components',
  srBlock && srBlock[0].includes('local functions'),
  'single-responsibility T3 instruction should mention extracting local function components',
);

// ─── No duplication with component-in-own-directory ─────────────

// The existing rule catches flat files in src/components/; this catches inline definitions.
// They are complementary, not overlapping.
assert(
  'no-inline-components is distinct from component-in-own-directory',
  rulesFile.includes('no-inline-components') && !rulesFile.includes('no-inline-components" === "component-in-own-directory"'),
  'rules should be complementary, not duplicated',
);

// ─── Summary ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) { console.log(failures.join('\n')); process.exit(1); }

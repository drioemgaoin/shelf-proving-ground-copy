#!/usr/bin/env node
/**
 * Eval: a11y-css-pattern-completeness rule
 *
 * Reproduces the real finding from sandcastle run djk.1 review-r1:
 *   .shelf-live had only `position: absolute; overflow: hidden;` —
 *   missing width/height: 1px, clip-path: inset(50%), white-space: nowrap.
 *   The incomplete pattern renders aria-live text visible to sighted users.
 *
 * Root cause: no enforcement block checked whether accessibility CSS patterns
 * were complete. The reviewer caught it under generic "clarity" — one QA
 * round wasted.
 *
 * Fix: one universal T3 enforcement block (a11y-css-pattern-completeness)
 * that covers all a11y CSS patterns where missing a property breaks the
 * contract: sr-only, focus-visible, reduced-motion.
 *
 * Seam: .claude/rules/ui-base.md enforcement blocks
 * Level: unit
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const rulesFile = readFileSync('.claude/rules/ui-base.md', 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// Enforcement block exists with correct tier/agent/scope
// ═══════════════════════════════════════════════════════════════════════════

assert(
  'rule: enforcement block exists',
  rulesFile.includes('id: "a11y-css-pattern-completeness"'),
  'ui-base.md must have an enforcement block with id a11y-css-pattern-completeness',
);

const blockMatch = rulesFile.match(
  /id:\s*"a11y-css-pattern-completeness"[\s\S]*?```/,
);
const block = blockMatch ? blockMatch[0] : '';

assert(
  'rule: tier is T3',
  /tier:\s*T3/.test(block),
  'Must be T3 (multi-property completeness requires reviewer judgment)',
);

assert(
  'rule: agent is reviewer',
  /agent:\s*reviewer/.test(block),
  'Must be assigned to reviewer agent',
);

assert(
  'rule: scope covers CSS files',
  /scope:.*\.css/.test(block),
  'Scope must include CSS files',
);

assert(
  'rule: group is accessibility',
  /group:\s*accessibility/.test(block),
  'Group must be accessibility',
);

// ═══════════════════════════════════════════════════════════════════════════
// Instruction covers the sr-only pattern (djk.1 failure case)
// ═══════════════════════════════════════════════════════════════════════════

const srOnlyProperties = [
  { name: 'position: absolute', pattern: /position:\s*absolute/ },
  { name: 'overflow: hidden', pattern: /overflow:\s*hidden/ },
  { name: 'width/inline-size: 1px', pattern: /width|inline-size/ },
  { name: 'height/block-size: 1px', pattern: /height|block-size/ },
  { name: 'clip-path: inset(50%)', pattern: /clip-path/ },
  { name: 'white-space: nowrap', pattern: /white-space/ },
];

for (const { name, pattern } of srOnlyProperties) {
  assert(
    `sr-only property in instruction: ${name}`,
    pattern.test(block),
    `Instruction must list ${name} as required for sr-only pattern`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Universality: instruction is about pattern completeness, not one pattern
// (focus-visible and reduced-motion have their own T3 blocks — no duplication)
// ═══════════════════════════════════════════════════════════════════════════

assert(
  'universal: instruction mentions "accessibility pattern" generically',
  block.includes('accessibility pattern') || block.includes('a11y CSS pattern'),
  'Instruction must frame this as a general accessibility pattern check, not sr-only only',
);

assert(
  'universal: prose guidance covers focus-visible',
  rulesFile.includes('focus-visible'),
  'The surrounding prose must mention focus-visible as another a11y CSS pattern',
);

// ═══════════════════════════════════════════════════════════════════════════
// CORRECT/WRONG examples in the surrounding prose
// ═══════════════════════════════════════════════════════════════════════════

assert(
  'guidance: CORRECT sr-only example',
  rulesFile.includes('CORRECT (complete sr-only pattern'),
  'Must have a CORRECT example showing the full sr-only pattern',
);

assert(
  'guidance: WRONG sr-only example',
  rulesFile.includes('WRONG (incomplete'),
  'Must have a WRONG example showing the incomplete pattern',
);

// ═══════════════════════════════════════════════════════════════════════════
// Instruction explains the consequence (silent failure)
// ═══════════════════════════════════════════════════════════════════════════

assert(
  'consequence: explains silent a11y failure',
  block.includes('silent') || block.includes('fails silently'),
  'Instruction must explain incomplete patterns cause silent a11y failures',
);

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}

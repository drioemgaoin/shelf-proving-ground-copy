#!/usr/bin/env node
/**
 * RED/GREEN tests for T1 enforcement patterns in ui-base.md.
 *
 * Each pattern must:
 *   RED:   Match at least one violation string (proves the pattern catches bugs)
 *   GREEN: Not match clean code (proves no false positives)
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
// values-from-tokens — role-matching: background must use bgColor tokens
// ═══════════════════════════════════════════════════════════════════════════

{
  assert(
    'role-match bg: pattern exists in rules',
    rulesFile.includes('fgColor|borderColor'),
    'Background role-match pattern must be in ui-base.md',
  );

  // Positive-match approach: catches tokens containing WRONG role names
  const pattern = /(?:background-color|background)\s*:.*var\(--shelf-[\w-]*(?:fgColor|borderColor)-/;

  // RED: catches semantic-tier role mismatch
  assert(
    'role-match bg RED: fgColor on background',
    pattern.test('background-color: var(--shelf-fgColor-muted);'),
    'Must catch fgColor used for background',
  );

  // RED: catches component-tier role mismatch (the bug that slipped to reviewer)
  assert(
    'role-match bg RED: component-tier fgColor on background',
    pattern.test('background-color: var(--shelf-chip-fgColor-default);'),
    'Must catch component-tier fgColor used for background',
  );

  assert(
    'role-match bg RED: borderColor on background',
    pattern.test('background: var(--shelf-borderColor-subtle);'),
    'Must catch borderColor used for background',
  );

  // GREEN: correct token role
  assert(
    'role-match bg GREEN: bgColor on background',
    !pattern.test('background-color: var(--shelf-bgColor-raised);'),
    'bgColor on background is valid',
  );

  assert(
    'role-match bg GREEN: component bgColor on background',
    !pattern.test('background-color: var(--shelf-chip-bgColor-selected);'),
    'Component-tier bgColor on background is valid',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// values-from-tokens — role-matching: text/fg must use fgColor tokens
// ═══════════════════════════════════════════════════════════════════════════

{
  const pattern = /(?:(?<![\w-])color|(?:caret|text-decoration)-color|fill)\s*:.*var\(--shelf-[\w-]*(?:bgColor|borderColor)-/;

  // RED: catches semantic-tier
  assert(
    'role-match fg RED: bgColor on color',
    pattern.test('color: var(--shelf-bgColor-default);'),
    'Must catch bgColor used for text color',
  );

  // RED: catches component-tier (the gap)
  assert(
    'role-match fg RED: component bgColor on color',
    pattern.test('color: var(--shelf-chip-bgColor-selected);'),
    'Must catch component-tier bgColor on text color',
  );

  // GREEN: correct usage
  assert(
    'role-match fg GREEN: fgColor on color',
    !pattern.test('color: var(--shelf-fgColor-default);'),
    'fgColor on color is valid',
  );

  assert(
    'role-match fg GREEN: component fgColor on color',
    !pattern.test('color: var(--shelf-chip-fgColor-on-accent);'),
    'Component-tier fgColor on color is valid',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// values-from-tokens — role-matching: border must use borderColor tokens
// ═══════════════════════════════════════════════════════════════════════════

{
  const pattern = /(?:border(?:-\w+)?-color|outline-color|column-rule-color|stroke)\s*:.*var\(--shelf-[\w-]*(?:bgColor|fgColor)-/;

  // RED: catches semantic-tier
  assert(
    'role-match border RED: bgColor on border-color',
    pattern.test('border-color: var(--shelf-bgColor-accent);'),
    'Must catch bgColor used for border-color',
  );

  // RED: catches component-tier (THE BUG from djk.1 fixer)
  assert(
    'role-match border RED: component bgColor on border-color',
    pattern.test('border-color: var(--shelf-chip-bgColor-selected-hover);'),
    'Must catch component-tier bgColor used for border-color',
  );

  assert(
    'role-match border RED: fgColor on outline-color',
    pattern.test('outline-color: var(--shelf-fgColor-muted);'),
    'Must catch fgColor used for outline-color',
  );

  // GREEN: correct usage
  assert(
    'role-match border GREEN: borderColor on border-color',
    !pattern.test('border-color: var(--shelf-borderColor-subtle);'),
    'borderColor on border-color is valid',
  );

  assert(
    'role-match border GREEN: component borderColor',
    !pattern.test('border-color: var(--shelf-chip-borderColor-selected-hover);'),
    'Component-tier borderColor on border-color is valid',
  );

  assert(
    'role-match border GREEN: transparent',
    !pattern.test('border-color: transparent;'),
    'transparent is valid for border-color',
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}

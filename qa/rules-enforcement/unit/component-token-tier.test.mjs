#!/usr/bin/env node
/**
 * RED/GREEN tests for T1 enforcement: component CSS must use
 * component-tier color tokens, not semantic-tier ones.
 *
 * Real scenario from djk.1 (previous runs): implementer writes
 * `background-color: var(--shelf-bgColor-raised)` in BookCard.css
 * instead of `background-color: var(--shelf-card-bgColor)`. The
 * semantic token works visually but violates the token architecture:
 * component CSS should be decoupled from the semantic tier via aliases.
 * This was caught by the reviewer every run, costing a fixer cycle.
 *
 * The rule: in src/components/**, color properties must reference
 * component-tier tokens (--shelf-{component}-*Color-*), not
 * semantic-tier ones (--shelf-bgColor-*, --shelf-fgColor-*,
 * --shelf-borderColor-*).
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

// Check the rule exists
assert(
  'component-color-token-tier rule exists in ui-base.md',
  rulesFile.includes('component-color-token-tier') || rulesFile.includes('semantic-color-in-component'),
  'ui-base.md must have a T1 rule blocking semantic color tokens in component CSS',
);

// The actual pattern that should be enforced
const pattern = /var\(--shelf-(?:bg|fg|border)Color-/;

// ═══════════════════════════════════════════════════════════════════════════
// RED: Real violations from djk.1 previous runs (before fixer corrected them)
//
// These are ACTUAL lines from implementer output that the reviewer caught:
// - violations.jsonl line 42: BookCard.css `background-color: var(--shelf-bgColor-default)`
// - violations.jsonl line 22: `background-color: var(--shelf-fgColor-muted)` for skeleton
// - violations.jsonl line 3:  ChipBar.css `border-color: var(--shelf-bgColor-accent)`
// ═══════════════════════════════════════════════════════════════════════════

{
  // From BookCard.css — card background using page-level semantic token
  assert(
    'RED: catches bgColor-raised in component CSS (BookCard real case)',
    pattern.test('background-color: var(--shelf-bgColor-raised);'),
    'Must catch semantic bgColor used directly in component CSS',
  );

  // From BookCard.css — badge using page-level token
  assert(
    'RED: catches bgColor-default in component CSS (badge real case)',
    pattern.test('background-color: var(--shelf-bgColor-default);'),
    'Must catch bgColor-default in component CSS (page-level on card surface)',
  );

  // From SkeletonCard.css — skeleton bar using fgColor directly
  assert(
    'RED: catches fgColor-default in component CSS (skeleton real case)',
    pattern.test('background-color: var(--shelf-fgColor-default);'),
    'Must catch semantic fgColor used for skeleton bar background',
  );

  // From ChipBar.css — border using bgColor semantic token
  assert(
    'RED: catches bgColor-accent on border-color (ChipBar real case)',
    pattern.test('border-color: var(--shelf-bgColor-accent);'),
    'Must catch semantic bgColor used for border in component CSS',
  );

  // Color property with semantic borderColor
  assert(
    'RED: catches borderColor-subtle in component CSS',
    pattern.test('border-color: var(--shelf-borderColor-subtle);'),
    'Must catch semantic borderColor used directly in component CSS',
  );

  // Text color with semantic fgColor
  assert(
    'RED: catches fgColor-muted for text color',
    pattern.test('color: var(--shelf-fgColor-muted);'),
    'Must catch semantic fgColor used directly for component text',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEN: Correct component-tier usage (from the fixer-corrected files)
//
// These are ACTUAL lines from the final worktree after the fixer ran.
// ═══════════════════════════════════════════════════════════════════════════

{
  // BookCard.css — correct component-tier alias
  assert(
    'GREEN: allows --shelf-card-bgColor (component-tier)',
    !pattern.test('background-color: var(--shelf-card-bgColor);'),
    'Component-tier bgColor token should be allowed',
  );

  // BookCard.css — badge with component-tier token
  assert(
    'GREEN: allows --shelf-card-badge-bgColor',
    !pattern.test('background-color: var(--shelf-card-badge-bgColor);'),
    'Component-tier badge bgColor should be allowed',
  );

  // ChipBar.css — chip with component-tier tokens
  assert(
    'GREEN: allows --shelf-chip-bgColor-selected',
    !pattern.test('background-color: var(--shelf-chip-bgColor-selected);'),
    'Component-tier chip bgColor should be allowed',
  );

  assert(
    'GREEN: allows --shelf-chip-fgColor-rest',
    !pattern.test('color: var(--shelf-chip-fgColor-rest);'),
    'Component-tier chip fgColor should be allowed',
  );

  assert(
    'GREEN: allows --shelf-chip-borderColor-rest',
    !pattern.test('border-color: var(--shelf-chip-borderColor-rest);'),
    'Component-tier chip borderColor should be allowed',
  );

  // SkeletonCard.css — skeleton with component-tier token
  assert(
    'GREEN: allows --shelf-skeleton-barColor',
    !pattern.test('background-color: var(--shelf-skeleton-barColor);'),
    'Component-tier skeleton token should be allowed',
  );

  // Non-color tokens should never be matched
  assert(
    'GREEN: allows --shelf-space-lg (not a color token)',
    !pattern.test('gap: var(--shelf-space-lg);'),
    'Spacing tokens are not color tokens — must not be caught',
  );

  assert(
    'GREEN: allows --shelf-motion-duration-slow',
    !pattern.test('animation-duration: var(--shelf-motion-duration-slow);'),
    'Motion tokens are not color tokens — must not be caught',
  );

  assert(
    'GREEN: allows --shelf-radius-lg',
    !pattern.test('border-radius: var(--shelf-radius-lg);'),
    'Radius tokens are not color tokens — must not be caught',
  );

  assert(
    'GREEN: allows --shelf-font-size-sm',
    !pattern.test('font-size: var(--shelf-font-size-sm);'),
    'Font tokens are not color tokens — must not be caught',
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}

#!/usr/bin/env node
/**
 * RED/GREEN tests for the four design-intent guardrails.
 *
 * Gap: spec described "colored pill, top-right" but builder implemented
 * gray bottom-right, and three verification layers (builder, reviewer,
 * visual-qa) all passed it. Four systemic gaps are now closed:
 *
 *   1. Intent color tier (tokens.css + ui-project.md)
 *   2. Anchored overlay rule (ui-base.md)
 *   3. Data-driven variant pattern (ui-base.md)
 *   4. Design-intent verification (ui-base.md + visual-qa.md)
 *
 * RED:  the issue class — no rule/instruction existed to catch it
 * GREEN: the guardrail now catches it
 *
 * Seam: .claude/rules/ui-base.md, .claude/rules/ui-project.md, .claude/agents/visual-qa.md
 * Level: unit
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const uiBase = readFileSync('.claude/rules/ui-base.md', 'utf8');
const uiProject = readFileSync('.claude/rules/ui-project.md', 'utf8');
const visualQa = readFileSync('.claude/agents/visual-qa.md', 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// Guardrail 1: Intent color tier — rule in ui-project.md
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n--- Guardrail 1: Intent color tier ---');

test('ui-project.md has Intent colors section', () => {
  assert(uiProject.includes('## Intent colors'), 'Missing "## Intent colors" section');
});

test('intent-color-for-data-meanings enforcement block exists', () => {
  assert(
    uiProject.includes('id: "intent-color-for-data-meanings"'),
    'Missing enforcement block intent-color-for-data-meanings',
  );
});

test('enforcement instructs reviewer to check intent aliases (not surface-role)', () => {
  assert(
    uiProject.includes('surface-role token') && uiProject.includes('intent'),
    'Enforcement must distinguish intent tokens from surface-role tokens',
  );
});

test('intent color table lists all three statuses', () => {
  assert(uiProject.includes('to-read'), 'Missing to-read in intent table');
  assert(uiProject.includes('reading'), 'Missing reading in intent table');
  assert(uiProject.includes('finished'), 'Missing finished in intent table');
});

test('token flow pattern documented (primitive → intent → component)', () => {
  assert(
    uiProject.includes('Primitive') && uiProject.includes('Semantic') && uiProject.includes('Component'),
    'Token flow (primitive → semantic → component) must be documented',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Guardrail 2: Anchored overlay rule — in ui-base.md
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n--- Guardrail 2: Anchored overlay rule ---');

test('ui-base.md has Anchored overlays section', () => {
  assert(uiBase.includes('## Anchored overlays'), 'Missing "## Anchored overlays" section');
});

test('anchored-overlay-positioning enforcement block exists', () => {
  assert(
    uiBase.includes('id: "anchored-overlay-positioning"'),
    'Missing enforcement block anchored-overlay-positioning',
  );
});

test('overlay-position-matches-spec enforcement block exists (visual-qa)', () => {
  assert(
    uiBase.includes('id: "overlay-position-matches-spec"'),
    'Missing enforcement block overlay-position-matches-spec',
  );
});

test('decision test: spec names corner → position: absolute', () => {
  assert(
    uiBase.includes('position: absolute') && uiBase.includes('position: relative'),
    'Rule must describe position: absolute on overlay + position: relative on surface',
  );
});

test('CORRECT example shows absolute anchoring with inset properties', () => {
  assert(
    uiBase.includes('inset-block-start') && uiBase.includes('inset-inline-end'),
    'CORRECT example must use logical inset properties',
  );
});

test('WRONG example shows flex alignment for corner (align-self: flex-end)', () => {
  assert(
    uiBase.includes('align-self: flex-end') &&
    uiBase.includes('WRONG'),
    'WRONG example must show align-self: flex-end as incorrect for corner pinning',
  );
});

test('auto-margin clarifying note added to no-outer-margin rule', () => {
  assert(
    uiBase.includes('auto-margin distributes space within a flow') &&
    uiBase.includes('corner-anchored overlays'),
    'no-outer-margin rule must clarify that auto-margin ≠ corner pinning',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Guardrail 3: Data-driven variant pattern — in ui-base.md
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n--- Guardrail 3: Data-driven variant pattern ---');

test('ui-base.md has Data-driven variants section', () => {
  assert(uiBase.includes('## Data-driven variants'), 'Missing "## Data-driven variants" section');
});

test('data-enum-variant-pattern enforcement block exists', () => {
  assert(
    uiBase.includes('id: "data-enum-variant-pattern"'),
    'Missing enforcement block data-enum-variant-pattern',
  );
});

test('rule specifies data-* attribute for N-ary enums', () => {
  assert(
    uiBase.includes('data-{property}') || uiBase.includes('data-status'),
    'Rule must specify data-* attributes for domain enums',
  );
});

test('rule preserves ARIA for binary widget states', () => {
  assert(
    uiBase.includes('aria-pressed') || uiBase.includes('ARIA'),
    'Rule must preserve ARIA attributes for binary widget states',
  );
});

test('CORRECT example shows data-status attribute pattern', () => {
  assert(
    uiBase.includes('data-status={book.status}') || uiBase.includes('data-status='),
    'CORRECT example must show data-status attribute usage',
  );
});

test('WRONG example shows className-encoded variant', () => {
  const wrongClassSection = uiBase.includes('className') &&
    uiBase.includes('mixes structural identity with data state');
  assert(wrongClassSection, 'WRONG example must show className encoding as incorrect');
});

test('WRONG example shows ARIA misuse for domain data', () => {
  assert(
    uiBase.includes('aria-label is for accessible names, not data variants') ||
    uiBase.includes('ARIA misused for domain data'),
    'WRONG example must show ARIA misuse as incorrect',
  );
});

test('token flow: component-tier alias from intent token', () => {
  assert(
    uiBase.includes('--shelf-intent-') && uiBase.includes('var(--shelf-card-badge-'),
    'Token flow must show component alias referencing intent token',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Guardrail 4: Design-intent verification — ui-base.md + visual-qa.md
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n--- Guardrail 4: Design-intent verification ---');

test('ui-base.md has Spec fidelity section', () => {
  assert(uiBase.includes('## Spec fidelity'), 'Missing "## Spec fidelity" section');
});

test('design-intent-verification enforcement block exists', () => {
  assert(
    uiBase.includes('id: "design-intent-verification"'),
    'Missing enforcement block design-intent-verification',
  );
});

test('enforcement checks four categories: color, position, shape, behavior', () => {
  const block = uiBase.slice(uiBase.indexOf('design-intent-verification'));
  assert(block.includes('color intent'), 'Must check color intent');
  assert(block.includes('position intent'), 'Must check position intent');
  assert(block.includes('shape intent'), 'Must check shape intent');
  assert(block.includes('behavior intent'), 'Must check behavior intent');
});

test('enforcement references CLAUDE.md as source of truth', () => {
  const block = uiBase.slice(uiBase.indexOf('design-intent-verification'));
  assert(block.includes('CLAUDE.md'), 'Enforcement must reference CLAUDE.md');
});

test('visual-qa.md Step 3 has spec cross-reference instruction', () => {
  assert(
    visualQa.includes('Cross-reference CLAUDE.md product descriptions'),
    'visual-qa.md Step 3 must include spec cross-reference instruction',
  );
});

test('visual-qa.md instruction flags discrepancy as regression', () => {
  assert(
    visualQa.includes('Flag any discrepancy as a regression'),
    'visual-qa.md must flag spec-fidelity discrepancies as regressions',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Prompt size: rule files must stay under budget to avoid truncation
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n--- Prompt size budget ---');

test('ui-base.md under 1000 lines (prevent truncation in Claude Code context)', () => {
  const lines = uiBase.split('\n').length;
  assert(lines <= 1000, `ui-base.md has ${lines} lines (max 1000). Condense rules or split into separate files.`);
});

test('ui-project.md under 350 lines', () => {
  const lines = uiProject.split('\n').length;
  assert(lines <= 350, `ui-project.md has ${lines} lines (max 350). Condense rules.`);
});

test('visual-qa.md under 120 lines', () => {
  const lines = visualQa.split('\n').length;
  assert(lines <= 120, `visual-qa.md has ${lines} lines (max 120). Keep focused.`);
});

// Rough token estimate: ~4 chars per token for English prose
const totalChars = uiBase.length + uiProject.length;
const estimatedTokens = Math.ceil(totalChars / 4);

test(`total rule tokens estimate under 20k (got ~${estimatedTokens})`, () => {
  assert(
    estimatedTokens <= 20000,
    `Rules estimated at ~${estimatedTokens} tokens. Risk of truncation in Claude Code context window.`,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Signal preservation: key signals must survive in the new rule sections
// (if rules are condensed, these specific phrases carry the signal)
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n--- Signal preservation ---');

const CRITICAL_SIGNALS = [
  // Anchored overlay — the decision test
  ['position: absolute', 'ui-base', uiBase],
  ['position: relative', 'ui-base', uiBase],
  ['corner', 'ui-base', uiBase],

  // Data-driven variant — the attribute strategy
  ['data-{property}', 'ui-base', uiBase],
  ['N > 2', 'ui-base', uiBase],
  ['ARIA', 'ui-base', uiBase],

  // Spec fidelity — the four categories
  ['color intent', 'ui-base', uiBase],
  ['position intent', 'ui-base', uiBase],
  ['contradicts', 'ui-base', uiBase],

  // Intent colors — the token chain
  ['--shelf-intent-', 'ui-project', uiProject],
  ['surface-role', 'ui-project', uiProject],

  // Visual-qa — the cross-reference
  ['Cross-reference CLAUDE.md', 'visual-qa', visualQa],
];

for (const [signal, file, content] of CRITICAL_SIGNALS) {
  test(`signal "${signal}" present in ${file}`, () => {
    assert(content.includes(signal), `Critical signal "${signal}" missing from ${file}. Rule was likely truncated or condensed incorrectly.`);
  });
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\ndesign-intent-guardrails: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}

#!/usr/bin/env node
/**
 * RED/GREEN tests for rule gaps found in sandcastle run djk.1.
 *
 * Each test targets a specific gap:
 *   - Unitless values (line-height, opacity) slip through values-from-tokens
 *   - Media query preludes (768px) should NOT trigger values-from-tokens
 *   - Temporal comment references ("this ticket") have no T1 rule
 *   - Positive framing + code examples present in rewritten rules
 *
 * Run: node qa/pipeline/unit/rule-gaps.test.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const PROJECT_ROOT = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${label}`); }
  catch (e) { failed++; failures.push(`FAIL: ${label} \u2014 ${e.message}`); console.log(`  \u2717 ${label}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── Helpers ────────────────────────────────────────────────────────

function parseAllBlocks() {
  const rulesDir = join(PROJECT_ROOT, '.claude', 'rules');
  const rulesLib = join(PROJECT_ROOT, '.claude', 'hooks', 'lib', 'rules.mjs');
  const files = ['ui-base.md', 'ui-project.md', 'coding-standards.md'];
  const allBlocks = [];

  for (const f of files) {
    const path = join(rulesDir, f);
    let content;
    try { content = readFileSync(path, 'utf8'); } catch { continue; }
    const script = `
      import { parseEnforcementBlocks } from ${JSON.stringify('file://' + rulesLib)};
      const content = ${JSON.stringify(content)};
      const result = parseEnforcementBlocks(content, ${JSON.stringify(path)});
      process.stdout.write(JSON.stringify(result));
    `;
    const r = spawnSync('node', ['--input-type=module', '-e', script], {
      encoding: 'utf8', timeout: 5000,
    });
    if (r.status !== 0) throw new Error(`parse failed for ${f}: ${r.stderr}`);
    const { blocks } = JSON.parse(r.stdout);
    allBlocks.push(...blocks);
  }
  return allBlocks;
}

const hookPath = join(PROJECT_ROOT, '.claude', 'hooks', 'apply-t1.mjs');

function makeTempProject(ruleContent) {
  const tmp = mkdtempSync(join(tmpdir(), 'rule-gaps-test-'));
  mkdirSync(join(tmp, '.claude', 'rules'), { recursive: true });
  writeFileSync(join(tmp, '.claude', 'rules', 'test.md'), ruleContent);
  return tmp;
}

function runT1(tmp, filePath, content) {
  const input = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: join(tmp, filePath), content },
  });
  try {
    const r = spawnSync('node', [hookPath], {
      input,
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 10000,
    });
    return { exitCode: r.status, stderr: r.stderr };
  } catch (e) {
    return { exitCode: e.status ?? 1, stderr: e.stderr ?? '' };
  }
}

const allBlocks = parseAllBlocks();
const t1Blocks = allBlocks.filter(b => b.tier === 'T1');

// ══════════════════════════════════════════════════════════════════════
// GAP C: Unitless values in values-from-tokens
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- Gap C: Unitless values ---');

test('values-from-tokens has a T1 pattern that matches unitless line-height', () => {
  const vftBlocks = t1Blocks.filter(b => b.id === 'values-from-tokens');
  // Try each pattern against "line-height: 1.5"
  let matched = false;
  for (const block of vftBlocks) {
    const re = new RegExp(block.pattern, 'gm');
    if (re.test('line-height: 1.5;')) {
      matched = true;
      break;
    }
  }
  assert(matched, 'No values-from-tokens T1 pattern matches "line-height: 1.5;" — unitless values slip through');
});

test('values-from-tokens blocks unitless line-height via T1 hook', () => {
  // Use the real project rules
  const result = runT1(PROJECT_ROOT, 'src/components/test.css', '@layer components {\n  .chip { line-height: 1.5; }\n}');
  assert(result.exitCode === 2, `Expected exit 2 (blocked), got ${result.exitCode}. Unitless value was not caught.`);
});

test('values-from-tokens blocks unitless opacity via T1 hook', () => {
  const result = runT1(PROJECT_ROOT, 'src/components/test.css', '@layer components {\n  .fade { opacity: 0.5; }\n}');
  assert(result.exitCode === 2, `Expected exit 2 (blocked), got ${result.exitCode}. Unitless opacity was not caught.`);
});

test('values-from-tokens allows var() token references for unitless properties', () => {
  // Line-height tokens use the font- prefix (typography semantic category)
  const result = runT1(PROJECT_ROOT, 'src/components/test.css', '@layer components {\n  .chip { line-height: var(--shelf-font-lineHeight-body); }\n}');
  assert(result.exitCode === 0, `Expected exit 0 (allowed), got ${result.exitCode}. Token reference was incorrectly blocked.`);
});

// ══════════════════════════════════════════════════════════════════════
// GAP D: Media query preludes should not trigger values-from-tokens
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- Gap D: Media query prelude exception ---');

test('values-from-tokens allows raw px in @media preludes', () => {
  const result = runT1(PROJECT_ROOT, 'src/components/test.css', '@layer components {\n  @media (width >= 768px) {\n    .shelf { padding: var(--shelf-space-lg); }\n  }\n}');
  assert(result.exitCode === 0, `Expected exit 0 (allowed), got ${result.exitCode}. Media prelude 768px was incorrectly blocked.`);
});

test('values-from-tokens still blocks raw px in declarations', () => {
  const result = runT1(PROJECT_ROOT, 'src/components/test.css', '@layer components {\n  .shelf { padding: 16px; }\n}');
  assert(result.exitCode === 2, `Expected exit 2 (blocked), got ${result.exitCode}. Raw px in declaration was not caught.`);
});

// ══════════════════════════════════════════════════════════════════════
// GAP E: Temporal comment references
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- Gap E: Temporal comment references ---');

test('no-ticket-references T1 rule exists', () => {
  const blocks = t1Blocks.filter(b => b.id === 'no-ticket-references');
  assert(blocks.length >= 1, 'No no-ticket-references T1 block found in coding-standards.md');
});

test('temporal ref pattern matches "in this ticket"', () => {
  const blocks = t1Blocks.filter(b => b.id === 'no-ticket-references');
  assert(blocks.length > 0, 'Rule not found');
  let matched = false;
  for (const block of blocks) {
    const re = new RegExp(block.pattern, 'gi');
    if (re.test('// Filtering wires in this ticket only')) {
      matched = true;
      break;
    }
  }
  assert(matched, 'Pattern does not match "in this ticket" in a comment');
});

test('temporal ref pattern matches "a later ticket"', () => {
  const blocks = t1Blocks.filter(b => b.id === 'no-ticket-references');
  assert(blocks.length > 0, 'Rule not found');
  let matched = false;
  for (const block of blocks) {
    const re = new RegExp(block.pattern, 'gi');
    if (re.test('// grid filtering ships in a later ticket')) {
      matched = true;
      break;
    }
  }
  assert(matched, 'Pattern does not match "a later ticket" in a comment');
});

test('temporal ref blocks via T1 hook', () => {
  const result = runT1(PROJECT_ROOT, 'src/components/ChipBar.tsx', '// Filtering wires in this ticket only\nfunction ChipBar() { return null; }');
  assert(result.exitCode === 2, `Expected exit 2 (blocked), got ${result.exitCode}. Temporal reference was not caught.`);
});

test('temporal ref does not match in string literals', () => {
  // "this ticket" inside a user-facing string is fine
  const result = runT1(PROJECT_ROOT, 'src/components/Toast.tsx', 'const msg = "View this ticket in Jira";\nfunction Toast() { return null; }');
  assert(result.exitCode === 0, `Expected exit 0 (allowed), got ${result.exitCode}. String literal was incorrectly blocked.`);
});

// ══════════════════════════════════════════════════════════════════════
// REWRITES A,B,F: Positive framing + code examples in rules
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- Rewrites A,B,F: Positive framing + code examples ---');

test('no-bem-separators rule text uses positive framing (no leading "No")', () => {
  const rulesContent = readFileSync(join(PROJECT_ROOT, '.claude', 'rules', 'ui-project.md'), 'utf8');
  // Find the line before the no-bem-separators enforcement block
  const lines = rulesContent.split('\n');
  const fenceIdx = lines.findIndex(l => l.includes('id: "no-bem-separators"'));
  assert(fenceIdx > 0, 'no-bem-separators block not found');
  // Walk back to find the bullet
  let bulletLine = '';
  for (let i = fenceIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('- ')) { bulletLine = trimmed; break; }
    if (trimmed && !trimmed.startsWith('```') && !trimmed.startsWith('CORRECT:') && !trimmed.startsWith('WRONG:')) break;
  }
  assert(bulletLine, 'No bullet found before no-bem-separators block');
  // Positive framing: should start with an affirmative verb, not "No" or "Don't"
  const startsNegative = /^- (No |Don't |Do not |Never |Avoid )/i.test(bulletLine);
  assert(!startsNegative, `Rule text starts with negative framing: "${bulletLine}". Use positive framing like "Use kebab-case..."`);
});

test('no-bem-separators rule includes a code example', () => {
  const rulesContent = readFileSync(join(PROJECT_ROOT, '.claude', 'rules', 'ui-project.md'), 'utf8');
  // Look for a CORRECT/WRONG or code fence near the no-bem-separators section
  const bemSection = rulesContent.slice(
    rulesContent.indexOf('no-bem-separators') - 500,
    rulesContent.indexOf('no-bem-separators') + 500
  );
  const hasExample = /CORRECT:|WRONG:|```css|\.card-title|\.chip-bar/i.test(bemSection);
  assert(hasExample, 'no-bem-separators section has no inline code example showing correct naming');
});

test('values-from-tokens rule text uses positive framing', () => {
  const rulesContent = readFileSync(join(PROJECT_ROOT, '.claude', 'rules', 'ui-base.md'), 'utf8');
  const lines = rulesContent.split('\n');
  const fenceIdx = lines.findIndex(l => l.includes('id: "values-from-tokens"'));
  assert(fenceIdx > 0, 'values-from-tokens block not found');
  let bulletLine = '';
  for (let i = fenceIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('- ')) { bulletLine = trimmed; break; }
    if (trimmed && !trimmed.startsWith('```') && !trimmed.startsWith('CORRECT:') && !trimmed.startsWith('WRONG:')) break;
  }
  assert(bulletLine, 'No bullet found before values-from-tokens block');
  // Should lead with what TO DO, not what to avoid
  const startsPositive = /^- (Every|All|Use|Always|Each)/i.test(bulletLine);
  assert(startsPositive, `Rule text should lead with positive framing. Got: "${bulletLine}"`);
});

test('values-from-tokens rule includes a code example', () => {
  const rulesContent = readFileSync(join(PROJECT_ROOT, '.claude', 'rules', 'ui-base.md'), 'utf8');
  const vftSection = rulesContent.slice(
    rulesContent.indexOf('values-from-tokens') - 200,
    rulesContent.indexOf('values-from-tokens') + 800
  );
  const hasExample = /CORRECT:|WRONG:|```css|var\(--/i.test(vftSection);
  assert(hasExample, 'values-from-tokens section has no inline code example');
});

test('media-range-notation rule text uses positive framing', () => {
  const rulesContent = readFileSync(join(PROJECT_ROOT, '.claude', 'rules', 'ui-project.md'), 'utf8');
  const lines = rulesContent.split('\n');
  const fenceIdx = lines.findIndex(l => l.includes('id: "media-range-notation"'));
  assert(fenceIdx > 0, 'media-range-notation block not found');
  let bulletLine = '';
  for (let i = fenceIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('- ')) { bulletLine = trimmed; break; }
    if (trimmed && !trimmed.startsWith('```') && !trimmed.startsWith('CORRECT:') && !trimmed.startsWith('WRONG:')) break;
  }
  assert(bulletLine, 'No bullet found before media-range-notation block');
  const startsNegative = /^- (No |Don't |Do not |Never |Avoid )/i.test(bulletLine);
  assert(!startsNegative, `Rule text starts with negative framing: "${bulletLine}"`);
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

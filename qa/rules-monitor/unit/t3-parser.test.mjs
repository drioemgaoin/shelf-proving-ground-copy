#!/usr/bin/env node
/**
 * Unit tests for scripts/monitor/t3-parser.mjs
 */
import { parseT3Output } from '../../../scripts/monitor/t3-parser.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`FAIL: ${label} — ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ═══════════════════════════════════════════════════════════════════

test('parses valid structured output block', () => {
  const text = `
Some agent reasoning text here...

<!-- MONITOR_REPORT_START -->
{
  "evaluations": [
    { "ruleId": "values-from-tokens", "outcome": "violation_found", "file": "src/App.css", "details": { "line": 36 } }
  ]
}
<!-- MONITOR_REPORT_END -->

More text after.
`;
  const results = parseT3Output(text, 'reviewer');
  assert(results.length === 1, `Expected 1, got ${results.length}`);
  assert(results[0].ruleId === 'values-from-tokens', `Expected values-from-tokens, got ${results[0].ruleId}`);
  assert(results[0].outcome === 'violation_found', `Expected violation_found`);
  assert(results[0].file === 'src/App.css', `Expected src/App.css`);
  assert(results[0].agent === 'reviewer', `Expected reviewer agent`);
});

test('returns empty array when no markers found', () => {
  const results = parseT3Output('Just some text with no markers.', 'visual-qa');
  assert(results.length === 0, `Expected 0, got ${results.length}`);
});

test('handles multiple evaluations', () => {
  const text = `
<!-- MONITOR_REPORT_START -->
{
  "evaluations": [
    { "ruleId": "a", "outcome": "passed", "details": {} },
    { "ruleId": "b", "outcome": "violation_found", "file": "x.css", "details": { "desc": "bad" } },
    { "ruleId": "c", "outcome": "passed", "details": {} }
  ]
}
<!-- MONITOR_REPORT_END -->
`;
  const results = parseT3Output(text, 'visual-qa');
  assert(results.length === 3, `Expected 3, got ${results.length}`);
  assert(results[1].ruleId === 'b', 'Expected ruleId=b at index 1');
  assert(results.every(r => r.agent === 'visual-qa'), 'All should have visual-qa agent');
});

test('malformed JSON inside markers returns empty array', () => {
  const text = `
<!-- MONITOR_REPORT_START -->
{ not valid json }
<!-- MONITOR_REPORT_END -->
`;
  const results = parseT3Output(text, 'reviewer');
  assert(results.length === 0, `Expected 0 on malformed JSON, got ${results.length}`);
});

test('ignores text outside markers', () => {
  const text = `
{"evaluations": [{"ruleId": "outside", "outcome": "blocked"}]}
<!-- MONITOR_REPORT_START -->
{ "evaluations": [{ "ruleId": "inside", "outcome": "passed", "details": {} }] }
<!-- MONITOR_REPORT_END -->
{"evaluations": [{"ruleId": "also-outside", "outcome": "blocked"}]}
`;
  const results = parseT3Output(text, 'reviewer');
  assert(results.length === 1, `Expected 1 (only inside markers), got ${results.length}`);
  assert(results[0].ruleId === 'inside', `Expected ruleId=inside, got ${results[0].ruleId}`);
});

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`T3 parser tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

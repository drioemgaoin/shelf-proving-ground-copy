#!/usr/bin/env node
/**
 * Unit tests for scripts/monitor/report.mjs
 */
import { formatCliReport, generateHtmlReport } from '../../../scripts/monitor/report.mjs';

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

function sampleMetrics() {
  return [
    { ruleId: 'values-from-tokens', tier: 'T1', triggerCount: 50, blockCount: 30, blockRate: 0.6, fixCount: 25, fixRate: 0.833 },
    { ruleId: 'no-axe-violations', tier: 'T2', triggerCount: 10, blockCount: 2, blockRate: 0.2, fixCount: 2, fixRate: 1.0 },
    { ruleId: 'never-triggered', tier: 'T3', triggerCount: 0, blockCount: 0, blockRate: 0, fixCount: 0, fixRate: 0 },
  ];
}

function sampleSummary() {
  return { totalSessions: 5, totalEvents: 60, avgEventsPerSession: 12 };
}

// ═══════════════════════════════════════════════════════════════════
// CLI Report
// ═══════════════════════════════════════════════════════════════════

test('CLI report renders rule table from fixture data', () => {
  const output = formatCliReport(sampleMetrics(), [], sampleSummary());
  assert(output.includes('values-from-tokens'), 'Should include rule ID');
  assert(output.includes('T1'), 'Should include tier');
  assert(output.includes('50'), 'Should include trigger count');
  assert(output.includes('30'), 'Should include block count');
});

test('CLI report shows no-data message when no events', () => {
  const output = formatCliReport([], [], { totalSessions: 0, totalEvents: 0, avgEventsPerSession: 0 });
  assert(output.includes('No monitoring data'), 'Should show no-data message');
});

test('CLI report color-codes verdicts', () => {
  const output = formatCliReport(sampleMetrics(), ['never-triggered'], sampleSummary());
  // ANSI green for effective rules (fix rate > 70%)
  assert(output.includes('\x1b[32m'), 'Should include green ANSI for effective rules');
  // ANSI red for unused
  assert(output.includes('\x1b[31m'), 'Should include red ANSI for unused rules');
});

// ═══════════════════════════════════════════════════════════════════
// HTML Report
// ═══════════════════════════════════════════════════════════════════

test('HTML report generates valid HTML from fixture data', () => {
  const html = generateHtmlReport(sampleMetrics(), ['never-triggered'], sampleSummary(), []);
  assert(html.startsWith('<!DOCTYPE html>'), 'Should start with doctype');
  assert(html.includes('</html>'), 'Should end with closing html tag');
  assert(html.includes('values-from-tokens'), 'Should include rule data');
});

test('HTML report contains expected rule rows', () => {
  const html = generateHtmlReport(sampleMetrics(), [], sampleSummary(), []);
  assert(html.includes('values-from-tokens'), 'Should have rule row');
  assert(html.includes('no-axe-violations'), 'Should have rule row');
  assert(html.includes('never-triggered'), 'Should have rule row');
});

test('HTML report is self-contained (no external refs)', () => {
  const html = generateHtmlReport(sampleMetrics(), [], sampleSummary(), []);
  assert(!html.includes('href="http'), 'Should not have external stylesheet links');
  assert(!html.includes('src="http'), 'Should not have external script sources');
  assert(html.includes('<style>'), 'Should have inline styles');
});

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`Report tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

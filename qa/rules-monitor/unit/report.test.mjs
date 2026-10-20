#!/usr/bin/env node
/**
 * Unit tests for scripts/monitor/report.mjs
 */
import { formatCliReport, generateHtmlReport, VIEWS } from '../../../scripts/monitor/report.mjs';

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
    { ruleId: 'values-from-tokens', tier: 'T1', triggerCount: 50, blockCount: 30, blockRate: 0.6, fixCount: 25, fixRate: 0.833, byAgent: { implementer: { triggers: 30, blocks: 20, fixes: 18 }, 'visual-qa': { triggers: 20, blocks: 10, fixes: 7 } } },
    { ruleId: 'no-axe-violations', tier: 'T2', triggerCount: 10, blockCount: 2, blockRate: 0.2, fixCount: 2, fixRate: 1.0, byAgent: { 'visual-qa': { triggers: 10, blocks: 2, fixes: 2 } } },
    { ruleId: 'never-triggered', tier: 'T3', triggerCount: 0, blockCount: 0, blockRate: 0, fixCount: 0, fixRate: 0, byAgent: {} },
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

test('CLI report "all" view shows agent breakdown column', () => {
  const output = formatCliReport(sampleMetrics(), [], sampleSummary(), 'all');
  assert(output.includes('impl:30'), 'Should include implementer count');
  assert(output.includes('vqa:'), 'Should include visual-qa abbreviation');
  assert(output.includes('[view: All Agents]'), 'Should show All Agents label');
});

test('CLI report filtered view shows view label', () => {
  const output = formatCliReport(sampleMetrics(), [], sampleSummary(), 'visual-qa');
  assert(output.includes('[view: visual-qa]'), 'Should show visual-qa view label');
  assert(!output.includes('impl:'), 'Should not show agent column in filtered view');
});

test('VIEWS exports valid view names', () => {
  assert(VIEWS.includes('all'), 'Should include all');
  assert(VIEWS.includes('implementer'), 'Should include implementer');
  assert(VIEWS.includes('visual-qa'), 'Should include visual-qa');
  assert(VIEWS.includes('reviewer'), 'Should include reviewer');
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

test('HTML report renders view tabs when perAgentData provided', () => {
  const perAgent = {
    implementer: { metrics: [sampleMetrics()[0]], unusedRules: [], summary: { totalSessions: 3, totalEvents: 30, avgEventsPerSession: 10 } },
    'visual-qa': { metrics: [sampleMetrics()[1]], unusedRules: [], summary: { totalSessions: 2, totalEvents: 10, avgEventsPerSession: 5 } },
  };
  const html = generateHtmlReport(sampleMetrics(), [], sampleSummary(), [], perAgent);
  assert(html.includes('tab-btn'), 'Should include tab buttons');
  assert(html.includes('All Agents'), 'Should have All Agents tab');
  assert(html.includes('implementer'), 'Should have implementer tab');
  assert(html.includes('visual-qa'), 'Should have visual-qa tab');
  assert(html.includes('VIEW_DATA'), 'Should embed view data JSON');
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

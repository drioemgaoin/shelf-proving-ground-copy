#!/usr/bin/env node
// npm run ui:qa
// Runs the e2e suite, creates baselines that don't exist yet, and prints a
// compact summary sized for an agent's context. Writes .ui-qa/report.json,
// which the Stop hook reads. Agents must never write that file themselves.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fingerprint, repoRoot, resolveBase, sh } from './fingerprint.mjs';

const root = repoRoot();
process.chdir(root);
mkdirSync('.ui-qa', { recursive: true });

const JSON_OUT = '.ui-qa/playwright.json';
const MAX_LISTED = 20;
const base = resolveBase();

// Check if any spec files exist under tests/. Playwright errors when there are none.
function hasSpecs(dir) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (entry.isFile() && /\.(spec|test)\.[jt]sx?$/.test(entry.name)) return true;
    }
  } catch { /* dir missing is fine */ }
  return false;
}

if (!hasSpecs(join(root, 'tests'))) {
  const report = {
    version: 1,
    base,
    fingerprint: fingerprint(base),
    status: 'PASS',
    counts: { passed: 0, failed: 0, flaky: 0, newBaselines: 0 },
    failures: [],
    flaky: [],
    newBaselines: [],
    topErrors: [],
    ranAt: new Date().toISOString(),
  };
  writeFileSync('.ui-qa/report.json', JSON.stringify(report, null, 2));
  console.log('UI QA: PASS  passed=0 failed=0 flaky=0 new-baselines=0 (no specs found)');
  process.exit(0);
}

const untrackedScreens = () =>
  sh('git ls-files -o --exclude-standard').split('\n').filter((f) => f.includes('__screenshots__/'));
const before = new Set(untrackedScreens());

const run = spawnSync(
  'npx',
  ['playwright', 'test', '--reporter=json', '--update-snapshots=missing', ...process.argv.slice(2)],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: JSON_OUT },
    maxBuffer: 512 * 1024 * 1024,
  },
);

const rel = (p) => (p ? relative(root, p) : p);
const firstLine = (s = '') =>
  // oxlint-disable-next-line no-control-regex -- strip ANSI colors
  s.replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 200) ?? '';

function writeReport(report) {
  writeFileSync('.ui-qa/report.json', JSON.stringify(report, null, 2));
}

if (!existsSync(JSON_OUT)) {
  const err = (run.stderr || 'Playwright produced no report').split('\n').slice(0, 20).join('\n');
  writeReport({ version: 1, base, fingerprint: fingerprint(base), status: 'ERROR', error: err, ranAt: new Date().toISOString() });
  console.log(`UI QA: ERROR\n${err}`);
  process.exit(1);
}

const pw = JSON.parse(readFileSync(JSON_OUT, 'utf8'));
const failures = [];
const flaky = [];
const missingBaseline = [];
let passed = 0;

function walk(suite, trail) {
  const t = suite.title ? [...trail, suite.title] : trail;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const name = [...t.slice(1), spec.title].join(' > ');
      const last = test.results?.[test.results.length - 1] ?? {};
      const entry = {
        test: name,
        file: spec.file,
        viewport: test.projectName,
        error: firstLine(last.error?.message ?? last.errors?.[0]?.message),
        images: (last.attachments ?? [])
          .filter((a) => a.path && a.contentType === 'image/png')
          .map((a) => rel(a.path)),
      };
      const hadMissing = (test.results ?? []).some((r) =>
        /snapshot doesn't exist/i.test(r.error?.message ?? r.errors?.[0]?.message ?? ''),
      );
      if (test.status === 'expected') passed++;
      else if (test.status === 'flaky' && hadMissing) {
        // First attempt wrote the missing baseline, retry passed against it.
        passed++;
        missingBaseline.push(entry);
      } else if (test.status === 'flaky') flaky.push(entry);
      else if (test.status === 'unexpected') {
        if (/snapshot doesn't exist/i.test(entry.error)) missingBaseline.push(entry);
        else failures.push(entry);
      }
    }
  }
  for (const child of suite.suites ?? []) walk(child, t);
}
for (const s of pw.suites ?? []) walk(s, []);

const topErrors = (pw.errors ?? []).map((e) => firstLine(e.message));
const newBaselines = untrackedScreens().filter((f) => !before.has(f));
const status = topErrors.length ? 'ERROR' : failures.length ? 'FAIL' : 'PASS';

writeReport({
  version: 1,
  base,
  fingerprint: fingerprint(base), // computed after new baselines are written
  status,
  counts: { passed, failed: failures.length, flaky: flaky.length, newBaselines: newBaselines.length },
  failures,
  flaky,
  newBaselines,
  topErrors,
  ranAt: new Date().toISOString(),
});

// Compact summary for the agent.
const lines = [`UI QA: ${status}  passed=${passed} failed=${failures.length} flaky=${flaky.length} new-baselines=${newBaselines.length}`];
for (const e of topErrors) lines.push(`ERROR: ${e}`);
for (const f of failures.slice(0, MAX_LISTED)) {
  lines.push(`\nFAIL [${f.viewport}] ${f.test}`, `  ${f.file}`, `  ${f.error}`);
  for (const img of f.images) lines.push(`  image: ${img}`);
}
if (failures.length > MAX_LISTED) lines.push(`\n...and ${failures.length - MAX_LISTED} more (see .ui-qa/report.json)`);
for (const f of flaky) lines.push(`FLAKY [${f.viewport}] ${f.test}`);
if (newBaselines.length) {
  lines.push('\nNew baselines (need human approval):');
  for (const b of newBaselines) lines.push(`  ${b}`);
}
console.log(lines.join('\n'));
process.exit(status === 'PASS' ? 0 : 1);

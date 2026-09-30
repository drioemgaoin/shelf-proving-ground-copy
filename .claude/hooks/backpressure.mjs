#!/usr/bin/env node
// Stop hook. Runs only when UI_GUARD=afk (the night shift).
// Exit 2 blocks the agent from stopping and feeds stderr back to it.
//
// Two modes:
//   --baseline    Snapshot current check output before the agent starts.
//                 Called from onSandboxReady. No stdin required.
//   (default)     Stop gate. Blocks on NEW failures not in the baseline.
//
// Order (stop gate), cheapest first:
//   1. Locked files untouched (git is the referee)
//   2. Project checks — only regressions vs baseline (not pre-existing failures)
//   3. If UI files changed: a QA report exists, matches this exact change, and passed
//
// After UI_GUARD_MAX_BLOCKS blocks in one session, it tells the agent to escalate
// to a human and then lets it stop, so the loop never spins forever.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.env.UI_GUARD !== 'afk') process.exit(0);

// Configure per repo. Single source of truth for which checks to run.
const CHECKS = (process.env.UI_CHECK_CMDS ?? 'npm run typecheck;;npm run lint;;npm test').split(';;').map((s) => s.trim()).filter(Boolean);
const BASELINE_DIR = join(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), '.sandcastle/.baseline');

function checkSlug(cmd) {
  return cmd.replace(/[^a-z0-9]/g, '-');
}

// ---------------------------------------------------------------------------
// Baseline mode: snapshot check output at the current state (before agent).
// Called once from onSandboxReady. Reads UI_CHECK_CMDS — same list the stop
// gate uses. Adding a check to the env var covers both modes automatically.
// ---------------------------------------------------------------------------
if (process.argv.includes('--baseline')) {
  mkdirSync(BASELINE_DIR, { recursive: true });
  for (const cmd of CHECKS) {
    const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').sort().join('\n');
    writeFileSync(join(BASELINE_DIR, `${checkSlug(cmd)}.txt`), out);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Stop-gate mode (default): block only on regressions vs baseline.
// ---------------------------------------------------------------------------
const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const { changedWithStatus, fingerprint, repoRoot, resolveBase } = await import(
  join(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), 'scripts/ui-qa/fingerprint.mjs')
);
process.chdir(repoRoot());

const UI_PATHS = new RegExp(process.env.UI_PATHS ?? '^(src/|index\\.html$|public/)');
const MAX_BLOCKS = Number(process.env.UI_GUARD_MAX_BLOCKS ?? 5);
const TAIL = 40; // lines of output fed back, to protect the agent's context

const counterFile = join(tmpdir(), `ui-backpressure-${input.session_id ?? 'default'}.json`);
const blocks = existsSync(counterFile) ? JSON.parse(readFileSync(counterFile, 'utf8')).blocks : 0;
if (blocks > MAX_BLOCKS) process.exit(0); // escalation already requested; let it stop

function block(reason) {
  const n = blocks + 1;
  writeFileSync(counterFile, JSON.stringify({ blocks: n }));
  if (n >= MAX_BLOCKS) {
    writeFileSync(counterFile, JSON.stringify({ blocks: MAX_BLOCKS + 1 }));
    process.stderr.write(
      `Backpressure limit reached (${MAX_BLOCKS} blocks). Stop trying to fix this.\n` +
        'Comment on the ticket with the failure below, apply the ready-for-human label, do not commit broken work, then stop.\n\n' +
        reason,
    );
  } else {
    process.stderr.write(`Not done yet (attempt ${n}/${MAX_BLOCKS}).\n\n${reason}`);
  }
  process.exit(2);
}

const report = existsSync('.ui-qa/report.json') ? JSON.parse(readFileSync('.ui-qa/report.json', 'utf8')) : null;
const base = report?.base ?? resolveBase();
const changes = changedWithStatus(base);

// 1. Locked files.
const violations = changes.filter(({ status, path }) => {
  if (/__screenshots__\//.test(path)) return status !== 'A'; // new baselines ok, edits/deletes not
  return /^(e2e\/acceptance\/|e2e\/support\/|playwright\.config\.|scripts\/ui-qa\/|\.claude\/)/.test(path);
});
if (violations.length) {
  block(
    'Locked files were changed. Restore them to their state at the base commit:\n' +
      violations.map((v) => `  ${v.status} ${v.path}`).join('\n') +
      '\nIf a check is wrong, comment on the ticket and apply ready-for-human instead of editing it.\n',
  );
}

// 2. Project checks — block only on regressions (new errors not in baseline).
for (const cmd of CHECKS) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    const currentLines = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').sort();
    const baselineFile = join(BASELINE_DIR, `${checkSlug(cmd)}.txt`);
    if (existsSync(baselineFile)) {
      const baselineLines = new Set(readFileSync(baselineFile, 'utf8').trim().split('\n'));
      const newErrors = currentLines.filter((l) => l.trim() && !baselineLines.has(l));
      if (newErrors.length === 0) continue; // all errors are pre-existing — not the agent's fault
      const out = newErrors.slice(-TAIL).join('\n');
      block(`\`${cmd}\` has new failures (not in the baseline):\n${out}\n`);
    } else {
      // No baseline — fall back to strict pass/fail.
      const out = currentLines.slice(-TAIL).join('\n');
      block(`\`${cmd}\` failed. Last ${TAIL} lines:\n${out}\n`);
    }
  }
}

// 3. UI changes need a matching, passing QA report.
const uiChanged = changes.some(({ path }) => UI_PATHS.test(path));
if (uiChanged) {
  if (!report) block('UI files changed but no QA report exists. Delegate to the visual-qa subagent before finishing.\n');
  if (report.fingerprint !== fingerprint(base)) {
    block('Code changed after the last QA run. Delegate to the visual-qa subagent again before finishing.\n');
  }
  if (report.status !== 'PASS') {
    const summary = (report.failures ?? []).slice(0, 10).map((f) => `  [${f.viewport}] ${f.test}: ${f.error}`).join('\n');
    block(`Visual QA status is ${report.status}. Fix these, then run visual-qa again:\n${summary || report.error || ''}\n`);
  }
}

rmSync(counterFile, { force: true }); // all green: reset the attempt counter
process.exit(0);

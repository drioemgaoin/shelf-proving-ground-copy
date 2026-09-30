#!/usr/bin/env node
// Stop hook. Runs only when UI_GUARD=afk (the night shift).
// Exit 2 blocks the agent from stopping and feeds stderr back to it.
//
// Order, cheapest first:
//   1. Locked files untouched (git is the referee)
//   2. Project checks (type check, lint, unit tests)
//   3. If UI files changed: a QA report exists, matches this exact change, and passed
//
// After UI_GUARD_MAX_BLOCKS blocks in one session, it tells the agent to escalate
// to a human and then lets it stop, so the loop never spins forever.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.env.UI_GUARD !== 'afk') process.exit(0);

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const { changedWithStatus, fingerprint, repoRoot, resolveBase } = await import(
  join(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), 'scripts/ui-qa/fingerprint.mjs')
);
process.chdir(repoRoot());

// Configure per repo.
const CHECKS = (process.env.UI_CHECK_CMDS ?? 'npm run typecheck;;npm run lint;;npm test').split(';;').map((s) => s.trim()).filter(Boolean);
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

// 2. Project checks.
for (const cmd of CHECKS) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-TAIL).join('\n');
    block(`\`${cmd}\` failed. Last ${TAIL} lines:\n${out}\n`);
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

// Shared by run.mjs and the Stop hook.
// A fingerprint identifies "this exact set of changes vs base", so the Stop hook
// can tell whether the QA report on disk describes the code being finished.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';

const EXCLUDE = ['.ui-qa/', 'test-results/', 'playwright-report/', 'blob-report/'];

export function sh(cmd) {
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 256 * 1024 * 1024,
  }).trim();
}

export function repoRoot() {
  return sh('git rev-parse --show-toplevel');
}

// Base = where this piece of work started. Set UI_GUARD_BASE for AFK runs
// (for example the branch Sandcastle forked from). Falls back to origin/main, then main.
export function resolveBase() {
  const candidates = [process.env.UI_GUARD_BASE, 'origin/main', 'main'].filter(Boolean);
  for (const c of candidates) {
    try {
      return sh(`git merge-base HEAD ${c}`);
    } catch {
      /* try next */
    }
  }
  return sh('git rev-parse HEAD');
}

// Files changed vs base: committed + uncommitted + untracked.
export function changedFiles(base) {
  const tracked = sh(`git diff --name-only ${base}`).split('\n');
  const untracked = sh('git ls-files -o --exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked])]
    .filter((f) => f && !EXCLUDE.some((e) => f.startsWith(e)))
    .sort();
}

// Name + status vs base. Untracked files count as "A" (added).
export function changedWithStatus(base) {
  const out = [];
  for (const line of sh(`git diff --name-status ${base}`).split('\n')) {
    if (!line) continue;
    const [status, ...paths] = line.split('\t');
    out.push({ status: status[0], path: paths[paths.length - 1] });
  }
  for (const f of sh('git ls-files -o --exclude-standard').split('\n')) {
    if (f) out.push({ status: 'A', path: f });
  }
  return out.filter((c) => !EXCLUDE.some((e) => c.path.startsWith(e)));
}

// Content-based, so committing after QA does not change it.
export function fingerprint(base) {
  const h = createHash('sha256');
  h.update(base);
  for (const f of changedFiles(base)) {
    h.update(`\0${f}\0`);
    if (existsSync(f) && statSync(f).isFile()) h.update(readFileSync(f));
    else h.update('<deleted>');
  }
  return h.digest('hex').slice(0, 16);
}

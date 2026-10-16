#!/usr/bin/env node
/**
 * Morning review: aggregates all pending items needing human attention
 * after a pipeline run. One command, one report, no hunting.
 *
 * Exit 0 = nothing needs review; exit 1 = items pending.
 */
import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const projectDir = process.cwd();
const sections = [];
let hasPending = false;

function section(title, items) {
  if (items.length === 0) return;
  hasPending = true;
  sections.push({ title, items });
}

// ─── 1. Escalated tickets ────────────────────────────────────────

function collectEscalatedTickets() {
  const items = [];
  try {
    const raw = execFileSync('bd', [
      'list',
      '--label-pattern', 'escalation:*',
      '--status', 'open,in_progress,blocked',
      '--json',
      '--quiet',
    ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

    const issues = JSON.parse(raw);
    for (const issue of issues) {
      const labels = issue.labels ?? [];
      const escalationLabel = labels.find((l) => l.startsWith('escalation:'));
      const escalationType = escalationLabel
        ? escalationLabel.replace('escalation:', '')
        : 'unknown';
      items.push(`${issue.id}: ${issue.title} [${escalationType}]`);
    }
  } catch {
    // bd not available or no results — skip silently
  }
  return items;
}

// ─── 2. Human-tier checklist ─────────────────────────────────────

function collectHumanTierRules() {
  const items = [];
  try {
    const auditScript = join(projectDir, 'scripts', 'audit-rules.mjs');
    if (!existsSync(auditScript)) return items;

    let stdout;
    try {
      stdout = execFileSync('node', [auditScript], {
        encoding: 'utf8',
        cwd: projectDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      // audit:rules exits 1 on errors — still read stdout
      stdout = e.stdout ?? '';
    }

    // Extract Human-tier lines: warnings about "created" entries (not yet reviewed)
    // and errors about missing log entries
    for (const line of stdout.split('\n')) {
      if (/Human-tier rule/.test(line) || /Human block/.test(line)) {
        // Clean up the prefix
        const cleaned = line.replace(/^\s*(ERROR|WARN)\s+/, '').trim();
        if (cleaned) items.push(cleaned);
      }
    }
  } catch {
    // audit-rules not available — skip
  }
  return items;
}

// ─── 3. Per-finding conflicts (T1/T3) ───────────────────────────

function collectT1Conflicts() {
  const items = [];
  try {
    const raw = execFileSync('bd', [
      'list',
      '--notes-contains', 't1-conflict',
      '--status', 'open,in_progress,blocked',
      '--json',
      '--quiet',
    ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

    const issues = JSON.parse(raw);
    for (const issue of issues) {
      const notes = issue.notes ?? '';
      // Extract rule ID and agent from notes lines containing t1-conflict
      const conflictLines = notes.split('\n').filter((l) => l.includes('t1-conflict'));
      for (const line of conflictLines) {
        items.push(`${issue.id}: ${line.trim()}`);
      }
      if (conflictLines.length === 0) {
        items.push(`${issue.id}: ${issue.title} (has t1-conflict in notes)`);
      }
    }
  } catch {
    // bd not available or no results — skip
  }
  return items;
}

// ─── 4. Triage overflow ──────────────────────────────────────────

function collectOverflowSkipped() {
  const items = [];
  const logsDir = join(projectDir, '.sandcastle', 'logs');
  if (!existsSync(logsDir)) return items;

  // Find the latest pipeline run directory that has overflow-skipped.jsonl
  let latestPath = null;
  let latestMtime = 0;
  let latestRunName = '';

  try {
    const entries = readdirSync(logsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const overflowPath = join(logsDir, entry.name, 'overflow-skipped.jsonl');
      if (!existsSync(overflowPath)) continue;

      const { mtimeMs } = statSync(overflowPath);
      if (mtimeMs > latestMtime) {
        latestMtime = mtimeMs;
        latestPath = overflowPath;
        latestRunName = entry.name;
      }
    }
  } catch {
    return items;
  }

  if (!latestPath) return items;

  // Parse overflow entries from latest pipeline run
  try {
    const content = readFileSync(latestPath, 'utf8');
    for (const line of content.split('\n').filter(Boolean)) {
      try {
        const record = JSON.parse(line);
        const ruleId = record.rule ?? record.id ?? '(unknown)';
        const reason = record.reason ?? 'overflow';
        items.push(`${ruleId}: ${reason} (${latestRunName})`);
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // skip
  }

  return items;
}

// ─── 5. Screenshot baselines ─────────────────────────────────────

function collectScreenshotBaselines() {
  const items = [];
  try {
    const diff = execSync('git diff --name-only -- e2e/__screenshots__/', {
      encoding: 'utf8',
      cwd: projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (diff) {
      for (const file of diff.split('\n').filter(Boolean)) {
        items.push(file);
      }
    }

    // Also check untracked new screenshots
    const untracked = execSync('git ls-files --others --exclude-standard -- e2e/__screenshots__/', {
      encoding: 'utf8',
      cwd: projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (untracked) {
      for (const file of untracked.split('\n').filter(Boolean)) {
        items.push(`${file} (new)`);
      }
    }
  } catch {
    // git not available — skip
  }
  return items;
}

// ─── Run all collectors ──────────────────────────────────────────

section('Escalated tickets', collectEscalatedTickets());
section('Human-tier rules needing review', collectHumanTierRules());
section('T1/T3 conflicts', collectT1Conflicts());
section('Triage overflow (skipped rules)', collectOverflowSkipped());
section('Screenshot baselines', collectScreenshotBaselines());

// ─── Report ──────────────────────────────────────────────────────

console.log('');
console.log('Morning Review');
console.log('==============');
console.log('');

if (!hasPending) {
  console.log('Nothing needs review. All clear.');
  process.exit(0);
} else {
  for (const { title, items } of sections) {
    console.log(`${title} (${items.length}):`);
    for (const item of items) {
      console.log(`  - ${item}`);
    }
    console.log('');
  }

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  console.log(`${totalItems} item(s) pending review.`);
  process.exit(1);
}

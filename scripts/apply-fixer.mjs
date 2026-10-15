#!/usr/bin/env node
/**
 * Fixer patch model — mechanical applicator for QA findings.
 *
 * Validates findings, matches fixes by content not line number,
 * processes files in reverse line order, runs revert cascades,
 * caps T1 rejections, and commits each verified fix.
 *
 * Usage: node apply-fixer.mjs <findingsPath> [options]
 *   --gate=<gate>         Gate name (e.g. "review")
 *   --round=<n>           Round number
 *   --run-id=<id>         Run ID for state tracking
 *   --verify-timeout=<ms> Verify timeout (default 120000)
 *   --dry-run             Skip git commits and verify commands
 *
 * Exit 0 = all findings processed (some may be blocked/reverted)
 * Exit 1 = all findings malformed (escalate malformed-report)
 * Exit 2 = missing arguments / infrastructure failure
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync, spawn } from 'node:child_process';

const DEFAULT_VERIFY_TIMEOUT = 120_000;
const T1_REJECTION_CAP = 3;
const COMMIT_RETRY_DELAY_MS = 2000;

// ─── Finding validation ─────────────────────────────────────────

const FILE_LINE_RE = /^.+:\d+$/;
const CAUSE_RE = /^\[.+>.+>.+\]\s+.+$/;

/**
 * Validate a single finding object.
 * Returns { valid: true } or { valid: false, reason: string }.
 *
 * @param {object} finding
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateFinding(finding) {
  if (!finding || typeof finding !== 'object') {
    return { valid: false, reason: 'finding is not an object' };
  }

  // file:line
  if (!finding.fileLine || typeof finding.fileLine !== 'string') {
    return { valid: false, reason: 'missing file:line' };
  }
  if (!FILE_LINE_RE.test(finding.fileLine.trim())) {
    return { valid: false, reason: `file:line "${finding.fileLine}" does not match <path>:<number>` };
  }

  // Cause
  if (!finding.cause || typeof finding.cause !== 'string') {
    return { valid: false, reason: 'missing Cause' };
  }
  if (!CAUSE_RE.test(finding.cause.trim())) {
    return { valid: false, reason: `Cause "${finding.cause}" does not match [<rule-file> > <section> > <rule>] <explanation>` };
  }

  // Multi-target validation
  if (finding.targets && Array.isArray(finding.targets)) {
    for (let i = 0; i < finding.targets.length; i++) {
      const t = finding.targets[i];
      if (!t.fileLine || !FILE_LINE_RE.test(t.fileLine.trim())) {
        return { valid: false, reason: `target[${i}] missing or invalid file:line` };
      }
      if (!t.current || typeof t.current !== 'string' || t.current.trim() === '') {
        return { valid: false, reason: `target[${i}] missing Current` };
      }
      if (!t.fix || typeof t.fix !== 'string' || t.fix.trim() === '') {
        return { valid: false, reason: `target[${i}] missing Fix` };
      }
      if (t.current.trim() === t.fix.trim()) {
        return { valid: false, reason: `target[${i}] Fix equals Current (no-op)` };
      }
    }
  } else {
    // Single-target
    if (!finding.current || typeof finding.current !== 'string' || finding.current.trim() === '') {
      return { valid: false, reason: 'missing Current' };
    }
    if (!finding.fix || typeof finding.fix !== 'string' || finding.fix.trim() === '') {
      return { valid: false, reason: 'missing Fix' };
    }
    if (finding.current.trim() === finding.fix.trim()) {
      return { valid: false, reason: 'Fix equals Current (no-op)' };
    }
  }

  // Verify
  if (!finding.verify || typeof finding.verify !== 'string' || finding.verify.trim() === '') {
    return { valid: false, reason: 'missing Verify' };
  }

  return { valid: true };
}

// ─── Finding parser ─────────────────────────────────────────────

/**
 * Parse a findings report (markdown format) into structured findings.
 *
 * Expected format:
 *   FINDINGS
 *   - <path>:<line> `<selector>`
 *     Cause: [<rule-file> > <section> > <rule>] <explanation>
 *     Current: <code>
 *     Fix: <replacement>
 *     Verify: <shell command>
 *
 * @param {string} text
 * @returns {object[]}
 */
export function parseFindings(text) {
  const lines = text.split('\n');
  const findings = [];
  let inFindings = false;

  let current = null;
  let currentField = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*FINDINGS\s*$/.test(line)) {
      inFindings = true;
      continue;
    }
    if (/^\s*(PASS|CLEAN|DEFER)\s*$/.test(line)) {
      break;
    }

    if (!inFindings) continue;

    // New finding: starts with "- <path>:<line>"
    const findingMatch = line.match(/^-\s+(.+:\d+)\s*(.*)/);
    if (findingMatch) {
      if (current) findings.push(current);
      current = {
        fileLine: findingMatch[1].trim(),
        selector: findingMatch[2]?.replace(/`/g, '').trim() || '',
        cause: '',
        current: '',
        fix: '',
        verify: '',
        priority: 2, // default
      };
      currentField = null;
      continue;
    }

    if (!current) continue;

    // Field lines
    const causeMatch = line.match(/^\s+Cause:\s+(.*)/);
    if (causeMatch) {
      current.cause = causeMatch[1].trim();
      currentField = 'cause';
      continue;
    }

    const currentMatch = line.match(/^\s+Current:\s+(.*)/);
    if (currentMatch) {
      current.current = currentMatch[1].trim();
      currentField = 'current';
      continue;
    }

    const fixMatch = line.match(/^\s+Fix:\s+(.*)/);
    if (fixMatch) {
      current.fix = fixMatch[1].trim();
      currentField = 'fix';
      continue;
    }

    const verifyMatch = line.match(/^\s+Verify:\s+(.*)/);
    if (verifyMatch) {
      current.verify = verifyMatch[1].trim();
      currentField = 'verify';
      continue;
    }

    const priorityMatch = line.match(/^\s+Priority:\s+(\d+)/);
    if (priorityMatch) {
      current.priority = parseInt(priorityMatch[1], 10);
      currentField = null;
      continue;
    }

    // Continuation line for multi-line fields
    if (currentField && line.match(/^\s{4,}/) && line.trim() !== '') {
      current[currentField] += '\n' + line.trim();
    }
  }

  if (current) findings.push(current);

  return findings;
}

/**
 * Check if the report says PASS, CLEAN, or DEFER.
 * @param {string} text
 * @returns {string|null} "PASS", "CLEAN", "DEFER", or null
 */
export function detectReportStatus(text) {
  const firstLine = text.split('\n').find((l) => l.trim().length > 0);
  if (!firstLine) return null;
  const trimmed = firstLine.trim();
  if (/^(PASS|CLEAN|DEFER)$/.test(trimmed)) return trimmed;
  return null;
}

// ─── Patch model ────────────────────────────────────────────────

/**
 * Find `current` text in file content, starting from the hinted line.
 * Returns the index of the match, or -1 if not found.
 *
 * @param {string} fileContent
 * @param {string} current - text to find
 * @param {number} hintLine - 1-based line number hint
 * @returns {number} character index or -1
 */
export function findCurrentInFile(fileContent, current, hintLine) {
  const lines = fileContent.split('\n');
  const trimmedCurrent = current.trim();

  // Try at hinted line first (±2 lines for minor drift)
  const start = Math.max(0, hintLine - 3);
  const end = Math.min(lines.length, hintLine + 2);
  const regionText = lines.slice(start, end).join('\n');
  const regionIdx = regionText.indexOf(trimmedCurrent);

  if (regionIdx !== -1) {
    // Calculate absolute offset
    let offset = 0;
    for (let i = 0; i < start; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    return offset + regionIdx;
  }

  // Full file search
  return fileContent.indexOf(trimmedCurrent);
}

/**
 * Apply a patch: replace `current` with `fix` in file content.
 *
 * @param {string} fileContent
 * @param {string} current
 * @param {string} fix
 * @param {number} matchIndex - character index from findCurrentInFile
 * @returns {string} patched content
 */
export function applyPatch(fileContent, current, fix, matchIndex) {
  const trimmedCurrent = current.trim();
  return (
    fileContent.slice(0, matchIndex) +
    fix.trim() +
    fileContent.slice(matchIndex + trimmedCurrent.length)
  );
}

// ─── Processing order ───────────────────────────────────────────

/**
 * Sort findings by priority (lower=higher), then file path alphabetical,
 * then reverse line order within the same file.
 *
 * @param {object[]} findings
 * @returns {object[]}
 */
export function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    // Priority: lower number = higher priority
    const aPri = a.priority ?? 2;
    const bPri = b.priority ?? 2;
    if (aPri !== bPri) return aPri - bPri;

    // File path alphabetical
    const aFile = a.fileLine.split(':')[0];
    const bFile = b.fileLine.split(':')[0];
    if (aFile !== bFile) return aFile.localeCompare(bFile);

    // Reverse line order within same file (higher line first)
    const aLine = parseInt(a.fileLine.split(':')[1], 10);
    const bLine = parseInt(b.fileLine.split(':')[1], 10);
    return bLine - aLine;
  });
}

// ─── State tracking ─────────────────────────────────────────────

/**
 * Write a finding state transition to the JSONL file.
 *
 * @param {string} statesPath
 * @param {object} entry
 */
export function writeState(statesPath, entry) {
  mkdirSync(dirname(statesPath), { recursive: true });
  appendFileSync(statesPath, JSON.stringify(entry) + '\n');
}

// ─── Verify runner ──────────────────────────────────────────────

/**
 * Run a verify command with timeout.
 *
 * @param {string} cmd
 * @param {object} options
 * @param {number} options.timeout - ms
 * @param {string} options.cwd
 * @returns {Promise<{ success: boolean, stdout: string, stderr: string, timedOut: boolean }>}
 */
export function runVerify(cmd, { timeout, cwd }) {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', cmd], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killed = false;

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
      // SIGKILL after 5s
      setTimeout(() => {
        if (!killed) {
          try { child.kill('SIGKILL'); } catch { /* already dead */ }
        }
      }, 5000);
    }, timeout);

    child.on('close', (code) => {
      killed = true;
      clearTimeout(timer);
      resolve({
        success: code === 0,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

// ─── Git operations ─────────────────────────────────────────────

/**
 * Commit with retry on failure.
 *
 * @param {string} message
 * @param {string} cwd
 * @param {string[]} files
 * @returns {{ success: boolean, error?: string }}
 */
export function gitCommit(message, cwd, files) {
  try {
    for (const f of files) {
      execSync(`git add ${JSON.stringify(f)}`, { cwd, stdio: 'pipe' });
    }
    execSync(`git commit -m ${JSON.stringify(message)}`, { cwd, stdio: 'pipe', encoding: 'utf8' });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function gitCommitWithRetry(message, cwd, files) {
  const first = gitCommit(message, cwd, files);
  if (first.success) return first;

  // Retry once after 2s delay
  try {
    execSync('sleep 2', { cwd, stdio: 'pipe' });
  } catch { /* ignore */ }

  return gitCommit(message, cwd, files);
}

// ─── Single finding processor (with T1 retry loop) ─────────────

async function processSingleFinding({
  finding, cwd, dryRun, verifyTimeout,
  appliedPerFile, t1Rejections, results,
  runId, round, gate, statesPath,
}) {
  const filePath = finding.fileLine.split(':')[0];
  const lineHint = parseInt(finding.fileLine.split(':')[1], 10);
  const absPath = join(cwd, filePath);
  const findingKey = finding.fileLine;

  // File not found → blocked
  if (!existsSync(absPath)) {
    writeState(statesPath, {
      runId, findingId: findingKey, ruleId: extractRuleId(finding.cause),
      fileLine: finding.fileLine, state: 'blocked', previousState: null,
      round, gate, timestamp: new Date().toISOString(),
      detail: 'file not found on disk',
    });
    results.blocked++;
    return;
  }

  // Gap 7: Multi-target support — collect targets to apply.
  const targets = finding.targets && Array.isArray(finding.targets)
    ? finding.targets
    : [{ fileLine: finding.fileLine, current: finding.current, fix: finding.fix }];

  // T1 retry loop: up to T1_REJECTION_CAP attempts
  for (let attempt = 0; attempt <= T1_REJECTION_CAP; attempt++) {
    // Save originals for revert (per file).
    const originals = new Map(); // absPath -> original content
    const affectedFiles = [];
    let blocked = false;

    for (const target of targets) {
      const tFilePath = target.fileLine.split(':')[0];
      const tLineHint = parseInt(target.fileLine.split(':')[1], 10);
      const tAbsPath = join(cwd, tFilePath);

      if (!existsSync(tAbsPath)) {
        writeState(statesPath, {
          runId, findingId: findingKey, ruleId: extractRuleId(finding.cause),
          fileLine: finding.fileLine, state: 'blocked', previousState: null,
          round, gate, timestamp: new Date().toISOString(),
          detail: `file not found on disk: ${tFilePath}`,
        });
        results.blocked++;
        // Revert any already-applied targets in this finding.
        for (const [p, orig] of originals) writeFileSync(p, orig);
        return;
      }

      if (!originals.has(tAbsPath)) {
        originals.set(tAbsPath, readFileSync(tAbsPath, 'utf8'));
      }

      const fileContent = readFileSync(tAbsPath, 'utf8');
      const matchIdx = findCurrentInFile(fileContent, target.current, tLineHint);
      if (matchIdx === -1) {
        writeState(statesPath, {
          runId, findingId: findingKey, ruleId: extractRuleId(finding.cause),
          fileLine: finding.fileLine, state: 'blocked', previousState: null,
          round, gate, timestamp: new Date().toISOString(),
          detail: `Current text not found in ${tFilePath}`,
        });
        results.blocked++;
        // Revert any already-applied targets.
        for (const [p, orig] of originals) writeFileSync(p, orig);
        return;
      }

      const patched = applyPatch(fileContent, target.current, target.fix, matchIdx);
      writeFileSync(tAbsPath, patched);
      if (!affectedFiles.includes(tFilePath)) affectedFiles.push(tFilePath);
    }

    // For single-target compat, keep using the primary file path for tracking.
    const originalContent = originals.get(absPath) ?? readFileSync(absPath, 'utf8');

    // Track state as applied
    writeState(statesPath, {
      runId, findingId: findingKey, ruleId: extractRuleId(finding.cause),
      fileLine: finding.fileLine, state: 'applied', previousState: null,
      round, gate, timestamp: new Date().toISOString(), detail: null,
    });

    if (dryRun) {
      if (!appliedPerFile.has(filePath)) appliedPerFile.set(filePath, []);
      appliedPerFile.get(filePath).push({ finding, originalContent });
      results.applied++;
      results.committed++;
      return;
    }

    // Run verify
    const verifyResult = await runVerify(finding.verify, { timeout: verifyTimeout, cwd });

    if (verifyResult.timedOut) {
      for (const [p, orig] of originals) writeFileSync(p, orig);
      writeState(statesPath, {
        runId, findingId: findingKey, ruleId: extractRuleId(finding.cause),
        fileLine: finding.fileLine, state: 'reverted', previousState: 'applied',
        round, gate, timestamp: new Date().toISOString(), detail: 'verify timed out',
      });
      results.reverted++;
      await runRevertCascade({
        filePath, absPath, appliedPerFile, cwd, verifyTimeout,
        runId, round, gate, statesPath, results,
      });
      return;
    }

    if (!verifyResult.success) {
      // Check for T1 rejection
      const isT1Rejection = verifyResult.stderr.includes('T1') ||
        verifyResult.stdout.includes('T1');

      if (isT1Rejection) {
        const count = (t1Rejections.get(findingKey) ?? 0) + 1;
        t1Rejections.set(findingKey, count);

        // Revert the attempted fix
        for (const [p, orig] of originals) writeFileSync(p, orig);

        if (count >= T1_REJECTION_CAP) {
          // Escalate t1-conflict → settled
          writeState(statesPath, {
            runId, findingId: findingKey, ruleId: extractRuleId(finding.cause),
            fileLine: finding.fileLine, state: 'settled', previousState: 'applied',
            round, gate, timestamp: new Date().toISOString(),
            detail: `t1-conflict: ${count} rejections`,
          });
          results.settled++;
          return;
        }

        // Log the rejection and retry
        writeState(statesPath, {
          runId, findingId: findingKey, ruleId: extractRuleId(finding.cause),
          fileLine: finding.fileLine, state: 'reverted', previousState: 'applied',
          round, gate, timestamp: new Date().toISOString(),
          detail: `T1 rejection ${count}/${T1_REJECTION_CAP}`,
        });
        results.reverted++;
        continue; // retry the finding
      }

      // Non-T1 verify failure → revert
      for (const [p, orig] of originals) writeFileSync(p, orig);
      writeState(statesPath, {
        runId, findingId: findingKey, ruleId: extractRuleId(finding.cause),
        fileLine: finding.fileLine, state: 'reverted', previousState: 'applied',
        round, gate, timestamp: new Date().toISOString(), detail: 'verify failed',
      });
      results.reverted++;
      await runRevertCascade({
        filePath, absPath, appliedPerFile, cwd, verifyTimeout,
        runId, round, gate, statesPath, results,
      });
      return;
    }

    // Verify passed → commit
    const commitMsg = `fix(${gate}-r${round}): ${extractOneLiner(finding.cause)}`;
    const commitResult = gitCommitWithRetry(commitMsg, cwd, affectedFiles.length > 0 ? affectedFiles : [filePath]);

    if (!commitResult.success) {
      writeState(statesPath, {
        runId, findingId: findingKey, ruleId: extractRuleId(finding.cause),
        fileLine: finding.fileLine, state: 'applied', previousState: 'applied',
        round, gate, timestamp: new Date().toISOString(),
        detail: `infra-failure: git commit failed: ${commitResult.error}`,
      });
      results.exitCode = 2;
      return;
    }

    if (!appliedPerFile.has(filePath)) appliedPerFile.set(filePath, []);
    appliedPerFile.get(filePath).push({ finding, originalContent });
    results.applied++;
    results.committed++;

    writeState(statesPath, {
      runId, findingId: findingKey, ruleId: extractRuleId(finding.cause),
      fileLine: finding.fileLine, state: 'committed', previousState: 'applied',
      round, gate, timestamp: new Date().toISOString(), detail: null,
    });
    return;
  }
}

// ─── Main processing loop ───────────────────────────────────────

/**
 * Process findings: validate, apply, verify, commit.
 *
 * @param {object} options
 * @param {string} options.findingsPath
 * @param {string} options.gate
 * @param {number} options.round
 * @param {string} options.runId
 * @param {number} options.verifyTimeout
 * @param {boolean} options.dryRun
 * @param {string} options.cwd
 * @param {string} options.statesPath
 * @returns {Promise<object>} Result summary
 */
export async function processFindings({
  findingsPath,
  gate = 'review',
  round = 1,
  runId = 'unknown',
  verifyTimeout = DEFAULT_VERIFY_TIMEOUT,
  dryRun = false,
  cwd = process.cwd(),
  statesPath,
}) {
  const effectiveStatesPath = statesPath ?? join(cwd, 'finding-states.jsonl');

  // Read findings file
  if (!existsSync(findingsPath)) {
    return { error: 'findings file not found', exitCode: 2 };
  }

  const reportText = readFileSync(findingsPath, 'utf8');

  // Check for PASS/CLEAN/DEFER
  const status = detectReportStatus(reportText);
  if (status) {
    return { status, exitCode: 0, applied: 0, skipped: 0, blocked: 0, reverted: 0 };
  }

  // Gap 10: Unparseable output → treat as DEFER.
  // If the report doesn't start with a recognized status word and has no findings markers,
  // treat it as unparseable.
  const hasFindings = /^\s*FINDINGS\s*$/m.test(reportText);
  const hasStatus = /^\s*(PASS|CLEAN|DEFER|FINDINGS)\s*$/m.test(reportText);
  if (!hasStatus) {
    return {
      status: 'DEFER',
      escalation: 'gate-defer',
      exitCode: 0,
      applied: 0, skipped: 0, blocked: 0, reverted: 0,
      detail: 'unparseable gate output',
    };
  }

  // Parse findings
  const rawFindings = parseFindings(reportText);

  // Gap 9: FAIL/FINDINGS header with zero findings parsed → malformed-report.
  if (rawFindings.length === 0 && hasFindings) {
    return {
      escalation: 'malformed-report',
      exitCode: 1,
      applied: 0, skipped: 0, blocked: 0, reverted: 0,
      detail: 'FINDINGS header present but zero findings parsed',
    };
  }

  if (rawFindings.length === 0) {
    return { error: 'no findings parsed', exitCode: 0, applied: 0, skipped: 0, blocked: 0, reverted: 0 };
  }

  // Validate findings
  const valid = [];
  const malformed = [];

  for (const f of rawFindings) {
    const result = validateFinding(f);
    if (result.valid) {
      valid.push(f);
    } else {
      malformed.push({ finding: f, reason: result.reason });
      writeState(effectiveStatesPath, {
        runId,
        findingId: f.fileLine ?? 'unknown',
        ruleId: extractRuleId(f.cause),
        fileLine: f.fileLine ?? 'unknown',
        state: 'malformed',
        previousState: null,
        round,
        gate,
        timestamp: new Date().toISOString(),
        detail: result.reason,
      });
    }
  }

  // ALL malformed → escalate
  if (valid.length === 0 && malformed.length > 0) {
    return {
      escalation: 'malformed-report',
      exitCode: 1,
      applied: 0,
      skipped: malformed.length,
      blocked: 0,
      reverted: 0,
      malformed: malformed.map((m) => ({ fileLine: m.finding.fileLine, reason: m.reason })),
    };
  }

  // Sort valid findings
  const sorted = sortFindings(valid);

  // Track applied findings per file for revert cascade
  const appliedPerFile = new Map(); // file -> [{ finding, originalContent }]
  const t1Rejections = new Map(); // findingKey -> count
  const results = {
    applied: 0,
    committed: 0,
    skipped: malformed.length,
    blocked: 0,
    reverted: 0,
    settled: 0,
    exitCode: 0,
  };

  for (const finding of sorted) {
    await processSingleFinding({
      finding, cwd, dryRun, verifyTimeout,
      appliedPerFile, t1Rejections, results,
      runId, round, gate, statesPath: effectiveStatesPath,
    });
  }

  return results;
}

// ─── Revert cascade ─────────────────────────────────────────────

/**
 * After reverting a finding, re-verify all previously-applied findings
 * in the same file. If any fail, revert them too.
 */
async function runRevertCascade({
  filePath, absPath, appliedPerFile, cwd, verifyTimeout,
  runId, round, gate, statesPath, results,
}) {
  const applied = appliedPerFile.get(filePath);
  if (!applied || applied.length === 0) return;

  // Single pass: re-verify each previously-applied finding
  for (let i = applied.length - 1; i >= 0; i--) {
    const entry = applied[i];
    const verifyResult = await runVerify(entry.finding.verify, {
      timeout: verifyTimeout,
      cwd,
    });

    if (!verifyResult.success) {
      // Revert this finding too
      writeFileSync(absPath, entry.originalContent);
      writeState(statesPath, {
        runId,
        findingId: entry.finding.fileLine,
        ruleId: extractRuleId(entry.finding.cause),
        fileLine: entry.finding.fileLine,
        state: 'reverted',
        previousState: 'applied',
        round,
        gate,
        timestamp: new Date().toISOString(),
        detail: 'cascade revert: earlier fix broken',
      });
      results.reverted++;
      results.applied--;
      applied.splice(i, 1);
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Extract rule ID from a Cause string.
 * "[ui-base.md > Layout > No overflow] text" → "ui-base.md > Layout > No overflow"
 */
function extractRuleId(cause) {
  if (!cause) return 'unknown';
  const match = cause.match(/^\[([^\]]+)\]/);
  return match ? match[1].trim() : 'unknown';
}

/**
 * Extract a one-liner from a Cause string for commit messages.
 * "[ui-base.md > Layout > No overflow] description" → "description"
 */
function extractOneLiner(cause) {
  if (!cause) return 'fix';
  const match = cause.match(/^\[[^\]]+\]\s*(.+)/);
  return match ? match[1].trim().slice(0, 72) : cause.slice(0, 72);
}

// ─── CLI entry point ────────────────────────────────────────────

const isDirectRun = process.argv[1]?.endsWith('apply-fixer.mjs') &&
  !process.argv[1]?.includes('test-apply-fixer');
if (isDirectRun) {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith('--'));
  const findingsPath = positional[0];

  if (!findingsPath) {
    process.stderr.write('usage: node apply-fixer.mjs <findingsPath> [options]\n');
    process.exit(2);
  }

  const getOpt = (name) => {
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : undefined;
  };

  const gate = getOpt('gate') ?? 'review';
  const round = parseInt(getOpt('round') ?? '1', 10);
  const runId = getOpt('run-id') ?? `fixer-${Date.now()}`;
  const verifyTimeout = parseInt(getOpt('verify-timeout') ?? String(DEFAULT_VERIFY_TIMEOUT), 10);
  const dryRun = args.includes('--dry-run');

  processFindings({
    findingsPath,
    gate,
    round,
    runId,
    verifyTimeout,
    dryRun,
    cwd: process.cwd(),
  }).then((result) => {
    if (result.error) {
      process.stderr.write(`apply-fixer: ${result.error}\n`);
    }

    process.stderr.write(`apply-fixer: applied=${result.applied ?? 0} committed=${result.committed ?? 0} skipped=${result.skipped ?? 0} blocked=${result.blocked ?? 0} reverted=${result.reverted ?? 0}\n`);
    process.exit(result.exitCode ?? 0);
  }).catch((err) => {
    process.stderr.write(`apply-fixer: fatal: ${err.message}\n`);
    process.exit(2);
  });
}

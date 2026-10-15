#!/usr/bin/env node
/**
 * T3 prompt expansion: reads enforcement blocks from rules files,
 * filters by agent (visual-qa or reviewer), scope-gates reviewer rules
 * against the git diff, validates budget limits, and writes payload files
 * for injection into agent prompt templates.
 *
 * Usage: node apply-t3.mjs <issueId> <diffRef>
 *
 * Exit 0 = payloads produced
 * Exit 1 = budget exceeded (group > 80 or total > 300)
 * Exit 2 = missing arguments / infrastructure failure
 */
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { discoverRulesFiles, parseEnforcementBlocks, globMatch } from '../.claude/hooks/lib/rules.mjs';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// ─── Argument validation ──────────────────────────────────────────

const [issueId, diffRef] = process.argv.slice(2);

if (!issueId || !diffRef) {
  process.stderr.write('apply-t3: usage: node apply-t3.mjs <issueId> <diffRef>\n');
  process.exit(2);
}

const VALID_AGENTS = new Set(['visual-qa', 'reviewer']);

// ─── Discover and parse all T3 blocks ─────────────────────────────

const rulesFiles = discoverRulesFiles(projectDir);
const allT3 = [];

for (const filePath of rulesFiles) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    process.stderr.write(`apply-t3: warning: failed to read ${filePath}\n`);
    continue;
  }

  const { blocks, errors } = parseEnforcementBlocks(content, filePath);

  for (const err of errors) {
    process.stderr.write(`apply-t3: parse error in ${err.file}: ${err.message}\n`);
  }

  for (const block of blocks) {
    if (block.tier !== 'T3') continue;

    // Validate agent
    if (!block.agent) {
      process.stderr.write(`apply-t3: warning: T3 block "${block.id ?? '(no id)'}" missing agent, skipping\n`);
      continue;
    }
    if (!VALID_AGENTS.has(block.agent)) {
      process.stderr.write(`apply-t3: warning: T3 block "${block.id ?? '(no id)'}" has unrecognized agent "${block.agent}", skipping\n`);
      continue;
    }

    // Validate priority
    if (block.priority !== undefined) {
      const p = Number(block.priority);
      if (!Number.isInteger(p) || p < 0 || p > 4) {
        process.stderr.write(`apply-t3: warning: T3 block "${block.id ?? '(no id)'}" has out-of-range priority "${block.priority}", defaulting to 2\n`);
        block.priority = 2;
      } else {
        block.priority = p;
      }
    } else {
      block.priority = 2;
    }

    block._relFile = relative(projectDir, filePath);
    allT3.push(block);
  }
}

// ─── Budget: total > 300 → exit 1 ────────────────────────────────

if (allT3.length > 300) {
  process.stderr.write(`apply-t3: budget exceeded: total T3 rules (${allT3.length}) > 300\n`);
  process.exit(1);
}

// ─── Get diff files for reviewer scope-gating ─────────────────────

let diffFiles = null;
let diffFailed = false;

try {
  const output = execSync(`git diff --name-only ${diffRef}`, {
    cwd: projectDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  diffFiles = output.trim().split('\n').filter(Boolean);
} catch (err) {
  process.stderr.write(`apply-t3: warning: git diff --name-only failed, scope-gating skipped (fail open)\n`);
  diffFailed = true;
}

// ─── Partition by agent ───────────────────────────────────────────

const vqaBlocks = allT3.filter((b) => b.agent === 'visual-qa');
const reviewerBlocks = allT3.filter((b) => b.agent === 'reviewer');

// ─── Visual QA path ──────────────────────────────────────────────

function buildVqaPayloads() {
  if (vqaBlocks.length === 0) return null;

  // Budget: single group > 80 → exit 1
  const groups = new Map();
  for (const b of vqaBlocks) {
    const g = b.group ?? 'default';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(b);
  }

  for (const [group, blocks] of groups) {
    if (blocks.length > 80) {
      process.stderr.write(`apply-t3: budget exceeded: visual-qa group "${group}" has ${blocks.length} rules (> 80)\n`);
      process.exit(1);
    }
  }

  // total ≤ 80 → one payload; total > 80 → one per group
  if (vqaBlocks.length <= 80) {
    return [{ name: 'visual-qa.md', content: formatPayload(vqaBlocks) }];
  }

  const payloads = [];
  for (const [group, blocks] of groups) {
    payloads.push({ name: `visual-qa-${group}.md`, content: formatPayload(blocks) });
  }
  return payloads;
}

// ─── Reviewer path ───────────────────────────────────────────────

function buildReviewerPayloads() {
  if (reviewerBlocks.length === 0) return null;

  const surviving = [];
  const excluded = [];

  for (const block of reviewerBlocks) {
    if (!block.scope || block.scope === '*' || diffFailed) {
      // No scope, wildcard scope, or diff failed → include
      surviving.push(block);
      continue;
    }

    // Scope-gate: intersect with diff files
    const scopes = block.scope.split(',').map((s) => s.trim()).filter(Boolean);
    const matches = diffFiles.some((f) => scopes.some((s) => globMatch(s, f)));

    if (matches) {
      surviving.push(block);
    } else {
      excluded.push(block);
    }
  }

  // Log exclusions
  if (excluded.length > 0) {
    const lines = excluded.map((b) => JSON.stringify({
      id: b.id,
      scope: b.scope,
      reason: 'no matching files in diff',
    }));
    exclusionLines.push(...lines);
  }

  if (surviving.length === 0) return null;

  // Budget: non-exempt surviving > 80 → exit 1 if not fitting
  const nonExempt = surviving.filter((b) => b.triage_exempt !== 'true' && b.triage_exempt !== true);
  if (nonExempt.length > 80) {
    process.stderr.write(`apply-t3: budget exceeded: reviewer has ${nonExempt.length} non-exempt rules (> 80)\n`);
    process.exit(1);
  }

  return [{ name: 'reviewer.md', content: formatPayload(surviving) }];
}

// ─── Format payload content ──────────────────────────────────────

function formatPayload(blocks) {
  const sorted = [...blocks].sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2));
  const sections = sorted.map((b) => {
    let section = `## ${b.id ?? '(unnamed)'}\n\n`;
    section += b.instruction;
    if (b.triage_hint) {
      section += `\n\n**Triage hint:** ${b.triage_hint}`;
    }
    return section;
  });
  return `# T3 Rules\n\n${sections.join('\n\n---\n\n')}\n`;
}

// ─── Write payloads ──────────────────────────────────────────────

const payloadDir = join(projectDir, '.sandcastle', 'payloads', issueId);
const exclusionLines = [];

// Clear target directory
if (existsSync(payloadDir)) {
  rmSync(payloadDir, { recursive: true, force: true });
}
mkdirSync(payloadDir, { recursive: true });

const vqaPayloads = buildVqaPayloads();
const reviewerPayloads = buildReviewerPayloads();

// Write visual-qa payloads
if (vqaPayloads) {
  for (const p of vqaPayloads) {
    writeFileSync(join(payloadDir, p.name), p.content);
  }
} else {
  writeFileSync(join(payloadDir, 'visual-qa.md'), 'No T3 rules apply to this evaluation.\n');
}

// Write reviewer payloads
if (reviewerPayloads) {
  for (const p of reviewerPayloads) {
    writeFileSync(join(payloadDir, p.name), p.content);
  }
} else {
  writeFileSync(join(payloadDir, 'reviewer.md'), 'No T3 rules apply to this evaluation.\n');
}

// Write triage exclusions
if (exclusionLines.length > 0) {
  writeFileSync(join(payloadDir, 'triage-exclusions.jsonl'), exclusionLines.join('\n') + '\n');
}

process.stderr.write(`apply-t3: payloads written to ${payloadDir}\n`);
process.exit(0);

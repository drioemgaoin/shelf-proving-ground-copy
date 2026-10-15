#!/usr/bin/env node
/**
 * T3 prompt expansion: reads enforcement blocks from rules files,
 * filters by agent (visual-qa or reviewer), scope-gates reviewer rules
 * against the git diff, validates budget limits, and writes payload files
 * for injection into agent prompt templates.
 *
 * Usage: node apply-t3.mjs <issueId> <diffRef> [--triage-results=<path>]
 *
 * Exit 0 = payloads produced
 * Exit 1 = budget exceeded (group > 80 or total > 300)
 * Exit 2 = missing arguments / infrastructure failure
 * Exit 3 = triage needed (Phase 1 payload written, awaiting Haiku results)
 */
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { discoverRulesFiles, parseEnforcementBlocks, globMatch } from '../.claude/hooks/lib/rules.mjs';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// ─── Argument validation ──────────────────────────────────────────

const args = process.argv.slice(2);
const triageResultsArg = args.find((a) => a.startsWith('--triage-results='));
const positionalArgs = args.filter((a) => !a.startsWith('--'));
const [issueId, diffRef] = positionalArgs;

if (!issueId || !diffRef) {
  process.stderr.write('apply-t3: usage: node apply-t3.mjs <issueId> <diffRef> [--triage-results=<path>]\n');
  process.exit(2);
}

const triageResultsPath = triageResultsArg ? triageResultsArg.split('=').slice(1).join('=') : null;

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

  // total ≤ 80 → one payload (check token limit); total > 80 → one per group (1:1, never merged)
  if (vqaBlocks.length <= 80) {
    const content = formatPayload(vqaBlocks);
    if (estimateTokens(content) <= TOKEN_LIMIT) {
      return [{ name: 'visual-qa.md', content }];
    }
    // Token overflow even under 80 rules → split by group (1:1)
    process.stderr.write(`apply-t3: visual-qa payload exceeds ${TOKEN_LIMIT} tokens, splitting by group\n`);
  }

  const payloads = [];
  for (const [group, blocks] of groups) {
    payloads.push({ name: `visual-qa-${group}.md`, content: formatPayload(blocks) });
  }
  return payloads;
}

// ─── Token estimation ────────────────────────────────────────────

const TOKEN_LIMIT = 30000;

function estimateTokens(text) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

// ─── Reviewer path ───────────────────────────────────────────────

function isExempt(block) {
  return block.triage_exempt === 'true' || block.triage_exempt === true;
}

function buildReviewerPayloads() {
  if (reviewerBlocks.length === 0) return null;

  const surviving = [];
  const excluded = [];

  for (const block of reviewerBlocks) {
    if (!block.scope || block.scope === '*' || diffFailed) {
      surviving.push(block);
      continue;
    }

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

  const exempt = surviving.filter((b) => isExempt(b));
  const nonExempt = surviving.filter((b) => !isExempt(b));

  // ─── Two-phase triage when non-exempt > 80 ───────────────────
  if (nonExempt.length > 80) {
    return buildTriagedReviewerPayloads(nonExempt, exempt);
  }

  return buildReviewerPayloadChunks([...nonExempt, ...exempt]);
}

function buildTriagedReviewerPayloads(nonExempt, exempt) {
  // If --triage-results provided, read Phase 1 results
  if (triageResultsPath) {
    return applyPhase2(nonExempt, exempt);
  }

  // No triage results → produce Phase 1 payload and signal triage needed
  writePhase1Payload(nonExempt);
  triageNeeded = true;
  // Return exempt-only payload as fallback (Phase 1 payload written separately)
  if (exempt.length === 0) return null;
  return buildReviewerPayloadChunks(exempt);
}

function writePhase1Payload(nonExempt) {
  const hints = nonExempt.map((b) => ({
    id: b.id,
    triage_hint: b.triage_hint ?? '',
    group: b.group ?? null,
    priority: b.priority ?? 2,
  }));
  const content = JSON.stringify({ rules: hints, instruction: 'When uncertain, include the rule.' }, null, 2);
  writeFileSync(join(payloadDir, 'triage-phase1.json'), content);
  process.stderr.write(`apply-t3: triage Phase 1 payload written (${nonExempt.length} non-exempt rules)\n`);
}

function applyPhase2(nonExempt, exempt) {
  let flaggedIds;
  try {
    const raw = readFileSync(triageResultsPath, 'utf8').trim();
    flaggedIds = new Set(JSON.parse(raw));
  } catch (err) {
    process.stderr.write(`apply-t3: failed to read triage results: ${err.message}\n`);
    process.exit(2);
  }

  // Phase 1 flagged zero rules → anomaly warning, proceed with exempt only
  if (flaggedIds.size === 0) {
    process.stderr.write('apply-t3: triage anomaly: Phase 1 flagged zero rules\n');
    if (exempt.length === 0) return null;
    return buildReviewerPayloadChunks(exempt);
  }

  // Collect directly flagged rules
  const flagged = new Set();
  for (const b of nonExempt) {
    if (flaggedIds.has(b.id)) {
      flagged.add(b);
    }
  }

  // Group expansion: for each flagged rule with a group, pull in all rules from that group
  const groupsToExpand = new Set();
  for (const b of flagged) {
    if (b.group) groupsToExpand.add(b.group);
  }

  for (const b of nonExempt) {
    if (b.group && groupsToExpand.has(b.group)) {
      flagged.add(b);
    }
  }

  let expandedNonExempt = [...flagged];

  // Phase 2 cap: expanded set > 80 → take top 80 by priority (tiebreak: rule ID lexicographic)
  if (expandedNonExempt.length > 80) {
    expandedNonExempt.sort((a, b) => {
      const pDiff = (a.priority ?? 2) - (b.priority ?? 2);
      if (pDiff !== 0) return pDiff;
      return (a.id ?? '').localeCompare(b.id ?? '');
    });

    const skipped = expandedNonExempt.slice(80);
    expandedNonExempt = expandedNonExempt.slice(0, 80);

    for (const b of skipped) {
      overflowLines.push(JSON.stringify({
        ruleId: b.id,
        agent: 'reviewer',
        reason: 'triage-phase2-cap',
        runId: issueId,
      }));
    }
  }

  // Log triage exclusions for rules not flagged at all
  for (const b of nonExempt) {
    if (!flagged.has(b)) {
      triageExclusionLines.push(JSON.stringify({
        ruleId: b.id,
        runId: issueId,
        diffRef,
        ticketId: issueId,
      }));
    }
  }

  // Combine non-exempt + exempt (exempt bypass both phases)
  const combined = [...expandedNonExempt, ...exempt];
  return buildReviewerPayloadChunks(combined);
}

function buildReviewerPayloadChunks(blocks) {
  if (blocks.length === 0) return null;

  const content = formatPayload(blocks);
  const tokens = estimateTokens(content);

  if (tokens <= TOKEN_LIMIT) {
    return [{ name: 'reviewer.md', content }];
  }

  // Token overflow → chunk by priority respecting group boundaries
  process.stderr.write(`apply-t3: reviewer payload exceeds ${TOKEN_LIMIT} tokens (${tokens}), chunking\n`);
  return chunkReviewerByPriority(blocks);
}

function chunkReviewerByPriority(blocks) {
  const sorted = [...blocks].sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2));

  // Group blocks by their group field (preserving group boundaries)
  const groupBuckets = new Map();
  for (const b of sorted) {
    const g = b.group ?? `__ungrouped_${b.id}`;
    if (!groupBuckets.has(g)) groupBuckets.set(g, []);
    groupBuckets.get(g).push(b);
  }

  // Sort group buckets by best (lowest) priority in each group
  const sortedBuckets = [...groupBuckets.entries()].sort((a, b) => {
    const aPri = Math.min(...a[1].map((r) => r.priority ?? 2));
    const bPri = Math.min(...b[1].map((r) => r.priority ?? 2));
    return aPri - bPri;
  });

  // Greedy chunking: add group buckets until token limit
  const chunks = [];
  let currentChunkBlocks = [];
  let currentTokens = 0;

  for (const [, bucketBlocks] of sortedBuckets) {
    const bucketContent = formatPayload(bucketBlocks);
    const bucketTokens = estimateTokens(bucketContent);

    if (currentChunkBlocks.length > 0 && currentTokens + bucketTokens > TOKEN_LIMIT) {
      chunks.push({ name: `reviewer-${chunks.length + 1}.md`, content: formatPayload(currentChunkBlocks) });
      currentChunkBlocks = [];
      currentTokens = 0;
    }

    currentChunkBlocks.push(...bucketBlocks);
    currentTokens += bucketTokens;
  }

  if (currentChunkBlocks.length > 0) {
    if (chunks.length === 0) {
      chunks.push({ name: 'reviewer.md', content: formatPayload(currentChunkBlocks) });
    } else {
      chunks.push({ name: `reviewer-${chunks.length + 1}.md`, content: formatPayload(currentChunkBlocks) });
    }
  }

  return chunks;
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
const overflowLines = [];
const triageExclusionLines = [];
let triageNeeded = false;

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

// Write scope-gating exclusions
if (exclusionLines.length > 0) {
  writeFileSync(join(payloadDir, 'triage-exclusions.jsonl'), exclusionLines.join('\n') + '\n');
}

// Write triage exclusions (rules not flagged by Phase 1)
if (triageExclusionLines.length > 0) {
  const excPath = join(payloadDir, 'triage-exclusions.jsonl');
  const existing = existsSync(excPath) ? readFileSync(excPath, 'utf8') : '';
  writeFileSync(excPath, existing + triageExclusionLines.join('\n') + '\n');
}

// Write overflow-skipped log
if (overflowLines.length > 0) {
  writeFileSync(join(payloadDir, 'overflow-skipped.jsonl'), overflowLines.join('\n') + '\n');
}

process.stderr.write(`apply-t3: payloads written to ${payloadDir}\n`);

if (triageNeeded) {
  process.stderr.write('apply-t3: triage needed — Phase 1 payload ready, awaiting Haiku results\n');
  process.exit(3);
}

process.exit(0);

/**
 * Build {{CONSTRAINTS}} for implementer/fixer prompts.
 *
 * Reads .claude/rules/*.md, filters T1 enforcement blocks,
 * scope-filters by ticket, deduplicates by id, groups by file type,
 * and formats as negative constraints.
 *
 * Usage as module:
 *   import { buildConstraints } from './scripts/build-constraints.mjs';
 *   const { constraints } = buildConstraints(projectDir, { ticketScope });
 *
 * Usage as CLI (for testing):
 *   node scripts/build-constraints.mjs [--scope="src/components/**,src/App.tsx"]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  discoverRulesFiles,
  parseEnforcementBlocks,
  globMatch,
} from '../.claude/hooks/lib/rules.mjs';

// ---------------------------------------------------------------------------
// Scope bucket classification
// ---------------------------------------------------------------------------

/** Classify a scope glob into a file-type bucket for grouping. */
function classifyScope(scope) {
  if (!scope) return 'all';
  const s = scope.toLowerCase();
  // Narrow scopes first
  if (s.includes('.test.') || s.includes('__tests__')) return 'test';
  if (s.includes('e2e/') || s.startsWith('e2e') || s.includes('tests/')) return 'other';

  const hasCSS = /\.css\b/.test(s) || /\{[^}]*css[^}]*\}/.test(s);
  const hasTS = /\.tsx?\b/.test(s) || /\{[^}]*tsx?[^}]*\}/.test(s);

  if (hasCSS && !hasTS) return 'css';
  if (hasTS && !hasCSS) return 'ts';
  // Both or neither → all
  return 'all';
}

const BUCKET_HEADINGS = {
  css: 'When writing CSS files',
  ts: 'When writing TS/TSX files',
  test: 'When writing test files',
  all: 'All files',
  other: 'Other',
};

const BUCKET_ORDER = ['css', 'ts', 'test', 'all', 'other'];

// ---------------------------------------------------------------------------
// Scope filtering
// ---------------------------------------------------------------------------

/** Split a comma-separated string, ignoring commas inside braces. */
function splitOutsideBraces(str) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of str) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map(s => s.trim()).filter(Boolean);
}

/**
 * Check if a rule scope overlaps with the ticket scope.
 * ticketScope is a comma-separated glob list (e.g. "src/components/Foo/**,src/App.tsx").
 * We generate representative file paths from the ticket scope and check
 * if any match the rule's scope glob.
 */
function scopeOverlaps(ruleScope, ticketScope) {
  if (!ticketScope) return true; // no filter = include all
  if (!ruleScope) return true;

  const ticketGlobs = splitOutsideBraces(ticketScope);
  const ruleGlobs = splitOutsideBraces(ruleScope);

  // Check overlap bidirectionally: a broad ticket scope (src/**) is a superset
  // of a narrow rule scope (src/components/**), so we must test both directions.
  const reps = (globs) => globs.flatMap(g => {
    if (!g.includes('*')) return [g];
    const base = g.replace(/\/?\*+$/, '').replace(/\/\{[^}]+\}$/, '');
    if (!base) return [];
    return [
      `${base}/file.css`,
      `${base}/file.ts`,
      `${base}/file.tsx`,
      `${base}/file.test.ts`,
      `${base}/file.test.tsx`,
    ];
  });

  const ticketReps = reps(ticketGlobs);
  const ruleReps = reps(ruleGlobs);

  // Direction 1: ticket reps match rule globs (ticket narrower than rule)
  // Direction 2: rule reps match ticket globs (rule narrower than ticket)
  return ruleGlobs.some(rg => ticketReps.some(rep => globMatch(rg, rep)))
      || ticketGlobs.some(tg => ruleReps.some(rep => globMatch(tg, rep)));
}

// ---------------------------------------------------------------------------
// Constraint formatting
// ---------------------------------------------------------------------------

const RULE_TEXT_MAX_CHARS = 180;

function formatConstraint(index, block) {
  let text = block.ruleText || block.sectionHeading || block.id;
  // Truncate long rule prose — the rule text is enough for the agent.
  if (text.length > RULE_TEXT_MAX_CHARS) {
    text = text.slice(0, RULE_TEXT_MAX_CHARS).replace(/\s+\S*$/, '') + '…';
  }
  // Compact format: rule text only — fix suggestions are for T1 hook error
  // messages, not for guiding the agent. Dropping them saves ~50% of the
  // CONSTRAINTS block with zero quality loss.
  return `${index}. ${text}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Build constraints from T1 enforcement blocks.
 *
 * @param {string} projectDir - Project root directory.
 * @param {object} [opts]
 * @param {string} [opts.ticketScope] - Comma-separated glob from planner's scope field.
 * @param {number} [opts.maxConstraints=30] - Maximum constraints to include.
 * @returns {{ constraints: string }}
 */
export function buildConstraints(projectDir, opts = {}) {
  const { ticketScope, maxConstraints = 30 } = opts;

  // 1. Discover and parse all rule files
  const rulesFiles = discoverRulesFiles(projectDir);
  const allBlocks = [];

  for (const file of rulesFiles) {
    try {
      const content = readFileSync(file, 'utf8');
      const { blocks } = parseEnforcementBlocks(content, file);
      allBlocks.push(...blocks);
    } catch {
      // Skip unreadable files
    }
  }

  // 2. Filter to T1 only
  const t1Blocks = allBlocks.filter(b => b.tier === 'T1');

  // 3. Scope filter by ticket
  const scoped = ticketScope
    ? t1Blocks.filter(b => scopeOverlaps(b.scope, ticketScope))
    : t1Blocks;

  // 4. Deduplicate by id, merging distinct fix texts from multi-entry blocks
  const seen = new Map(); // id → { index, fixes: Set }
  const deduped = [];
  for (const block of scoped) {
    const id = block.id || `${block.pattern?.slice(0, 30)}`;
    if (seen.has(id)) {
      const entry = seen.get(id);
      // Merge truly distinct fix texts so the constraint covers all patterns
      if (block.fix && !entry.fixes.has(block.fix)) {
        entry.fixes.add(block.fix);
        deduped[entry.index].fix = [...entry.fixes].join('; ');
      }
      continue;
    }
    const fixes = new Set();
    if (block.fix) fixes.add(block.fix);
    seen.set(id, { index: deduped.length, fixes });
    deduped.push(block);
  }

  // 5. Group by scope bucket
  const buckets = new Map();
  for (const block of deduped) {
    const bucket = classifyScope(block.scope);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(block);
  }

  // 6. Format
  if (deduped.length === 0) {
    return { constraints: '' };
  }

  // If over limit, take first maxConstraints (future: rank by violation frequency)
  const limited = deduped.length > maxConstraints;
  const lines = [
    '# CONSTRAINTS',
    '',
    'These are hard boundaries. Hooks enforce them on every file write —',
    'a violation blocks the write and wastes a turn.',
  ];

  if (limited) {
    lines.push('');
    lines.push(`(Showing top ${maxConstraints} of ${deduped.length} constraints by scope relevance)`);
  }

  let total = 0;
  for (const bucket of BUCKET_ORDER) {
    const blocks = buckets.get(bucket);
    if (!blocks || blocks.length === 0) continue;

    lines.push('');
    lines.push(`## ${BUCKET_HEADINGS[bucket]}`);
    lines.push('');

    let i = 0;
    for (const block of blocks) {
      total++;
      if (limited && total > maxConstraints) break;
      i++;
      lines.push(formatConstraint(i, block));
    }
    if (limited && total > maxConstraints) break;
  }

  return { constraints: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// CLI mode
// ---------------------------------------------------------------------------

const isMain = process.argv[1]?.endsWith('build-constraints.mjs');
if (isMain) {
  const scopeArg = process.argv.find(a => a.startsWith('--scope='));
  const scope = scopeArg?.split('=')[1];
  const { constraints } = buildConstraints(process.cwd(), { ticketScope: scope });
  console.log(constraints || '(no T1 constraints found)');
}

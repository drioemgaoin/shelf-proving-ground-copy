#!/usr/bin/env node
/**
 * T1 Hook Eval Runner
 *
 * Reads eval cases from qa/hooks/evals/*.jsonl, runs each through
 * apply-t1.mjs against the real project rules, and reports metrics.
 *
 * ═══════════════════════════════════════════════════════════════════
 * Metrics
 * ═══════════════════════════════════════════════════════════════════
 *
 * No generic scores (accuracy, precision, recall). Every metric maps
 * to a concrete domain question. Confidence starts at zero and grows
 * one fixed incident at a time. (Ref: Hamel Husain — build domain-
 * specific checks that catch the failures your users care about.)
 *
 *   Gaps open       Known weaknesses not yet fixed. Drives urgency.
 *                   Work to drive this number down.
 *
 *   Gaps closed     Weaknesses that are now permanently guarded.
 *                   Drives confidence. Goes up as you fix rules.
 *
 *   Escapes total   Cases born from production incidents (tag: escape).
 *                   Each one is a bug that reached a real sandcastle run.
 *
 *   Escapes guarded Escapes now caught by rules. Target: equals total.
 *                   When guarded == total, every known incident is covered.
 *
 *   False blocks    Non-gap cases where the hook blocked valid code.
 *                   Drives usability. Each one is developer friction.
 *
 *   Regressions     Non-gap cases that were passing but now fail.
 *                   Drives stability. Any regression exits non-zero.
 *
 * ═══════════════════════════════════════════════════════════════════
 * Eval case schema (one JSONL line in qa/hooks/evals/<rule>.jsonl)
 * ═══════════════════════════════════════════════════════════════════
 *
 *   {
 *     "id":          "BLE-01",                   // unique, prefixed by rule abbreviation
 *     "rule":        "base-layer-exists",        // enforcement block id (grouping/filtering)
 *     "description": "Missing @layer base",      // human-readable, shows in report
 *     "tool":        "Write",                    // "Write" | "Edit"
 *     "file":        "src/styles/tokens.css",    // relative path from project root
 *     "content":     "...",                       // Write: full file content
 *     // --- OR for Edit: ---
 *     // "old_string": "...",
 *     // "new_string": "...",
 *     "expect":      "block",                    // "block" | "allow"
 *     "tags":        ["core", "dark-mode"],      // filtering/grouping
 *     "known_gap":   false,                      // true = expected fail, tracked separately
 *     "gap_fix":     "Add strip: comments..."    // (optional) how to fix an open gap
 *   }
 *
 *   Tags:
 *     escape       — case born from a production incident (sandcastle shipped a bug)
 *     adversarial  — proactive red-teaming (trying to break the rule before shipping)
 *     core         — spec-driven (the spec says this must work)
 *     known_gap with expect set to the CORRECT behavior:
 *       - While open: eval fails (gap is unresolved)
 *       - After fix:  eval passes (gap is permanently closed)
 *
 * ═══════════════════════════════════════════════════════════════════
 * npm scripts (package.json)
 * ═══════════════════════════════════════════════════════════════════
 *
 *   npm run eval:t1                              Run all evals + save to history
 *   npm run eval:t1:check                        Run all evals (no save, CI: exits 1 on regression)
 *   npm run eval:t1:verbose                      Run all evals with per-case detail
 *   npm run eval:t1:escapes                      Production incidents only (tag: escape)
 *   npm run eval:t1:rule -- base-layer-exists    Run one rule's evals
 *   npm run eval:t1:tag -- dark-mode             Run evals matching a tag
 *   npm run eval:t1:history                      Trend table across all saved runs
 *
 * ═══════════════════════════════════════════════════════════════════
 * CLI (direct invocation)
 * ═══════════════════════════════════════════════════════════════════
 *
 *   node qa/hooks/runner.mjs                            All evals, no save
 *   node qa/hooks/runner.mjs --save                     All evals + persist to metrics/
 *   node qa/hooks/runner.mjs --verbose                  Per-case pass/fail detail
 *   node qa/hooks/runner.mjs --rule base-layer-exists   Filter to one rule
 *   node qa/hooks/runner.mjs --tag escape               Filter to one tag
 *   node qa/hooks/runner.mjs --tag adversarial          Red-teaming cases only
 *   node qa/hooks/runner.mjs --history                  Show trend table from saved runs
 *
 *   Combine flags:
 *   node qa/hooks/runner.mjs --rule base-layer-exists --verbose --save
 *
 * ═══════════════════════════════════════════════════════════════════
 * Workflow
 * ═══════════════════════════════════════════════════════════════════
 *
 *   Before shipping (proactive):
 *     1. Write rules
 *     2. Red-team them → add adversarial cases → find gaps
 *     3. Fix gaps → npm run eval:t1 → gaps close
 *     4. Repeat until gaps open = 0
 *     5. Ship with confidence = "I tried everything I could and it's handled"
 *
 *   After shipping (reactive):
 *     6. Sandcastle ships a bug → add case with tag "escape" → gaps open++
 *     7. Fix the rule → npm run eval:t1 → escape flips to GUARDED
 *     8. That specific bug can never come back
 *
 *   Tracking progress:
 *     npm run eval:t1:history
 *     → Gaps open should trend down, gaps closed should trend up
 *     → Escapes guarded should approach escapes total
 *
 * ═══════════════════════════════════════════════════════════════════
 * File layout
 * ═══════════════════════════════════════════════════════════════════
 *
 *   qa/hooks/
 *   ├── evals/                        Eval definitions (one JSONL per rule)
 *   │   ├── base-layer-exists.jsonl
 *   │   ├── values-from-tokens-hex.jsonl
 *   │   ├── values-from-tokens-units.jsonl
 *   │   └── values-from-tokens-color-fns.jsonl
 *   ├── runner.mjs                    This file (engine)
 *   ├── metrics/                      Saved run data (gitignored, NDJSON)
 *   │   └── YYYY-MM-DD.jsonl
 *   └── unit/
 *       └── hooks.test.mjs            Hook engine tests (existing, separate concern)
 */
import { readdirSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT = process.cwd();
const EVALS_DIR = join(PROJECT, 'qa', 'hooks', 'evals');
const METRICS_DIR = join(PROJECT, 'qa', 'hooks', 'metrics');
const HOOK = join(PROJECT, '.claude', 'hooks', 'apply-t1.mjs');

// ─── CLI args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const ruleFilter = flagValue(args, '--rule');
const tagFilter = flagValue(args, '--tag');
const save = args.includes('--save');
// Auto-verbose when filtering to a subset — you're inspecting, not surveying.
const verbose = args.includes('--verbose') || ruleFilter != null || tagFilter != null;

function flagValue(argv, flag) {
  const idx = argv.indexOf(flag);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
}

// ─── Load eval cases ───────────────────────────────────────────────

function loadCases() {
  const files = readdirSync(EVALS_DIR).filter(f => f.endsWith('.jsonl')).sort();
  const cases = [];

  for (const file of files) {
    const content = readFileSync(join(EVALS_DIR, file), 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    for (let i = 0; i < lines.length; i++) {
      try {
        const c = JSON.parse(lines[i]);
        c._source = file;
        c._line = i + 1;
        cases.push(c);
      } catch (err) {
        console.error(`Parse error in ${file}:${i + 1}: ${err.message}`);
        process.exit(1);
      }
    }
  }

  return cases;
}

function filterCases(cases) {
  let filtered = cases;
  if (ruleFilter) {
    filtered = filtered.filter(c => c.rule === ruleFilter);
  }
  if (tagFilter) {
    filtered = filtered.filter(c => (c.tags ?? []).includes(tagFilter));
  }
  return filtered;
}

// ─── Run one eval case ─────────────────────────────────────────────

function buildToolInput(c) {
  const filePath = join(PROJECT, c.file);
  if (c.tool === 'Write') {
    return { tool_name: 'Write', tool_input: { file_path: filePath, content: c.content } };
  }
  if (c.tool === 'Edit') {
    const input = { file_path: filePath, new_string: c.new_string };
    if (c.old_string) input.old_string = c.old_string;
    return { tool_name: 'Edit', tool_input: input };
  }
  throw new Error(`Unknown tool "${c.tool}" in eval ${c.id}`);
}

function runCase(c) {
  const payload = buildToolInput(c);
  const start = performance.now();
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT, T1_RULE_FILTER: c.rule },
    encoding: 'utf8',
    timeout: 15000,
  });
  const duration = Math.round(performance.now() - start);
  const exitCode = result.status ?? 1;
  const actual = exitCode === 2 ? 'block' : exitCode === 0 ? 'allow' : 'error';
  const pass = actual === c.expect;
  const knownGap = c.known_gap === true;
  const isEscape = (c.tags ?? []).includes('escape');

  return {
    eval_id: c.id,
    rule: c.rule,
    description: c.description,
    expect: c.expect,
    actual,
    pass,
    known_gap: knownGap,
    escape: isEscape,
    duration_ms: duration,
    tags: c.tags ?? [],
    stderr: (result.stderr ?? '').trim(),
    source: c._source,
    gap_fix: c.gap_fix ?? null,
  };
}

// ─── Metrics persistence ───────────────────────────────────────────

function saveMetrics(results, summary) {
  mkdirSync(METRICS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = join(METRICS_DIR, `${date}.jsonl`);
  const timestamp = new Date().toISOString();
  const runId = `run-${Date.now()}`;

  // Per-case results
  for (const r of results) {
    const line = JSON.stringify({
      type: 'case',
      timestamp,
      run_id: runId,
      eval_id: r.eval_id,
      rule: r.rule,
      expect: r.expect,
      actual: r.actual,
      pass: r.pass,
      known_gap: r.known_gap,
      escape: r.escape,
      duration_ms: r.duration_ms,
      tags: r.tags,
    });
    appendFileSync(file, line + '\n');
  }

  // Run summary — one line per run for quick trend queries
  const summaryLine = JSON.stringify({
    type: 'summary',
    timestamp,
    run_id: runId,
    gaps_open: summary.gapsOpen,
    gaps_closed: summary.gapsClosed,
    escapes_total: summary.escapesTotal,
    escapes_guarded: summary.escapesGuarded,
    false_blocks: summary.falseBlocks,
    regressions: summary.regressions,
    total_cases: summary.total,
  });
  appendFileSync(file, summaryLine + '\n');

  return { file, runId };
}

// ─── Reporting ─────────────────────────────────────────────────────

function outcomeLabel(r) {
  if (r.pass && r.expect === 'block') return 'blocked correctly';
  if (r.pass && r.expect === 'allow') return 'allowed correctly';
  if (!r.pass && r.expect === 'block') return 'should block, but allowed   ← bad code gets through';
  if (!r.pass && r.expect === 'allow') return 'should allow, but blocked   ← valid code rejected';
  return '???';
}

function report(results) {
  const total = results.length;
  const gaps = results.filter(r => r.known_gap);
  const nonGap = results.filter(r => !r.known_gap);

  const gapsOpen = gaps.filter(r => !r.pass).length;
  const gapsClosed = gaps.filter(r => r.pass).length;

  const escapes = results.filter(r => r.escape);
  const escapesTotal = escapes.length;
  const escapesGuarded = escapes.filter(r => r.pass).length;

  const falseBlocks = nonGap.filter(r => r.expect === 'allow' && r.actual === 'block').length;
  const regressions = nonGap.filter(r => !r.pass).length;

  const date = new Date().toISOString().slice(0, 10);
  const sep = '═'.repeat(68);
  const thin = '─'.repeat(68);

  // ━━━ 1. VERDICT — one glance tells you if you can move on ━━━
  console.log('');
  console.log(sep);
  if (regressions > 0) {
    console.log('  FAIL — regressions detected, fix before shipping');
  } else if (gapsOpen > 0) {
    console.log(`  ${gapsOpen} GAPS REMAIN — rules can be broken in known ways`);
  } else {
    console.log('  ALL CLEAR — every tested scenario is handled');
  }
  console.log(`  ${total} cases · ${date}`);
  console.log(sep);

  // ━━━ 2. FIX NOW — only printed when something needs action ━━━
  const regCases = nonGap.filter(r => !r.pass);
  const openGaps = gaps.filter(r => !r.pass);
  const openEscapes = escapes.filter(e => !e.pass);

  if (regressions > 0 || openGaps.length > 0 || falseBlocks > 0 || openEscapes.length > 0) {
    console.log('');
    console.log('  FIX NOW');
    console.log(thin);

    if (regressions > 0) {
      console.log('');
      console.log(`  !! ${regressions} REGRESSION${regressions > 1 ? 'S' : ''} — cases that were passing now fail`);
      for (const f of regCases) {
        console.log(`  ✗ ${f.eval_id.padEnd(10)} ${outcomeLabel(f)}`);
        console.log(`    ${f.description}`);
      }
    }

    if (openEscapes.length > 0) {
      console.log('');
      console.log(`  !! ${openEscapes.length} UNGUARDED PRODUCTION INCIDENT${openEscapes.length > 1 ? 'S' : ''}`);
      for (const e of openEscapes) {
        console.log(`  ✗ ${e.eval_id.padEnd(10)} ${e.description}`);
        if (e.gap_fix) console.log(`    Fix: ${e.gap_fix}`);
      }
    }

    if (openGaps.length > 0) {
      const nonEscapeGaps = openGaps.filter(g => !g.escape);
      if (nonEscapeGaps.length > 0) {
        console.log('');
        console.log(`  ${nonEscapeGaps.length} open gap${nonEscapeGaps.length > 1 ? 's' : ''} — known weaknesses to fix`);
        for (const g of nonEscapeGaps) {
          console.log(`  ○ ${g.eval_id.padEnd(10)} ${g.description}`);
          if (g.gap_fix) console.log(`    Fix: ${g.gap_fix}`);
        }
      }
    }

    if (falseBlocks > 0) {
      console.log('');
      console.log(`  ${falseBlocks} false block${falseBlocks > 1 ? 's' : ''} — valid code wrongly rejected`);
      const fbCases = nonGap.filter(r => r.expect === 'allow' && r.actual === 'block');
      for (const f of fbCases) {
        console.log(`  ✗ ${f.eval_id.padEnd(10)} ${f.description}`);
      }
    }
  }

  // ━━━ 3. CONFIDENCE — compact metrics snapshot ━━━
  console.log('');
  console.log('  CONFIDENCE');
  console.log(thin);
  console.log(`  Gaps        ${pad(gapsClosed)} closed   ${pad(gapsOpen)} open`);
  console.log(`  Escapes     ${pad(escapesGuarded)} guarded  ${pad(escapesTotal - escapesGuarded)} unguarded   (${escapesTotal} total)`);
  console.log(`  Friction    ${pad(falseBlocks)} false blocks`);
  console.log(`  Stability   ${pad(regressions)} regressions`);

  // ━━━ 4. RULES — per-rule status ━━━
  console.log('');
  console.log('  RULES');
  console.log(thin);
  const byRule = groupBy(results, 'rule');
  for (const [rule, cases] of Object.entries(byRule).sort((a, b) => a[0].localeCompare(b[0]))) {
    const rGapsOpen = cases.filter(c => c.known_gap && !c.pass).length;
    const rGapsClosed = cases.filter(c => c.known_gap && c.pass).length;
    const rEscapes = cases.filter(c => c.escape);
    const rEscapesGuarded = rEscapes.filter(c => c.pass).length;
    const rFalseBlocks = cases.filter(c => !c.known_gap && c.expect === 'allow' && c.actual === 'block').length;
    const rRegressions = cases.filter(c => !c.known_gap && !c.pass).length;
    const rTotal = cases.length;

    const status = rRegressions > 0 ? '✗ BROKEN' : rGapsOpen > 0 ? '○ HAS GAPS' : '✓ SOLID';

    console.log(`  ${status.padEnd(14)} ${rule}  (${rTotal} cases)`);

    const details = [];
    if (rRegressions > 0) details.push(`${rRegressions} regr`);
    if (rGapsOpen > 0) details.push(`${rGapsOpen} gaps open`);
    if (rFalseBlocks > 0) details.push(`${rFalseBlocks} false blocks`);
    if (rEscapes.length > 0) details.push(`escapes ${rEscapesGuarded}/${rEscapes.length}`);
    if (rGapsClosed > 0) details.push(`${rGapsClosed} gaps closed`);
    if (details.length > 0) {
      console.log(`                 ${details.join(' · ')}`);
    }
  }

  // ━━━ 5. DETAIL — production incidents and closed gaps ━━━

  // Show guarded escapes for the record
  const guardedEscapes = escapes.filter(e => e.pass);
  if (guardedEscapes.length > 0) {
    console.log('');
    console.log('  PRODUCTION INCIDENTS');
    console.log(thin);
    for (const e of escapes) {
      const mark = e.pass ? '✓' : '✗';
      const label = e.pass ? 'GUARDED' : 'OPEN';
      console.log(`  ${mark} ${e.eval_id.padEnd(10)} ${label}  ${e.description}`);
    }
  }

  // Closed gaps — proof of progress
  const closedGaps = gaps.filter(r => r.pass);
  if (closedGaps.length > 0) {
    console.log('');
    console.log(`  CLOSED GAPS (${closedGaps.length})`);
    console.log(thin);
    for (const g of closedGaps) {
      console.log(`  ✓ ${g.eval_id.padEnd(10)} ${g.description}`);
    }
  }

  // ━━━ 6. VERBOSE — per-case detail when inspecting ━━━
  if (verbose) {
    console.log('');
    console.log('  ALL CASES');
    console.log('  ✓ = correct   ○ = known gap   ✗ = regression');
    console.log(thin);

    for (const [rule, cases] of Object.entries(byRule).sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log('');
      console.log(`  ${rule}`);
      for (const r of cases) {
        const mark = r.pass ? '✓' : r.known_gap ? '○' : '✗';
        const badges = [];
        if (r.escape) badges.push('prod');
        if (r.known_gap && !r.pass) badges.push('gap');
        const suffix = badges.length > 0 ? `  [${badges.join(', ')}]` : '';
        console.log(`  ${mark} ${r.eval_id.padEnd(10)} ${r.description}${suffix}`);
      }
    }
  }

  console.log('');
  console.log(sep);

  return {
    total,
    gapsOpen,
    gapsClosed,
    escapesTotal,
    escapesGuarded,
    falseBlocks,
    regressions,
  };
}

function pad(n) {
  return String(n).padStart(3);
}

function groupBy(arr, key) {
  const out = {};
  for (const item of arr) {
    const k = item[key] ?? 'unknown';
    (out[k] ??= []).push(item);
  }
  return out;
}

// ─── History report ────────────────────────────────────────────────

function showHistory() {
  let files;
  try {
    files = readdirSync(METRICS_DIR).filter(f => f.endsWith('.jsonl')).sort();
  } catch {
    console.log('No metrics history found. Run with --save first.');
    return;
  }

  if (files.length === 0) {
    console.log('No metrics history found. Run with --save first.');
    return;
  }

  // Read all summary lines
  const summaries = [];
  for (const file of files) {
    const content = readFileSync(join(METRICS_DIR, file), 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'summary') summaries.push(entry);
      } catch { /* skip corrupted */ }
    }
  }

  if (summaries.length === 0) {
    console.log('No summary data found. Run with --save to record runs.');
    return;
  }

  const sep = '─'.repeat(72);
  console.log('');
  console.log('T1 Hook Eval History');
  console.log(sep);
  console.log('  Date        Gaps   Gaps    Escapes  Escapes  False   Regr-');
  console.log('              open   closed  total    guarded  blocks  essions');
  console.log(sep);

  // Show last run per day
  const byDay = new Map();
  for (const s of summaries) {
    const day = s.timestamp.slice(0, 10);
    byDay.set(day, s); // last run wins
  }

  for (const [day, s] of [...byDay.entries()].sort()) {
    const go = String(s.gaps_open).padStart(4);
    const gc = String(s.gaps_closed).padStart(6);
    const et = String(s.escapes_total).padStart(7);
    const eg = String(s.escapes_guarded).padStart(8);
    const fb = String(s.false_blocks).padStart(6);
    const rg = String(s.regressions).padStart(7);
    console.log(`  ${day}  ${go}  ${gc}  ${et}  ${eg}  ${fb}  ${rg}`);
  }

  // Trend arrows (compare first and last)
  const days = [...byDay.entries()].sort();
  if (days.length >= 2) {
    const first = days[0][1];
    const last = days[days.length - 1][1];
    console.log(sep);
    console.log('Trend:');
    trend('  Gaps open', first.gaps_open, last.gaps_open, 'down');
    trend('  Gaps closed', first.gaps_closed, last.gaps_closed, 'up');
    trend('  Escapes guarded', first.escapes_guarded, last.escapes_guarded, 'up');
    trend('  False blocks', first.false_blocks, last.false_blocks, 'down');
    trend('  Regressions', first.regressions, last.regressions, 'down');
  }

  console.log('');
}

function trend(label, first, last, goodDirection) {
  const delta = last - first;
  if (delta === 0) {
    console.log(`${label.padEnd(22)} ${last} (unchanged)`);
  } else {
    const arrow = delta > 0 ? '+' : '';
    const good = (goodDirection === 'up' && delta > 0) || (goodDirection === 'down' && delta < 0);
    const marker = good ? ' ✓' : ' ⚠';
    console.log(`${label.padEnd(22)} ${last} (${arrow}${delta})${marker}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────

const isHistory = args.includes('--history');

if (isHistory) {
  showHistory();
  process.exit(0);
}

const allCases = loadCases();
const cases = filterCases(allCases);

if (cases.length === 0) {
  console.log('No eval cases match the filter.');
  process.exit(0);
}

const results = cases.map(c => runCase(c));
const summary = report(results);

if (save) {
  const { file, runId } = saveMetrics(results, summary);
  console.log(`Metrics saved: ${file} (run: ${runId})`);
  console.log('');
}

// Exit code: 1 if any regression (non-gap failure)
const exitCode = summary.regressions > 0 ? 1 : 0;
process.exit(exitCode);

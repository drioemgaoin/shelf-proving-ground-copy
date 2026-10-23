#!/usr/bin/env node
/**
 * T1 Hook Eval Runner — baseline/ratchet model
 *
 * Reads eval cases from qa/hooks/evals/*.jsonl, runs each through
 * apply-t1.mjs against the real project rules, and reports metrics.
 *
 * Same promotion flow as qa/prompt-evals/runner.mjs:
 *   - baseline.json records the best known run
 *   - --save promotes if domain metrics improved or stable
 *   - --save --force promotes unconditionally
 *   - no baseline yet → first --save creates it
 *
 * Metrics are domain-specific, not generic scores:
 *   Gaps open       Known weaknesses not yet fixed
 *   Gaps closed     Weaknesses permanently guarded
 *   Escapes guarded Production incidents now caught
 *   False blocks    Valid code wrongly rejected
 *   Regressions     Non-gap cases that broke
 *
 * CLI:
 *   node qa/hooks/runner.mjs                            Run all, compare to baseline
 *   node qa/hooks/runner.mjs --save                     Run + promote if improved
 *   node qa/hooks/runner.mjs --save --force             Run + force promote
 *   node qa/hooks/runner.mjs --baseline                 Show current baseline
 *   node qa/hooks/runner.mjs --verbose                  Per-case detail
 *   node qa/hooks/runner.mjs --rule base-layer-exists   Filter to one rule
 *   node qa/hooks/runner.mjs --tag escape               Filter by tag
 *   node qa/hooks/runner.mjs --history                  Trend from saved runs
 */
import { readdirSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT = process.cwd();
const EVALS_DIR = join(PROJECT, 'qa', 'hooks', 'evals');
const METRICS_DIR = join(PROJECT, 'qa', 'hooks', 'metrics');
const RUNS_DIR = join(METRICS_DIR, 'runs');
const BASELINE_FILE = join(METRICS_DIR, 'baseline.json');
const HOOK = join(PROJECT, '.claude', 'hooks', 'apply-t1.mjs');

// ─── CLI args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const ruleFilter = flagValue(args, '--rule');
const tagFilter = flagValue(args, '--tag');
const save = args.includes('--save');
const force = args.includes('--force');
const showBaseline = args.includes('--baseline');
const isHistory = args.includes('--history');
// Auto-verbose when filtering to a subset — you're inspecting, not surveying.
const verbose = args.includes('--verbose') || ruleFilter != null || tagFilter != null;

function flagValue(argv, flag) {
  const idx = argv.indexOf(flag);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
}

// ─── Baseline ─────────────────────────────────────────────────────

function loadBaseline() {
  if (!existsSync(BASELINE_FILE)) return null;
  try { return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')); }
  catch { return null; }
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

// ─── Build run data ───────────────────────────────────────────────

function buildRunData(results) {
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

  // Per-rule breakdown
  const byRule = {};
  for (const r of results) {
    const key = r.rule ?? 'unknown';
    if (!byRule[key]) byRule[key] = { pass: 0, total: 0, gaps_open: 0, gaps_closed: 0, escapes: 0, escapes_guarded: 0, false_blocks: 0, regressions: 0 };
    byRule[key].total++;
    if (r.pass) byRule[key].pass++;
    if (r.known_gap && !r.pass) byRule[key].gaps_open++;
    if (r.known_gap && r.pass) byRule[key].gaps_closed++;
    if (r.escape) { byRule[key].escapes++; if (r.pass) byRule[key].escapes_guarded++; }
    if (!r.known_gap && !r.pass && r.expect === 'allow' && r.actual === 'block') byRule[key].false_blocks++;
    if (!r.known_gap && !r.pass) byRule[key].regressions++;
  }

  return {
    timestamp: new Date().toISOString(),
    run_id: `run-${Date.now()}`,
    total,
    // Domain metrics — these drive promotion decisions
    metrics: {
      gaps_open: gapsOpen,
      gaps_closed: gapsClosed,
      escapes_total: escapesTotal,
      escapes_guarded: escapesGuarded,
      false_blocks: falseBlocks,
      regressions,
    },
    by_rule: byRule,
    cases: results.map(r => ({
      id: r.eval_id,
      rule: r.rule,
      description: r.description,
      expect: r.expect,
      actual: r.actual,
      pass: r.pass,
      known_gap: r.known_gap,
      escape: r.escape,
      duration_ms: r.duration_ms,
      tags: r.tags,
      gap_fix: r.gap_fix,
    })),
  };
}

// ─── Save / Promote (same flow as prompt-evals) ──────────────────

function saveRun(runData) {
  mkdirSync(RUNS_DIR, { recursive: true });
  const runFile = join(RUNS_DIR, `${runData.timestamp.replace(/[:.]/g, '-')}.json`);
  writeFileSync(runFile, JSON.stringify(runData, null, 2));
  return runFile;
}

function promoteBaseline(runData, baseline) {
  if (!baseline) {
    mkdirSync(METRICS_DIR, { recursive: true });
    writeFileSync(BASELINE_FILE, JSON.stringify(runData, null, 2));
    console.log('  \u2B06 PROMOTED (first baseline)');
    return;
  }

  if (force) {
    writeFileSync(BASELINE_FILE, JSON.stringify(runData, null, 2));
    console.log('  \u2B06 PROMOTED (--force)');
    return;
  }

  // Domain-specific regression check:
  // A run regresses when any metric worsens in the bad direction.
  const cur = runData.metrics;
  const base = baseline.metrics;

  const regressed =
    cur.gaps_open > base.gaps_open ||
    cur.escapes_guarded < base.escapes_guarded ||
    cur.false_blocks > base.false_blocks ||
    cur.regressions > base.regressions;

  if (regressed) {
    console.log('  \u2B07 REGRESSED \u2014 baseline kept (run with --save --force to override)');
    // Show which metrics regressed
    if (cur.gaps_open > base.gaps_open) console.log(`    gaps_open: ${base.gaps_open} \u2192 ${cur.gaps_open}`);
    if (cur.escapes_guarded < base.escapes_guarded) console.log(`    escapes_guarded: ${base.escapes_guarded} \u2192 ${cur.escapes_guarded}`);
    if (cur.false_blocks > base.false_blocks) console.log(`    false_blocks: ${base.false_blocks} \u2192 ${cur.false_blocks}`);
    if (cur.regressions > base.regressions) console.log(`    regressions: ${base.regressions} \u2192 ${cur.regressions}`);
    return;
  }

  const improved =
    cur.gaps_open < base.gaps_open ||
    cur.gaps_closed > base.gaps_closed ||
    cur.escapes_guarded > base.escapes_guarded ||
    cur.false_blocks < base.false_blocks ||
    cur.regressions < base.regressions;

  writeFileSync(BASELINE_FILE, JSON.stringify(runData, null, 2));
  if (improved) {
    console.log('  \u2B06 PROMOTED (--save)');
  } else {
    console.log('  \u2B06 PROMOTED (--save, stable)');
  }
}

// ─── Legacy metrics persistence (append NDJSON) ───────────────────

function saveLegacyMetrics(results, metrics) {
  mkdirSync(METRICS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = join(METRICS_DIR, `${date}.jsonl`);
  const timestamp = new Date().toISOString();
  const runId = `run-${Date.now()}`;

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

  const summaryLine = JSON.stringify({
    type: 'summary',
    timestamp,
    run_id: runId,
    gaps_open: metrics.gaps_open,
    gaps_closed: metrics.gaps_closed,
    escapes_total: metrics.escapes_total,
    escapes_guarded: metrics.escapes_guarded,
    false_blocks: metrics.false_blocks,
    regressions: metrics.regressions,
    total_cases: results.length,
  });
  appendFileSync(file, summaryLine + '\n');

  return { file, runId };
}

// ─── Reporting ─────────────────────────────────────────────────────

function outcomeLabel(r) {
  if (r.pass && r.expect === 'block') return 'blocked correctly';
  if (r.pass && r.expect === 'allow') return 'allowed correctly';
  if (!r.pass && r.expect === 'block') return 'should block, but allowed   \u2190 bad code gets through';
  if (!r.pass && r.expect === 'allow') return 'should allow, but blocked   \u2190 valid code rejected';
  return '???';
}

function bar(rate, width) {
  const filled = Math.round((rate / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

function report(runData, baseline) {
  const m = runData.metrics;
  const bm = baseline?.metrics;

  const sep = '\u2550'.repeat(68);
  const thin = '\u2500'.repeat(68);
  const date = runData.timestamp.slice(0, 10);

  // 1. VERDICT
  console.log('');
  console.log(sep);
  if (m.regressions > 0) {
    console.log('  FAIL \u2014 regressions detected, fix before shipping');
  } else if (m.gaps_open > 0) {
    console.log(`  ${m.gaps_open} GAPS REMAIN \u2014 rules can be broken in known ways`);
  } else {
    console.log('  ALL CLEAR \u2014 every tested scenario is handled');
  }
  console.log(`  ${runData.total} cases \u00b7 ${date}`);
  console.log(sep);

  // 2. FIX NOW — only when something needs action
  const openGaps = runData.cases.filter(c => c.known_gap && !c.pass);
  const openEscapes = runData.cases.filter(c => c.escape && !c.pass);
  const regCases = runData.cases.filter(c => !c.known_gap && !c.pass);
  const fbCases = runData.cases.filter(c => !c.known_gap && c.expect === 'allow' && c.actual === 'block');

  if (m.regressions > 0 || openGaps.length > 0 || m.false_blocks > 0 || openEscapes.length > 0) {
    console.log('');
    console.log('  FIX NOW');
    console.log(thin);

    if (m.regressions > 0) {
      console.log('');
      console.log(`  !! ${m.regressions} REGRESSION${m.regressions > 1 ? 'S' : ''}`);
      for (const f of regCases) {
        console.log(`  \u2717 ${f.id.padEnd(10)} ${outcomeLabel(f)}`);
        console.log(`    ${f.description}`);
      }
    }

    if (openEscapes.length > 0) {
      console.log('');
      console.log(`  !! ${openEscapes.length} UNGUARDED PRODUCTION INCIDENT${openEscapes.length > 1 ? 'S' : ''}`);
      for (const e of openEscapes) {
        console.log(`  \u2717 ${e.id.padEnd(10)} ${e.description}`);
        if (e.gap_fix) console.log(`    Fix: ${e.gap_fix}`);
      }
    }

    if (openGaps.length > 0) {
      const nonEscapeGaps = openGaps.filter(g => !g.escape);
      if (nonEscapeGaps.length > 0) {
        console.log('');
        console.log(`  ${nonEscapeGaps.length} open gap${nonEscapeGaps.length > 1 ? 's' : ''}`);
        for (const g of nonEscapeGaps) {
          console.log(`  \u25CB ${g.id.padEnd(10)} ${g.description}`);
          if (g.gap_fix) console.log(`    Fix: ${g.gap_fix}`);
        }
      }
    }

    if (m.false_blocks > 0) {
      console.log('');
      console.log(`  ${m.false_blocks} false block${m.false_blocks > 1 ? 's' : ''}`);
      for (const f of fbCases) {
        console.log(`  \u2717 ${f.id.padEnd(10)} ${f.description}`);
      }
    }
  }

  // 3. CONFIDENCE — domain metrics with baseline comparison
  console.log('');
  console.log('  CONFIDENCE                              now     base');
  console.log(thin);

  function metricLine(label, cur, base, goodDir) {
    const curStr = String(cur).padStart(3);
    const baseStr = base != null ? String(base).padStart(3) : '  \u2014';
    let delta = '';
    if (base != null && cur !== base) {
      const d = cur - base;
      const arrow = d > 0 ? '+' : '';
      const good = (goodDir === 'down' && d < 0) || (goodDir === 'up' && d > 0);
      delta = good ? ` \u2713` : ` \u26A0`;
      delta = `  (${arrow}${d})${delta}`;
    }
    console.log(`  ${label.padEnd(30)}         ${curStr}     ${baseStr}${delta}`);
  }

  metricLine('Gaps open', m.gaps_open, bm?.gaps_open, 'down');
  metricLine('Gaps closed', m.gaps_closed, bm?.gaps_closed, 'up');
  metricLine('Escapes guarded', m.escapes_guarded, bm?.escapes_guarded, 'up');
  metricLine('Escapes total', m.escapes_total, bm?.escapes_total, 'up');
  metricLine('False blocks', m.false_blocks, bm?.false_blocks, 'down');
  metricLine('Regressions', m.regressions, bm?.regressions, 'down');

  // 4. RULES — per-rule status
  console.log('');
  console.log('  RULES');
  console.log(thin);
  for (const [rule, rd] of Object.entries(runData.by_rule).sort((a, b) => a[0].localeCompare(b[0]))) {
    const status = rd.regressions > 0 ? '\u2717 BROKEN' : rd.gaps_open > 0 ? '\u25CB HAS GAPS' : '\u2713 SOLID';
    console.log(`  ${status.padEnd(14)} ${rule}  (${rd.total} cases)`);

    const details = [];
    if (rd.regressions > 0) details.push(`${rd.regressions} regr`);
    if (rd.gaps_open > 0) details.push(`${rd.gaps_open} gaps open`);
    if (rd.false_blocks > 0) details.push(`${rd.false_blocks} false blocks`);
    if (rd.escapes > 0) details.push(`escapes ${rd.escapes_guarded}/${rd.escapes}`);
    if (rd.gaps_closed > 0) details.push(`${rd.gaps_closed} gaps closed`);
    if (details.length > 0) {
      console.log(`                 ${details.join(' \u00b7 ')}`);
    }
  }

  // 5. PRODUCTION INCIDENTS
  const guardedEscapes = runData.cases.filter(c => c.escape && c.pass);
  if (guardedEscapes.length > 0 || openEscapes.length > 0) {
    console.log('');
    console.log('  PRODUCTION INCIDENTS');
    console.log(thin);
    const allEscapes = runData.cases.filter(c => c.escape);
    for (const e of allEscapes) {
      const mark = e.pass ? '\u2713' : '\u2717';
      const label = e.pass ? 'GUARDED' : 'OPEN';
      console.log(`  ${mark} ${e.id.padEnd(10)} ${label}  ${e.description}`);
    }
  }

  // 6. CLOSED GAPS
  const closedGaps = runData.cases.filter(c => c.known_gap && c.pass);
  if (closedGaps.length > 0) {
    console.log('');
    console.log(`  CLOSED GAPS (${closedGaps.length})`);
    console.log(thin);
    for (const g of closedGaps) {
      console.log(`  \u2713 ${g.id.padEnd(10)} ${g.description}`);
    }
  }

  // 7. VERBOSE — per-case detail
  if (verbose) {
    const byRule = {};
    for (const c of runData.cases) {
      (byRule[c.rule] ??= []).push(c);
    }

    console.log('');
    console.log('  ALL CASES');
    console.log('  \u2713 = correct   \u25CB = known gap   \u2717 = regression');
    console.log(thin);

    for (const [rule, cases] of Object.entries(byRule).sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log('');
      console.log(`  ${rule}`);
      for (const r of cases) {
        const mark = r.pass ? '\u2713' : r.known_gap ? '\u25CB' : '\u2717';
        const badges = [];
        if (r.escape) badges.push('prod');
        if (r.known_gap && !r.pass) badges.push('gap');
        const suffix = badges.length > 0 ? `  [${badges.join(', ')}]` : '';
        console.log(`  ${mark} ${r.id.padEnd(10)} ${r.description}${suffix}`);
      }
    }
  }

  console.log('');
  console.log(sep);
}

// ─── Show baseline ────────────────────────────────────────────────

function handleShowBaseline() {
  const baseline = loadBaseline();
  if (!baseline) {
    console.log('No baseline found. Run with --save to create one.');
    process.exit(0);
  }

  const sep = '\u2550'.repeat(68);
  const thin = '\u2500'.repeat(68);
  const date = baseline.timestamp.slice(0, 10);
  const m = baseline.metrics;

  console.log('');
  console.log(sep);
  console.log(`  ${date} baseline \u00b7 ${baseline.total} cases`);
  console.log(sep);
  console.log('');
  console.log('  CONFIDENCE');
  console.log(thin);
  console.log(`  Gaps        ${pad(m.gaps_closed)} closed   ${pad(m.gaps_open)} open`);
  console.log(`  Escapes     ${pad(m.escapes_guarded)} guarded  ${pad(m.escapes_total - m.escapes_guarded)} unguarded   (${m.escapes_total} total)`);
  console.log(`  Friction    ${pad(m.false_blocks)} false blocks`);
  console.log(`  Stability   ${pad(m.regressions)} regressions`);

  console.log('');
  console.log('  CASES');
  console.log(thin);
  for (const c of baseline.cases) {
    const mark = c.pass ? '\u2713' : c.known_gap ? '\u25CB' : '\u2717';
    console.log(`  ${mark}  ${c.id.padEnd(10)} ${c.description}`);
  }

  console.log('');
  console.log(sep);
}

function pad(n) {
  return String(n).padStart(3);
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

  const sep = '\u2500'.repeat(72);
  console.log('');
  console.log('T1 Hook Eval History');
  console.log(sep);
  console.log('  Date        Gaps   Gaps    Escapes  Escapes  False   Regr-');
  console.log('              open   closed  total    guarded  blocks  essions');
  console.log(sep);

  const byDay = new Map();
  for (const s of summaries) {
    const day = s.timestamp.slice(0, 10);
    byDay.set(day, s);
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

  console.log('');
}

// ─── Main ──────────────────────────────────────────────────────────

if (isHistory) {
  showHistory();
  process.exit(0);
}

if (showBaseline) {
  handleShowBaseline();
  process.exit(0);
}

const allCases = loadCases();
const cases = filterCases(allCases);

if (cases.length === 0) {
  console.log('No eval cases match the filter.');
  process.exit(0);
}

const baseline = loadBaseline();
const results = cases.map(c => runCase(c));
const runData = buildRunData(results);

// Save run to history
const runFile = saveRun(runData);

// Report with baseline comparison
report(runData, baseline);

// Promotion
if (save) {
  promoteBaseline(runData, baseline);
} else if (!baseline) {
  console.log('  no baseline yet \u2014 run with --save to create one');
} else {
  // Quick delta summary
  const cur = runData.metrics;
  const base = baseline.metrics;
  const regressed =
    cur.gaps_open > base.gaps_open ||
    cur.escapes_guarded < base.escapes_guarded ||
    cur.false_blocks > base.false_blocks ||
    cur.regressions > base.regressions;
  const improved =
    cur.gaps_open < base.gaps_open ||
    cur.gaps_closed > base.gaps_closed ||
    cur.escapes_guarded > base.escapes_guarded ||
    cur.false_blocks < base.false_blocks ||
    cur.regressions < base.regressions;

  if (regressed) {
    console.log('  \u2B07 REGRESSED from baseline');
  } else if (improved) {
    console.log('  \u2197 IMPROVED but not saved (run with --save)');
  } else {
    console.log('  \u2194 STABLE \u2014 matches baseline');
  }
}

// Also save legacy NDJSON for --history
saveLegacyMetrics(results, runData.metrics);

console.log(`\n  Run saved: ${runFile}`);
console.log('');

// Exit code: 1 if any regression (non-gap failure)
const exitCode = runData.metrics.regressions > 0 ? 1 : 0;
process.exit(exitCode);

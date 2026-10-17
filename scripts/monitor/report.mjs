#!/usr/bin/env node
/**
 * Rules monitoring report generator.
 * CLI: node scripts/monitor/report.mjs
 * HTML: node scripts/monitor/report.mjs --html
 *
 * When run as a CLI tool, reads from the configured sink and outputs a report.
 * Exports formatCliReport and generateHtmlReport for testing.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ═══════════════════════════════════════════════════════════════════
// ANSI color helpers
// ═══════════════════════════════════════════════════════════════════

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function verdict(metric) {
  if (metric.triggerCount === 0) return 'unused';
  if (metric.blockCount === 0) return 'passive';
  if (metric.fixRate >= 0.7) return 'effective';
  if (metric.fixRate >= 0.3) return 'moderate';
  return 'needs-adjustment';
}

function verdictColor(v) {
  switch (v) {
    case 'effective': return GREEN;
    case 'moderate': return YELLOW;
    case 'needs-adjustment': return RED;
    case 'unused': return RED;
    case 'passive': return DIM;
    default: return RESET;
  }
}

// ═══════════════════════════════════════════════════════════════════
// CLI Report
// ═══════════════════════════════════════════════════════════════════

/**
 * Format a CLI report string.
 * @param {object[]} metrics - From query.getMetrics()
 * @param {string[]} unusedRules - From query.getUnusedRules()
 * @param {{ totalSessions: number, totalEvents: number, avgEventsPerSession: number }} summary
 * @returns {string}
 */
export function formatCliReport(metrics, unusedRules, summary) {
  if (summary.totalEvents === 0) {
    return `\n${DIM}No monitoring data found. Run some rules to generate events.${RESET}\n`;
  }

  const lines = [];

  // Session summary
  lines.push(`\n${BOLD}═══ Rules Monitoring Report ═══${RESET}\n`);
  lines.push(`Sessions: ${summary.totalSessions}  |  Events: ${summary.totalEvents}  |  Avg/session: ${summary.avgEventsPerSession}`);
  lines.push('');

  // Rule effectiveness table
  const header = padRow('Rule ID', 'Tier', 'Triggers', 'Blocks', 'Block%', 'Fixes', 'Fix%', 'Verdict');
  lines.push(`${BOLD}${header}${RESET}`);
  lines.push('─'.repeat(header.length));

  const sorted = [...metrics].sort((a, b) => b.triggerCount - a.triggerCount);
  for (const m of sorted) {
    const v = verdict(m);
    const color = verdictColor(v);
    const row = padRow(
      m.ruleId,
      m.tier,
      String(m.triggerCount),
      String(m.blockCount),
      pct(m.blockRate),
      String(m.fixCount),
      pct(m.fixRate),
      `${color}${v}${RESET}`,
    );
    lines.push(row);
  }

  // Unused rules
  if (unusedRules.length > 0) {
    lines.push('');
    lines.push(`${RED}${BOLD}Unused rules (0 triggers):${RESET}`);
    for (const id of unusedRules) {
      lines.push(`  ${RED}• ${id}${RESET}`);
    }
  }

  // Top blockers
  const blockers = sorted.filter(m => m.blockCount > 0).slice(0, 5);
  if (blockers.length > 0) {
    lines.push('');
    lines.push(`${BOLD}Top blockers:${RESET}`);
    for (const m of blockers) {
      lines.push(`  ${m.blockCount} blocks  ${m.ruleId} (${pct(m.fixRate)} fixed)`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function padRow(...cols) {
  const widths = [30, 4, 8, 6, 6, 5, 5, 20];
  return cols.map((c, i) => c.padEnd(widths[i] || 10)).join('  ');
}

function pct(rate) {
  return `${(rate * 100).toFixed(0)}%`;
}

// ═══════════════════════════════════════════════════════════════════
// HTML Report
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a standalone HTML report.
 * @param {object[]} metrics
 * @param {string[]} unusedRules
 * @param {object} summary
 * @param {object[]} events - Raw events for timeline
 * @returns {string}
 */
export function generateHtmlReport(metrics, unusedRules, summary, events) {
  const sorted = [...metrics].sort((a, b) => b.triggerCount - a.triggerCount);

  const rows = sorted.map(m => {
    const v = verdict(m);
    return `<tr class="${v}">
      <td>${esc(m.ruleId)}</td><td>${esc(m.tier)}</td>
      <td>${m.triggerCount}</td><td>${m.blockCount}</td><td>${pct(m.blockRate)}</td>
      <td>${m.fixCount}</td><td>${pct(m.fixRate)}</td>
      <td><span class="verdict ${v}">${v}</span></td>
    </tr>`;
  }).join('\n');

  const barMax = Math.max(1, ...sorted.map(m => m.triggerCount));
  const bars = sorted.map(m => `
    <div class="bar-row">
      <span class="bar-label">${esc(m.ruleId)}</span>
      <div class="bar-container">
        <div class="bar triggers" style="width:${(m.triggerCount / barMax * 100).toFixed(1)}%"></div>
        <div class="bar blocks" style="width:${(m.blockCount / barMax * 100).toFixed(1)}%"></div>
        <div class="bar fixes" style="width:${(m.fixCount / barMax * 100).toFixed(1)}%"></div>
      </div>
    </div>
  `).join('');

  // Timeline: events per day
  const byDay = {};
  for (const e of events) {
    const day = e.timestamp?.slice(0, 10);
    if (day) byDay[day] = (byDay[day] || 0) + 1;
  }
  const days = Object.keys(byDay).sort();
  const dayMax = Math.max(1, ...Object.values(byDay));
  const timelinePoints = days.map((d, i) => {
    const x = days.length > 1 ? (i / (days.length - 1)) * 580 + 10 : 300;
    const y = 150 - (byDay[d] / dayMax) * 130;
    return `${x},${y}`;
  }).join(' ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rules Monitoring Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 24px; background: #fafafa; color: #1a1a1a; }
  h1 { font-size: 1.5rem; margin-bottom: 8px; }
  .summary { display: flex; gap: 24px; margin: 16px 0; }
  .summary .stat { background: white; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .stat-value { font-size: 1.8rem; font-weight: 700; }
  .stat-label { font-size: 0.85rem; color: #666; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th { background: #f5f5f5; text-align: left; padding: 10px 12px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
  td { padding: 8px 12px; border-top: 1px solid #eee; font-size: 0.85rem; }
  .verdict { padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
  .verdict.effective { background: #dcfce7; color: #166534; }
  .verdict.moderate { background: #fef9c3; color: #854d0e; }
  .verdict.needs-adjustment { background: #fecaca; color: #991b1b; }
  .verdict.unused { background: #fecaca; color: #991b1b; }
  .verdict.passive { background: #f3f4f6; color: #6b7280; }
  .section { margin: 24px 0; }
  .bar-row { display: flex; align-items: center; margin: 4px 0; }
  .bar-label { width: 200px; font-size: 0.8rem; text-align: right; padding-right: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-container { flex: 1; height: 20px; position: relative; }
  .bar { position: absolute; height: 100%; border-radius: 3px; opacity: 0.8; }
  .bar.triggers { background: #93c5fd; }
  .bar.blocks { background: #f87171; }
  .bar.fixes { background: #86efac; }
  .legend { display: flex; gap: 16px; font-size: 0.8rem; margin: 8px 0; }
  .legend span { display: flex; align-items: center; gap: 4px; }
  .legend-dot { width: 12px; height: 12px; border-radius: 3px; }
  svg { width: 100%; }
  .unused-list { list-style: none; padding: 8px 0; }
  .unused-list li { padding: 4px 0; color: #991b1b; font-size: 0.85rem; }
  .unused-list li::before { content: "• "; }
</style>
</head>
<body>
<h1>Rules Monitoring Report</h1>
<p style="color:#666; font-size:0.85rem;">Generated ${new Date().toISOString().slice(0, 19)}</p>

<div class="summary">
  <div class="stat"><div class="stat-value">${summary.totalSessions}</div><div class="stat-label">Sessions</div></div>
  <div class="stat"><div class="stat-value">${summary.totalEvents}</div><div class="stat-label">Events</div></div>
  <div class="stat"><div class="stat-value">${summary.avgEventsPerSession}</div><div class="stat-label">Avg / Session</div></div>
</div>

<div class="section">
<h2 style="font-size:1.1rem; margin-bottom:8px;">Rule Effectiveness</h2>
<table id="rules-table">
  <thead><tr>
    <th>Rule ID</th><th>Tier</th><th>Triggers</th><th>Blocks</th><th>Block%</th><th>Fixes</th><th>Fix%</th><th>Verdict</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>

<div class="section">
<h2 style="font-size:1.1rem; margin-bottom:8px;">Rule Activity</h2>
<div class="legend">
  <span><div class="legend-dot" style="background:#93c5fd"></div> Triggers</span>
  <span><div class="legend-dot" style="background:#f87171"></div> Blocks</span>
  <span><div class="legend-dot" style="background:#86efac"></div> Fixes</span>
</div>
${bars}
</div>

${days.length > 0 ? `
<div class="section">
<h2 style="font-size:1.1rem; margin-bottom:8px;">Events Timeline</h2>
<svg viewBox="0 0 600 160" preserveAspectRatio="xMidYMid meet">
  <polyline points="${timelinePoints}" fill="none" stroke="#6366f1" stroke-width="2"/>
  ${days.map((d, i) => {
    const x = days.length > 1 ? (i / (days.length - 1)) * 580 + 10 : 300;
    const y = 150 - (byDay[d] / dayMax) * 130;
    return `<circle cx="${x}" cy="${y}" r="3" fill="#6366f1"/><text x="${x}" y="158" font-size="8" text-anchor="middle" fill="#999">${d.slice(5)}</text>`;
  }).join('')}
</svg>
</div>` : ''}

${unusedRules.length > 0 ? `
<div class="section">
<h2 style="font-size:1.1rem; margin-bottom:8px; color:#991b1b;">Unused Rules (0 triggers)</h2>
<ul class="unused-list">${unusedRules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
</div>` : ''}

<script>
document.querySelectorAll('#rules-table th').forEach((th, i) => {
  th.addEventListener('click', () => {
    const tbody = th.closest('table').querySelector('tbody');
    const rows = [...tbody.querySelectorAll('tr')];
    const asc = th.dataset.sort !== 'asc';
    th.dataset.sort = asc ? 'asc' : 'desc';
    rows.sort((a, b) => {
      const av = a.children[i].textContent.trim();
      const bv = b.children[i].textContent.trim();
      const an = parseFloat(av), bn = parseFloat(bv);
      if (!isNaN(an) && !isNaN(bn)) return asc ? an - bn : bn - an;
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    rows.forEach(r => tbody.appendChild(r));
  });
});
</script>
</body>
</html>`;
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════
// CLI entrypoint (only when run directly)
// ═══════════════════════════════════════════════════════════════════

const isMainModule = process.argv[1]?.endsWith('report.mjs');
if (isMainModule) {
  const { loadConfig } = await import('./config.mjs');
  const { createNdjsonSink } = await import('./sinks/ndjson.mjs');
  const { createQueryApi } = await import('./query.mjs');
  const { parseEnforcementBlocks, discoverRulesFiles } = await import('../../.claude/hooks/lib/rules.mjs');
  const { readFileSync } = await import('node:fs');

  const projectRoot = process.cwd();
  const config = loadConfig(projectRoot);
  const sink = createNdjsonSink(config);
  const api = createQueryApi(sink);

  // Discover all rule IDs
  let allRuleIds = [];
  try {
    const ruleFiles = discoverRulesFiles(projectRoot);
    for (const file of ruleFiles) {
      const content = readFileSync(file, 'utf-8');
      const { blocks } = parseEnforcementBlocks(content, file);
      allRuleIds.push(...blocks.map(b => b.id));
    }
    allRuleIds = [...new Set(allRuleIds)];
  } catch {
    // Rule discovery failed — proceed without unused-rule detection
  }

  const metrics = api.getMetrics();
  const unusedRules = api.getUnusedRules(allRuleIds);
  const events = api.getEvents({});
  const sessions = new Set(events.map(e => e.sessionId));
  const summary = {
    totalSessions: sessions.size,
    totalEvents: events.length,
    avgEventsPerSession: sessions.size > 0 ? Math.round(events.length / sessions.size) : 0,
  };

  if (process.argv.includes('--html')) {
    const html = generateHtmlReport(metrics, unusedRules, summary, events);
    const outDir = join(projectRoot, config.ndjson.dir);
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, 'report.html');
    writeFileSync(outPath, html);
    console.log(`HTML report written to ${outPath}`);
  } else {
    console.log(formatCliReport(metrics, unusedRules, summary));
  }

  sink.close();
}

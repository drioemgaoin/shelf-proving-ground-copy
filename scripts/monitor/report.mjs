#!/usr/bin/env node
/**
 * Rules monitoring report generator.
 * CLI: node scripts/monitor/report.mjs [--html] [--view=all|implementer|visual-qa|reviewer]
 *
 * Views:
 *   all (default)   — every rule with per-agent breakdown
 *   implementer     — only events from the implementer agent
 *   visual-qa       — only events from visual-qa
 *   reviewer        — only events from the reviewer
 *
 * Exports formatCliReport and generateHtmlReport for testing.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

// Valid view names (null agent events are normalised to 'implementer')
export const VIEWS = ['all', 'implementer', 'visual-qa', 'reviewer'];

// ═══════════════════════════════════════════════════════════════════
// ANSI color helpers
// ═══════════════════════════════════════════════════════════════════

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function verdict(metric) {
  if (metric.triggerCount === 0) return 'untriggered';
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
    case 'untriggered': return RED;
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
 * @param {string} [view='all'] - 'all' | 'implementer' | 'visual-qa' | 'reviewer'
 * @returns {string}
 */
export function formatCliReport(metrics, unusedRules, summary, view = 'all') {
  if (summary.totalEvents === 0) {
    return `\n${DIM}No monitoring data found. Run some rules to generate events.${RESET}\n`;
  }

  const lines = [];

  // Header with active view
  const viewLabel = view === 'all' ? 'All Agents' : view;
  lines.push(`\n${BOLD}═══ Rules Monitoring Report ═══${RESET}  ${CYAN}[view: ${viewLabel}]${RESET}\n`);
  lines.push(`Sessions: ${summary.totalSessions}  |  Events: ${summary.totalEvents}  |  Avg/session: ${summary.avgEventsPerSession}`);
  lines.push('');

  if (view === 'all') {
    // "all" view: include an Agents column showing per-agent trigger counts
    const header = padRow('Rule ID', 'Tier', 'Triggers', 'Blocks', 'Block%', 'Fixes', 'Fix%', 'Agents', 'Verdict');
    lines.push(`${BOLD}${header}${RESET}`);
    lines.push('─'.repeat(header.length));

    const sorted = [...metrics].sort((a, b) => b.triggerCount - a.triggerCount);
    for (const m of sorted) {
      const v = verdict(m);
      const color = verdictColor(v);
      const agentSummary = formatAgentSummary(m.byAgent);
      const row = padRow(
        m.ruleId,
        m.tier,
        String(m.triggerCount),
        String(m.blockCount),
        pct(m.blockRate),
        String(m.fixCount),
        pct(m.fixRate),
        agentSummary,
        `${color}${v}${RESET}`,
      );
      lines.push(row);
    }
  } else {
    // Filtered view: standard table, no Agents column
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
  const sorted = [...metrics].sort((a, b) => b.triggerCount - a.triggerCount);
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

/** Compact per-agent summary: "impl:3 vqa:2 rev:1" */
function formatAgentSummary(byAgent) {
  if (!byAgent || Object.keys(byAgent).length === 0) return '-';
  const abbrev = { implementer: 'impl', 'visual-qa': 'vqa', reviewer: 'rev' };
  return Object.entries(byAgent)
    .sort((a, b) => b[1].triggers - a[1].triggers)
    .map(([agent, counts]) => `${abbrev[agent] || agent}:${counts.triggers}`)
    .join(' ');
}

function padRow(...cols) {
  const widths = [30, 4, 8, 6, 6, 5, 5, 18, 20];
  return cols.map((c, i) => c.padEnd(widths[i] || 10)).join('  ');
}

function pct(rate) {
  return `${(rate * 100).toFixed(0)}%`;
}

// ═══════════════════════════════════════════════════════════════════
// HTML Report
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a standalone HTML report with view tabs.
 * All rules (triggered and untriggered) appear in a single unified table.
 *
 * @param {object[]} metrics - All-view metrics (must include byAgent)
 * @param {string[]} unusedRules
 * @param {object} summary
 * @param {object[]} events - Raw events for timeline
 * @param {object} [perAgentData] - { 'implementer': { metrics, summary }, ... }
 * @param {Map<string, string>} [ruleTierMap] - ruleId → tier from enforcement blocks
 * @returns {string}
 */
export function generateHtmlReport(metrics, unusedRules, summary, events, perAgentData, ruleTierMap) {
  const tierMap = ruleTierMap || new Map();
  const sorted = [...metrics].sort((a, b) => b.triggerCount - a.triggerCount);

  // Build unified metrics: triggered rules + unused rules as zero-count entries
  function buildUnifiedMetrics(activeMetrics, unused, includeAgentSummary) {
    const enriched = activeMetrics.map(m => ({
      ...m,
      ...(includeAgentSummary ? { agentSummary: formatAgentSummaryPlain(m.byAgent) } : {}),
      verdict: verdict(m),
    }));
    // Only rules with actual triggers go to the triggered group
    const triggered = enriched
      .filter(m => m.triggerCount > 0)
      .sort((a, b) => b.triggerCount - a.triggerCount);
    // Merge: metrics with 0 triggers + unused rule IDs (deduplicated)
    const seenIds = new Set(enriched.filter(m => m.triggerCount === 0).map(m => m.ruleId));
    const zeroMetrics = enriched.filter(m => m.triggerCount === 0).map(m => ({
      ...m,
      verdict: 'untriggered',
    }));
    const fromUnused = unused.filter(id => !seenIds.has(id)).map(id => ({
      ruleId: id,
      tier: tierMap.get(id) || '—',
      triggerCount: 0, blockCount: 0, blockRate: 0, fixCount: 0, fixRate: 0,
      byAgent: {},
      ...(includeAgentSummary ? { agentSummary: '-' } : {}),
      verdict: 'untriggered',
    }));
    const untriggered = [...zeroMetrics, ...fromUnused].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
    return { triggered, untriggered };
  }

  // Build view data for client-side tab switching
  const allUnified = buildUnifiedMetrics(sorted, unusedRules, true);
  const totalRules = allUnified.triggered.length + allUnified.untriggered.length;
  const viewData = {
    all: {
      triggered: allUnified.triggered,
      untriggered: allUnified.untriggered,
      summary: { ...summary, totalRules, triggeredRules: allUnified.triggered.length },
    },
  };
  if (perAgentData) {
    for (const [agent, data] of Object.entries(perAgentData)) {
      const agentUnified = buildUnifiedMetrics(data.metrics, data.unusedRules || [], false);
      const agentTotal = agentUnified.triggered.length + agentUnified.untriggered.length;
      viewData[agent] = {
        triggered: agentUnified.triggered,
        untriggered: agentUnified.untriggered,
        summary: { ...data.summary, totalRules: agentTotal, triggeredRules: agentUnified.triggered.length },
      };
    }
  }

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

  // Tab buttons
  const agents = perAgentData ? Object.keys(perAgentData) : [];
  const tabButtons = ['all', ...agents].map(v =>
    `<button class="tab-btn${v === 'all' ? ' active' : ''}" data-view="${esc(v)}">${esc(v === 'all' ? 'All Agents' : v)}</button>`
  ).join('\n    ');

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

  /* Summary cards */
  .summary { display: flex; gap: 16px; margin: 16px 0; flex-wrap: wrap; }
  .summary .stat { background: white; padding: 16px 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); min-width: 120px; }
  .stat-value { font-size: 1.8rem; font-weight: 700; }
  .stat-label { font-size: 0.8rem; color: #666; margin-top: 2px; }
  .stat-value.coverage { color: #4f46e5; }
  .stat-value.attention { color: #dc2626; }

  /* Tabs */
  .tabs { display: flex; gap: 8px; margin: 20px 0 12px; }
  .tab-btn { padding: 6px 16px; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer; font-size: 0.85rem; font-weight: 500; color: #374151; transition: all 0.15s; }
  .tab-btn:hover { background: #f3f4f6; }
  .tab-btn.active { background: #4f46e5; color: white; border-color: #4f46e5; }

  /* Legend bar */
  .legend-bar { display: flex; align-items: center; gap: 20px; margin: 12px 0 4px; padding: 10px 16px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); font-size: 0.8rem; color: #555; }
  .legend-bar .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }

  /* Table */
  table { width: 100%; border-collapse: collapse; margin: 8px 0 24px; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th { background: #f5f5f5; text-align: left; padding: 10px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer; user-select: none; white-space: nowrap; }
  th:hover { background: #ebebeb; }
  td { padding: 8px 12px; border-top: 1px solid #eee; font-size: 0.85rem; }

  /* Group separator row */
  tr.group-separator td { background: #f8fafc; padding: 6px 12px; font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-top: 2px solid #e2e8f0; }

  /* Triggered rows */
  tr.triggered td { }
  tr.triggered:hover td { background: #f8fafc; }

  /* Untriggered rows — visually dimmed */
  tr.untriggered td { color: #9ca3af; background: #fafafa; }
  tr.untriggered:hover td { background: #f3f4f6; }
  tr.untriggered td:first-child { font-style: italic; }

  /* Verdict pills */
  .verdict { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; white-space: nowrap; }
  .verdict.effective { background: #dcfce7; color: #166534; }
  .verdict.moderate { background: #fef9c3; color: #854d0e; }
  .verdict.needs-adjustment { background: #fecaca; color: #991b1b; }
  .verdict.passive { background: #e0e7ff; color: #4338ca; }
  .verdict.untriggered { background: #f1f5f9; color: #94a3b8; border: 1px dashed #cbd5e1; }

  /* Verdict help tooltip */
  .verdict-help { cursor: help; border-bottom: 1px dotted currentColor; }

  /* Agent tags */
  .agent-tag { display: inline-block; padding: 1px 6px; margin: 1px 2px; border-radius: 4px; font-size: 0.72rem; font-weight: 500; }
  .agent-tag.implementer { background: #dbeafe; color: #1e40af; }
  .agent-tag.visual-qa { background: #fce7f3; color: #9d174d; }
  .agent-tag.reviewer { background: #e0e7ff; color: #3730a3; }

  /* Activity bars */
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

  /* Filters */
  .filters { display: flex; gap: 8px; margin: 8px 0; align-items: center; }
  .filter-btn { padding: 4px 12px; border: 1px solid #d1d5db; border-radius: 16px; background: white; cursor: pointer; font-size: 0.78rem; color: #555; transition: all 0.15s; }
  .filter-btn:hover { background: #f3f4f6; }
  .filter-btn.active { background: #1e293b; color: white; border-color: #1e293b; }
  .filter-label { font-size: 0.78rem; color: #888; }
</style>
</head>
<body>
<h1>Rules Monitoring Report</h1>
<p style="color:#666; font-size:0.85rem;">Generated ${new Date().toISOString().slice(0, 19)}</p>

<div class="tabs">
  ${tabButtons}
</div>

<div id="summary-section" class="summary">
  <div class="stat"><div class="stat-value coverage" id="stat-coverage">—</div><div class="stat-label">Coverage (triggered / total)</div></div>
  <div class="stat"><div class="stat-value" id="stat-events">${summary.totalEvents}</div><div class="stat-label">Events</div></div>
  <div class="stat"><div class="stat-value" id="stat-sessions">${summary.totalSessions}</div><div class="stat-label">Sessions</div></div>
  <div class="stat"><div class="stat-value attention" id="stat-attention">—</div><div class="stat-label">Need attention</div></div>
</div>

<div class="legend-bar">
  <strong>Verdicts:</strong>
  <span><span class="swatch" style="background:#dcfce7"></span> <span class="verdict-help" title="Blocks violations AND fixes them automatically (fix rate &ge; 70%)">Effective</span></span>
  <span><span class="swatch" style="background:#fef9c3"></span> <span class="verdict-help" title="Blocks violations but fixes are inconsistent (fix rate 30–70%)">Moderate</span></span>
  <span><span class="swatch" style="background:#fecaca"></span> <span class="verdict-help" title="Blocks violations but rarely fixes them (fix rate &lt; 30%) — agent may need guidance">Needs adjustment</span></span>
  <span><span class="swatch" style="background:#e0e7ff"></span> <span class="verdict-help" title="Triggered and passed — the rule was checked but no violations found">Passive</span></span>
  <span><span class="swatch" style="background:#f1f5f9; border:1px dashed #cbd5e1"></span> <span class="verdict-help" title="Never triggered in any session — either not applicable yet or the hook/agent isn't checking it">Untriggered</span></span>
</div>

<div class="section">
<h2 style="font-size:1.1rem; margin-bottom:4px;">All Rules</h2>
<div class="filters">
  <span class="filter-label">Show:</span>
  <button class="filter-btn active" data-filter="all">All</button>
  <button class="filter-btn" data-filter="triggered">Triggered only</button>
  <button class="filter-btn" data-filter="untriggered">Untriggered only</button>
  <button class="filter-btn" data-filter="attention">Needs attention</button>
</div>
<table id="rules-table">
  <thead><tr id="table-header">
    <th data-col="ruleId">Rule ID</th><th data-col="tier">Tier</th><th data-col="triggers">Triggers</th><th data-col="blocks">Blocks</th><th data-col="blockRate">Block%</th><th data-col="fixes">Fixes</th><th data-col="fixRate">Fix%</th><th id="agents-col" data-col="agents">Agents</th><th data-col="verdict">Status</th>
  </tr></thead>
  <tbody id="table-body"></tbody>
</table>
</div>

<div id="activity-section" class="section">
<h2 style="font-size:1.1rem; margin-bottom:8px;">Rule Activity (triggered rules)</h2>
<div class="legend">
  <span><div class="legend-dot" style="background:#93c5fd"></div> Triggers</span>
  <span><div class="legend-dot" style="background:#f87171"></div> Blocks</span>
  <span><div class="legend-dot" style="background:#86efac"></div> Fixes</span>
</div>
<div id="activity-bars"></div>
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

<script>
const VIEW_DATA = ${JSON.stringify(viewData)};
let currentView = 'all';
let currentFilter = 'all';

const VERDICT_LABELS = {
  'effective':        'Effective',
  'moderate':         'Moderate',
  'needs-adjustment': 'Needs adjustment',
  'passive':          'Passive',
  'untriggered':      'Untriggered',
};

function renderView(view) {
  const data = VIEW_DATA[view];
  if (!data) return;
  currentView = view;

  // Update tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Update summary
  const s = data.summary;
  document.getElementById('stat-coverage').textContent = s.triggeredRules + ' / ' + s.totalRules;
  document.getElementById('stat-events').textContent = s.totalEvents;
  document.getElementById('stat-sessions').textContent = s.totalSessions;

  // Count rules needing attention: needs-adjustment + untriggered
  const needsAttention = data.triggered.filter(m => m.verdict === 'needs-adjustment').length;
  const attentionEl = document.getElementById('stat-attention');
  attentionEl.textContent = needsAttention;
  attentionEl.className = 'stat-value' + (needsAttention > 0 ? ' attention' : '');

  // Show/hide Agents column
  const agentsCol = document.getElementById('agents-col');
  agentsCol.style.display = view === 'all' ? '' : 'none';

  renderTable(data);
  renderBars(data.triggered);
}

function renderTable(data) {
  const tbody = document.getElementById('table-body');
  const showAgents = currentView === 'all';

  // Filter
  let triggered = data.triggered;
  let untriggered = data.untriggered;
  if (currentFilter === 'triggered') { untriggered = []; }
  else if (currentFilter === 'untriggered') { triggered = []; }
  else if (currentFilter === 'attention') {
    triggered = triggered.filter(m => m.verdict === 'needs-adjustment');
    untriggered = [];
  }

  let html = '';

  // Triggered section
  if (triggered.length > 0) {
    const colCount = showAgents ? 9 : 8;
    html += '<tr class="group-separator"><td colspan="' + colCount + '">Triggered (' + triggered.length + ' rules)</td></tr>';
    for (const m of triggered) {
      html += buildRow(m, 'triggered', showAgents);
    }
  }

  // Untriggered section
  if (untriggered.length > 0) {
    const colCount = showAgents ? 9 : 8;
    html += '<tr class="group-separator"><td colspan="' + colCount + '">Untriggered (' + untriggered.length + ' rules)</td></tr>';
    for (const m of untriggered) {
      html += buildRow(m, 'untriggered', showAgents);
    }
  }

  if (!html) {
    const colCount = showAgents ? 9 : 8;
    html = '<tr><td colspan="' + colCount + '" style="text-align:center; color:#999; padding:24px;">No rules match this filter</td></tr>';
  }

  tbody.innerHTML = html;
}

function buildRow(m, rowClass, showAgents) {
  const agentCell = showAgents
    ? '<td>' + formatAgentTags(m.agentSummary || '') + '</td>'
    : '';
  const label = VERDICT_LABELS[m.verdict] || m.verdict;
  return '<tr class="' + rowClass + '">' +
    '<td>' + esc(m.ruleId) + '</td>' +
    '<td>' + esc(m.tier) + '</td>' +
    '<td>' + (m.triggerCount || '—') + '</td>' +
    '<td>' + (m.blockCount || '—') + '</td>' +
    '<td>' + (m.triggerCount > 0 ? pct(m.blockRate) : '—') + '</td>' +
    '<td>' + (m.fixCount || '—') + '</td>' +
    '<td>' + (m.blockCount > 0 ? pct(m.fixRate) : '—') + '</td>' +
    agentCell +
    '<td><span class="verdict ' + m.verdict + '">' + label + '</span></td>' +
    '</tr>';
}

function renderBars(triggered) {
  const container = document.getElementById('activity-bars');
  if (triggered.length === 0) {
    container.innerHTML = '<p style="color:#999; font-size:0.85rem; padding:8px 0;">No triggered rules to display.</p>';
    return;
  }
  const barMax = Math.max(1, ...triggered.map(m => m.triggerCount));
  container.innerHTML = triggered.map(m =>
    '<div class="bar-row">' +
      '<span class="bar-label">' + esc(m.ruleId) + '</span>' +
      '<div class="bar-container">' +
        '<div class="bar triggers" style="width:' + (m.triggerCount / barMax * 100).toFixed(1) + '%"></div>' +
        '<div class="bar blocks" style="width:' + (m.blockCount / barMax * 100).toFixed(1) + '%"></div>' +
        '<div class="bar fixes" style="width:' + (m.fixCount / barMax * 100).toFixed(1) + '%"></div>' +
      '</div>' +
    '</div>'
  ).join('');
}

function formatAgentTags(summary) {
  if (!summary || summary === '-') return '<span style="color:#ccc">—</span>';
  return summary.split(', ').map(part => {
    const [agent, count] = part.split(':');
    const cls = agent === 'impl' ? 'implementer' : agent === 'vqa' ? 'visual-qa' : agent === 'rev' ? 'reviewer' : '';
    return '<span class="agent-tag ' + cls + '">' + agent + ':' + count + '</span>';
  }).join(' ');
}

function pct(rate) { return (rate * 100).toFixed(0) + '%'; }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Tab click handlers
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => renderView(btn.dataset.view));
});

// Filter click handlers
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderTable(VIEW_DATA[currentView]);
  });
});

// Column sorting
document.querySelectorAll('#rules-table th').forEach((th, i) => {
  th.addEventListener('click', () => {
    const tbody = th.closest('table').querySelector('tbody');
    const rows = [...tbody.querySelectorAll('tr:not(.group-separator)')];
    const asc = th.dataset.sort !== 'asc';
    th.dataset.sort = asc ? 'asc' : 'desc';
    rows.sort((a, b) => {
      const av = a.children[i]?.textContent?.trim() ?? '';
      const bv = b.children[i]?.textContent?.trim() ?? '';
      // Treat dashes as -1 so they sort last
      const an = av === '—' ? -1 : parseFloat(av);
      const bn = bv === '—' ? -1 : parseFloat(bv);
      if (!isNaN(an) && !isNaN(bn)) return asc ? an - bn : bn - an;
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    // Remove separators when sorting
    tbody.querySelectorAll('.group-separator').forEach(r => r.remove());
    rows.forEach(r => tbody.appendChild(r));
  });
});

// Initial render
renderView('all');
</script>
</body>
</html>`;
}

/** Plain-text agent summary for JSON embedding: "impl:3, vqa:2, rev:1" */
function formatAgentSummaryPlain(byAgent) {
  if (!byAgent || Object.keys(byAgent).length === 0) return '-';
  const abbrev = { implementer: 'impl', 'visual-qa': 'vqa', reviewer: 'rev' };
  return Object.entries(byAgent)
    .sort((a, b) => b[1].triggers - a[1].triggers)
    .map(([agent, counts]) => `${abbrev[agent] || agent}:${counts.triggers}`)
    .join(', ');
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

  // Parse --view flag
  const viewArg = process.argv.find(a => a.startsWith('--view='));
  const view = viewArg ? viewArg.split('=')[1] : 'all';
  if (!VIEWS.includes(view)) {
    console.error(`Invalid view "${view}". Valid views: ${VIEWS.join(', ')}`);
    process.exit(1);
  }

  // Discover all rule IDs with tier info
  let allRuleIds = [];
  /** @type {Map<string, string>} ruleId → tier */
  const ruleTierMap = new Map();
  try {
    const ruleFiles = discoverRulesFiles(projectRoot);
    for (const file of ruleFiles) {
      const content = readFileSync(file, 'utf-8');
      const { blocks } = parseEnforcementBlocks(content, file);
      for (const b of blocks) {
        if (!ruleTierMap.has(b.id)) {
          ruleTierMap.set(b.id, b.tier);
        }
      }
      allRuleIds.push(...blocks.map(b => b.id));
    }
    allRuleIds = [...new Set(allRuleIds)];
  } catch {
    // Rule discovery failed — proceed without unused-rule detection
  }

  if (view !== 'all') {
    // Filtered view: query only events for this agent
    const metrics = api.getMetrics({ agent: view });
    const unusedRules = api.getUnusedRules(allRuleIds, { agent: view });
    const events = api.getEvents({ agent: view });
    const sessions = new Set(events.map(e => e.sessionId));
    const summary = {
      totalSessions: sessions.size,
      totalEvents: events.length,
      avgEventsPerSession: sessions.size > 0 ? Math.round(events.length / sessions.size) : 0,
    };

    if (process.argv.includes('--html')) {
      const html = generateHtmlReport(metrics, unusedRules, summary, events, undefined, ruleTierMap);
      const outDir = join(projectRoot, config.ndjson.dir);
      mkdirSync(outDir, { recursive: true });
      const outPath = join(outDir, 'report.html');
      writeFileSync(outPath, html);
      console.log(`HTML report written to ${outPath}`);
    } else {
      console.log(formatCliReport(metrics, unusedRules, summary, view));
    }
  } else {
    // "all" view: load everything + per-agent breakdowns
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
      // Build per-agent data for tab switching
      const perAgentData = {};
      for (const agent of ['implementer', 'visual-qa', 'reviewer']) {
        const agentMetrics = api.getMetrics({ agent });
        const agentEvents = api.getEvents({ agent });
        const agentSessions = new Set(agentEvents.map(e => e.sessionId));
        perAgentData[agent] = {
          metrics: agentMetrics,
          unusedRules: api.getUnusedRules(allRuleIds, { agent }),
          summary: {
            totalSessions: agentSessions.size,
            totalEvents: agentEvents.length,
            avgEventsPerSession: agentSessions.size > 0 ? Math.round(agentEvents.length / agentSessions.size) : 0,
          },
        };
      }
      const html = generateHtmlReport(metrics, unusedRules, summary, events, perAgentData, ruleTierMap);
      const outDir = join(projectRoot, config.ndjson.dir);
      mkdirSync(outDir, { recursive: true });
      const outPath = join(outDir, 'report.html');
      writeFileSync(outPath, html);
      console.log(`HTML report written to ${outPath}`);
    } else {
      console.log(formatCliReport(metrics, unusedRules, summary, 'all'));
    }
  }

  sink.close();
}

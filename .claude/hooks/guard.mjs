#!/usr/bin/env node
// PreToolUse hook. Exit 2 blocks the tool call and shows stderr to Claude.
//
// Every session:   no baseline updates; nobody writes the QA report by hand.
// Host (no UI_GUARD): app code is read-only, so implementation goes through Sandcastle.
//                     Opt out for a deliberate manual edit: UI_HOST_LOCK=off claude
// Sandbox (UI_GUARD=afk): the UI contract is read-only (tests, baselines, helpers,
//                     Playwright config, rules, .claude/).
//
// Stops accidents and shortcuts, not a determined adversary. The Stop hook's git
// check and your PR review are the backstop.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const tool = input.tool_name;
const ti = input.tool_input ?? {};
const afk = process.env.UI_GUARD === 'afk';
const hostLock = !afk && process.env.UI_HOST_LOCK !== 'off';
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

const CONTRACT = [
  /^e2e\/acceptance\//,
  /__screenshots__\//,
  /^e2e\/support\//,
  /^playwright\.config\.[cm]?[jt]s$/,
  /^scripts\/ui-qa\//,
  /^\.claude\//,
];
const APP_CODE = new RegExp(process.env.UI_HOST_LOCKED ?? '^src/');
const HOST_ALLOWED = new RegExp(process.env.UI_HOST_ALLOWED ?? '^src/styles/tokens\\.css$');

function block(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

if (tool === 'Bash') {
  const cmd = String(ti.command ?? '');
  if (/playwright|\be2e\b/.test(cmd) && /--update-snapshots|(^|\s)-u(\s|$)/.test(cmd)) {
    block('Baseline updates are human-only. `npm run ui:qa` creates missing baselines; if a screenshot differs, fix the UI or flag the check.');
  }
  if (/\.ui-qa\/report/.test(cmd)) block('.ui-qa/report.json is written only by `npm run ui:qa`.');
  if (afk) {
    // Strip text content so quoted arguments and heredoc bodies don't
    // trigger false positives. Only the structural command is checked.
    // Works for any CLI: bd, gh, git commit -m, jira, custom trackers.
    const structural = cmd
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'[^']*'/g, "''")
      .replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\1/g, '');
    const touches = /__screenshots__|e2e\/acceptance|e2e\/support|playwright\.config|scripts\/ui-qa|\.claude\//.test(structural);
    // Match file-write operations. The > for redirects excludes:
    //   2>&1, >&2  (fd redirects — not file writes)
    //   ->         (arrows in structural text)
    const writes = /(\brm\b|\bmv\b|\bcp\b|\bsed\s+-i|\btee\b|(?<![2&-])>\s*[^>&]|git\s+(rm|checkout|restore|mv|stash))/.test(structural);
    if (touches && writes) {
      block('Locked in the sandbox: acceptance tests, baselines, test helpers, Playwright config, .claude/. If a check looks wrong, comment on the ticket, apply ready-for-human, and stop.');
    }
    // Block throwaway scripts — redirect to test framework.
    // Catches: cat > ./probe.mjs, tee probe.js, echo > check.mjs, etc.
    // Does NOT catch: npm install > log.js (redirect, not script creation)
    const createsScript = /\b(cat|echo)\b.*>\s*\S+\.(mjs|js)\b/.test(cmd)
      || /\btee\b\s+\S+\.(mjs|js)\b/.test(cmd);
    if (createsScript && !/e2e\/agent\//.test(cmd)) {
      block('Standalone scripts are not allowed. Add your experiment as a test in e2e/agent/ (e.g. e2e/agent/pw-facts.spec.ts) and run it with Playwright. The result persists for future agents.');
    }
  }
  process.exit(0);
}

if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  const abs = String(ti.file_path ?? ti.notebook_path ?? '');
  const p = relative(projectDir, abs).replace(/\\/g, '/');

  if (p.startsWith('.ui-qa/')) block('.ui-qa/ is written only by `npm run ui:qa`.');

  // Block standalone scripts outside e2e/agent/ and src/.
  if (afk && /\.(mjs|js)$/.test(p) && !p.startsWith('e2e/agent/') && !p.startsWith('src/') && !p.startsWith('.sandcastle/') && !p.startsWith('scripts/')) {
    block(`Standalone scripts are not allowed: ${p}. Add your experiment as a test in e2e/agent/ (e.g. e2e/agent/pw-facts.spec.ts) and run it with Playwright. The result persists for future agents.`);
  }

  if (afk && CONTRACT.some((r) => r.test(p))) {
    block(`Locked in the sandbox: ${p}. The UI contract can't be changed by the builder. If it looks wrong, comment on the ticket, apply ready-for-human, and stop. Extra tests go in e2e/agent/.`);
  }
  if (hostLock && APP_CODE.test(p) && !HOST_ALLOWED.test(p)) {
    block(`App code is built in Sandcastle, not in this session: ${p}. Turn the work into a ticket (to-tickets, or triage + ui-contract for a bug), then run \`npm run sandcastle\`. For a deliberate manual edit, restart with UI_HOST_LOCK=off.`);
  }
}
process.exit(0);

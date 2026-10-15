#!/usr/bin/env node
/**
 * Prompt expansion pipeline — three-stage sequential expansion that
 * transforms agent prompt templates into fully resolved prompts.
 *
 * Stage 1: {{VAR}} substitution from a whitelist
 * Stage 2: !`cmd` shell command expansion
 * Stage 3: T3 rule payload injection
 *
 * Usage as CLI:
 *   node scripts/expand-prompt.mjs <templatePath> <outputPath> <ticketId> [--var KEY=VALUE]...
 *
 * Usage as library:
 *   import { expandPrompt } from './scripts/expand-prompt.mjs';
 *   expandPrompt({ templatePath, outputPath, vars, ticketId, shellTimeout });
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

// Recognized VAR whitelist — Stage 1 substitutes only these.
// {{T3_VISUAL_CHECKS}} and {{T3_REVIEW_CHECKS}} are reserved for Stage 3.
const STAGE1_WHITELIST = new Set([
  'ISSUE_ID',
  'ISSUE_TITLE',
  'ISSUE_BODY',
  'ISSUE_LABELS',
  'CODEMAP',
  'DIFF_REF',
  'FIX_HISTORY',
]);

const T3_VARS = new Set([
  'T3_VISUAL_CHECKS',
  'T3_REVIEW_CHECKS',
]);

const DEFAULT_SHELL_TIMEOUT = 30_000;

/**
 * Three-stage prompt expansion pipeline.
 *
 * @param {object} options
 * @param {string} options.templatePath - Path to the template file
 * @param {string} options.outputPath   - Where to save the expanded prompt
 * @param {Record<string, string>} options.vars - Key-value pairs for Stage 1
 * @param {string} options.ticketId     - Ticket ID for T3 payload lookup
 * @param {number} [options.shellTimeout] - Shell command timeout in ms
 * @param {string} [options.payloadDir]  - Override T3 payload directory
 * @returns {{ warnings: string[] }} Warnings from shell failures
 */
export function expandPrompt({
  templatePath,
  outputPath,
  vars = {},
  ticketId,
  shellTimeout = DEFAULT_SHELL_TIMEOUT,
  payloadDir,
}) {
  if (!existsSync(templatePath)) {
    process.stderr.write(`expand-prompt: template not found: ${templatePath}\n`);
    process.exit(2);
  }

  const warnings = [];
  let prompt = readFileSync(templatePath, 'utf8');

  // ── Stage 1: {{VAR}} substitution ──
  // Only recognized whitelist vars are substituted.
  // T3 vars and unrecognized vars are left as literal text.
  prompt = prompt.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (match, key) => {
      if (T3_VARS.has(key)) return match; // reserved for Stage 3
      if (STAGE1_WHITELIST.has(key) && key in vars) return vars[key];
      return match; // unrecognized → literal
    },
  );

  // ── Stage 2: !`cmd` shell expansion ──
  // To prevent Stage 3 from re-expanding T3 vars that appear in shell output,
  // we split the prompt on shell commands, expand each command, and tag
  // shell-produced segments so Stage 3 skips them.
  //
  // Implementation: split into segments (template text vs shell output),
  // apply Stage 3 only to template-text segments.
  const shellPattern = /!`([^`]+)`/g;
  const segments = [];
  let lastIndex = 0;
  let shellMatch;

  while ((shellMatch = shellPattern.exec(prompt)) !== null) {
    // Template text before this shell command
    if (shellMatch.index > lastIndex) {
      segments.push({ text: prompt.slice(lastIndex, shellMatch.index), fromShell: false });
    }

    // Execute the shell command
    const cmd = shellMatch[1];
    try {
      const output = execSync(cmd, { encoding: 'utf8', timeout: shellTimeout }).trimEnd();
      segments.push({ text: output, fromShell: true });
    } catch (err) {
      const msg = `shell expansion failed (${err.status ?? 'timeout'}): ${cmd}`;
      warnings.push(msg);
      process.stderr.write(`expand-prompt: warning: ${msg}\n`);
      segments.push({ text: '', fromShell: true });
    }

    lastIndex = shellMatch.index + shellMatch[0].length;
  }

  // Remaining template text after the last shell command
  if (lastIndex < prompt.length) {
    segments.push({ text: prompt.slice(lastIndex), fromShell: false });
  }

  // ── Stage 3: T3 rule payload injection ──
  // Only replace T3 vars in template-text segments, not in shell output.
  const effectivePayloadDir = payloadDir
    ?? join('.sandcastle', 'payloads', ticketId ?? '');

  const t3Visual = loadT3Payload(effectivePayloadDir, 'visual-qa');
  const t3Review = loadT3Payload(effectivePayloadDir, 'reviewer');

  prompt = segments.map((seg) => {
    if (seg.fromShell) return seg.text;
    let text = seg.text;
    text = text.replace(/\{\{\s*T3_VISUAL_CHECKS\s*\}\}/g, t3Visual);
    text = text.replace(/\{\{\s*T3_REVIEW_CHECKS\s*\}\}/g, t3Review);
    return text;
  }).join('');

  // ── Save expanded prompt ──
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, prompt);

  return { warnings };
}

/**
 * Load T3 payload files for a given agent from the payload directory.
 * Returns concatenated content, or empty string if no payloads exist.
 */
function loadT3Payload(payloadDir, agentPrefix) {
  if (!existsSync(payloadDir)) return '';

  try {
    const files = readdirSync(payloadDir)
      .filter((f) => f.startsWith(agentPrefix) && f.endsWith('.md'))
      .sort();

    if (files.length === 0) return '';

    return files
      .map((f) => readFileSync(join(payloadDir, f), 'utf8'))
      .join('\n\n');
  } catch {
    return '';
  }
}

/**
 * Collect {{FIX_HISTORY}} from git log.
 */
export function collectFixHistory(gateStartHead) {
  try {
    return execSync(
      `git log --oneline --grep="^fix(" ${gateStartHead}..HEAD`,
      { encoding: 'utf8' },
    ).trimEnd();
  } catch {
    return '';
  }
}

// ── CLI entry point ──
const isDirectRun = process.argv[1]?.endsWith('expand-prompt.mjs');
if (isDirectRun) {
  const args = process.argv.slice(2);
  const varArgs = args.filter((a) => a.startsWith('--var='));
  const positional = args.filter((a) => !a.startsWith('--'));
  const timeoutArg = args.find((a) => a.startsWith('--timeout='));

  const [templatePath, outputPath, ticketId] = positional;

  if (!templatePath || !outputPath) {
    process.stderr.write('usage: node expand-prompt.mjs <template> <output> [ticketId] [--var KEY=VALUE]...\n');
    process.exit(2);
  }

  const vars = {};
  for (const v of varArgs) {
    const eq = v.indexOf('=', 6); // after "--var="
    if (eq > 6) {
      vars[v.slice(6, eq)] = v.slice(eq + 1);
    }
  }

  const shellTimeout = timeoutArg
    ? parseInt(timeoutArg.split('=')[1], 10)
    : DEFAULT_SHELL_TIMEOUT;

  const { warnings } = expandPrompt({
    templatePath,
    outputPath,
    vars,
    ticketId: ticketId ?? '',
    shellTimeout,
  });

  if (warnings.length > 0) {
    process.stderr.write(`expand-prompt: ${warnings.length} warning(s)\n`);
  }
}

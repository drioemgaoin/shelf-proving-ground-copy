// QA gate infrastructure — the generic gate runner and its helpers.
//
// A Gate is a data descriptor: who checks, who fixes, how to build args.
// runGateLoop() drives the check → fix cycle for any gate type.

import * as sandcastle from "@ai-hero/sandcastle";
import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { log } from "./logging.mjs";
import { createLogFormatter } from "./log-formatter.mjs";
import { expandAndSave } from "./prompt.mjs";
import { timedSandboxRun, type TaggedAgent } from "./tagged-agent.mjs";
import {
  LABEL_TASK_COMMAND,
  COMMENT_TASK_COMMAND,
} from "../config/tracker.mjs";
import { MAX_GATE_ROUNDS, MAX_FIXER_PASSES, BATCH_SIZE } from "../config/constants.mjs";
import {
  parseAllFindings,
  countFindings,
  chunkFindings,
  matchFailuresToFindings,
  formatFindings,
  parseVerificationFailures,
  mergeFindings as mergeFindingsFromCheckers,
} from "./findings.mjs";

// ---------------------------------------------------------------------------
// Gate descriptor
// ---------------------------------------------------------------------------

export interface Gate {
  /** Human-readable name for logs (e.g. "Visual QA", "Code review"). */
  name: string;
  /** Agent that evaluates the work. */
  checker: TaggedAgent;
  /** Agent that applies fixes. */
  fixer: TaggedAgent;
  /** Max iterations for the checker agent. */
  checkerMaxIterations: number;
  /** Max iterations for the fixer agent. */
  fixerMaxIterations: number;
  /** The word that signals a clean pass (e.g. "PASS", "CLEAN"). */
  passWord: string;
  /** Path to the findings file relative to the worktree, per round. */
  findingsFile: (round: number) => string;
  /** Prompt template path for the checker. */
  checkerPromptFile: string;
  /** Prompt template path for the fixer. */
  fixerPromptFile: string;
  /** Build prompt args for the checker. */
  buildCheckerArgs: (round: number, context: GateContext) => Record<string, string>;
  /** Build prompt args for the fixer. */
  buildFixerArgs: (round: number, context: GateContext) => Record<string, string>;
  /** Optional hook before each checker run (e.g. archive test results). */
  beforeCheck?: (round: number, context: GateContext) => void;
  /** Optional hook before each fixer run. */
  beforeFix?: (round: number, context: GateContext) => void;
  /** Optional hook after each fixer run (e.g. capture fix history). */
  afterFix?: (round: number, context: GateContext) => void;
  /** Optional oscillation detector. Return true to break the loop. */
  detectOscillation?: (round: number, context: GateContext) => boolean;
  /** Whether this gate needs a dev server running. */
  requiresDevServer?: boolean;
}

export interface GateContext {
  issueId: string;
  branch: string;
  worktree: string;
  sandbox: sandcastle.Sandbox;
  /** Mutable state the gate hooks can read/write between rounds. */
  state: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Gate runner
// ---------------------------------------------------------------------------

export async function runGateLoop(
  gate: Gate,
  ctx: GateContext,
  verbose: boolean,
): Promise<boolean> {
  try {
    for (let round = 1; round <= MAX_GATE_ROUNDS; round++) {
      const findingsFile = gate.findingsFile(round);
      const findingsPath = `${ctx.worktree}/${findingsFile}`;

      log(`  ${gate.name} round ${round}/${MAX_GATE_ROUNDS} for ${ctx.issueId}...`);

      // --- Checker ---
      gate.beforeCheck?.(round, ctx);
      const checkerArgs = gate.buildCheckerArgs(round, ctx);
      const checkerLogName = `${slugify(gate.name)}-r${round}`;
      const checkerExpandedPath = promptPath(checkerLogName, ctx.issueId);
      expandAndSave(gate.checkerPromptFile, checkerArgs, checkerExpandedPath, { ticketId: ctx.issueId });
      await timedSandboxRun(`${gate.name} [${ctx.issueId}] r${round}`, gate.checker, ctx.sandbox, {
        name: checkerLogName,
        maxIterations: gate.checkerMaxIterations,
        logging: gateLoggingConfig(checkerLogName, ctx.issueId),
        promptFile: `./${checkerExpandedPath}`,
        promptArgs: {},
      });

      // --- Evaluate result ---
      if (isClean(findingsPath, gate.passWord)) {
        log(`  ${gate.name} clean for ${ctx.issueId} after ${round} round(s).`);
        return false;
      }

      if (isClean(findingsPath, "DEFER")) {
        log(`  ${gate.name} deferred for ${ctx.issueId}. Escalating.`);
        escalate(ctx.issueId, `${gate.name} found only deferred issues.`);
        return true;
      }

      if (round === MAX_GATE_ROUNDS) {
        log(`  ${gate.name} still failing. Escalating ${ctx.issueId}.`);
        escalate(ctx.issueId, `${gate.name} loop exhausted after ${MAX_GATE_ROUNDS} rounds.`);
        return true;
      }

      if (gate.detectOscillation?.(round, ctx)) {
        log(`  Oscillation detected for ${ctx.issueId} at round ${round}. Escalating.`);
        escalate(
          ctx.issueId,
          `${gate.name} oscillation at round ${round}: findings re-target locations from round ${round - 1}. Needs human tiebreak.`,
        );
        return true;
      }

      // --- Fixer ---
      log(`  ${gate.name} findings detected. Fixer starting...`);
      gate.beforeFix?.(round, ctx);
      const fixerArgs = gate.buildFixerArgs(round, ctx);
      const fixerLogName = `${slugify(gate.name)}-fixer-r${round}`;
      const fixerExpandedPath = promptPath(fixerLogName, ctx.issueId);
      expandAndSave(gate.fixerPromptFile, fixerArgs, fixerExpandedPath);
      await timedSandboxRun(`${gate.name}-Fixer [${ctx.issueId}] r${round}`, gate.fixer, ctx.sandbox, {
        name: fixerLogName,
        maxIterations: gate.fixerMaxIterations,
        logging: gateLoggingConfig(fixerLogName, ctx.issueId),
        promptFile: `./${fixerExpandedPath}`,
        promptArgs: {},
      });
      gate.afterFix?.(round, ctx);
    }
    return false;
  } finally {
    // Always restore rules regardless of exit path (clean, escalation, error).
  }
}

// ---------------------------------------------------------------------------
// Checker result (returned by parallel checkers for merging)
// ---------------------------------------------------------------------------

interface CheckerResult {
  gateName: string;
  clean: boolean;
  deferred: boolean;
  findings: Array<{ file: string; line: number; fix: string; source: string }>;
  findingsContent: string;
}

// ---------------------------------------------------------------------------
// Unified fixer config
// ---------------------------------------------------------------------------

export interface UnifiedFixerConfig {
  agent: TaggedAgent;
  maxIterations: number;
  verifyCommand: string;
  promptFile: string;
  buildArgs: (round: number, ctx: GateContext, findingsFile: string) => Record<string, string>;
}

// ---------------------------------------------------------------------------
// Unified gate loop — parallel checkers + verified fixer
// ---------------------------------------------------------------------------

/**
 * Run a single checker gate and return a CheckerResult.
 * This is the check-only half of the old runGateLoop — no fixer.
 */
async function runChecker(
  gate: Gate,
  round: number,
  ctx: GateContext,
  verbose: boolean,
): Promise<CheckerResult> {
  const findingsFile = gate.findingsFile(round);
  const findingsPath = `${ctx.worktree}/${findingsFile}`;

  log(`  ${gate.name} checker round ${round} for ${ctx.issueId}...`);

  gate.beforeCheck?.(round, ctx);
  const checkerArgs = gate.buildCheckerArgs(round, ctx);
  const checkerLogName = `${slugify(gate.name)}-r${round}`;
  const checkerExpandedPath = promptPath(checkerLogName, ctx.issueId);
  expandAndSave(gate.checkerPromptFile, checkerArgs, checkerExpandedPath, { ticketId: ctx.issueId });
  await timedSandboxRun(`${gate.name} [${ctx.issueId}] r${round}`, gate.checker, ctx.sandbox, {
    name: checkerLogName,
    maxIterations: gate.checkerMaxIterations,
    logging: gateLoggingConfig(checkerLogName, ctx.issueId),
    promptFile: `./${checkerExpandedPath}`,
    promptArgs: {},
  });

  // Parse result
  const clean = isClean(findingsPath, gate.passWord);
  const deferred = isClean(findingsPath, "DEFER");
  const findingsContent = existsSync(findingsPath)
    ? readFileSync(findingsPath, "utf8")
    : "";

  // Parse structured findings for conflict detection
  const findings = clean || deferred
    ? []
    : (parseAllFindings(findingsContent) as any[]).map((f: any) => ({ ...f, source: gate.name }));

  return {
    gateName: gate.name,
    clean,
    deferred,
    findings,
    findingsContent,
  };
}

/**
 * Verification: run typecheck + lint + tests and return structured failures.
 *
 * Runs inside the sandbox (Docker) via sandbox.exec() — NOT on the host.
 * The worktree's node_modules is a symlink to /warm/node_modules which only
 * exists inside Docker; host-side execSync would crash with ENOTDIR.
 */
async function runVerification(
  verifyCommand: string,
  ctx: GateContext,
): Promise<Array<{ file: string; line: number; message: string }>> {
  const result = await ctx.sandbox.exec(verifyCommand);
  if (result.exitCode === 0) return [];
  return parseVerificationFailures((result.stdout ?? "") + (result.stderr ?? ""));
}

/**
 * Verified fixer with shrinking backlog.
 * Runs the fixer in batches, verifies after each pass, and feeds
 * remaining findings back until clean or stuck.
 */
export async function runVerifiedFixer(
  fixer: UnifiedFixerConfig,
  findings: string,
  round: number,
  ctx: GateContext,
  verbose: boolean,
): Promise<void> {
  let currentFindings = findings;
  let remainingCount = countFindings(currentFindings);

  for (let pass = 1; pass <= MAX_FIXER_PASSES; pass++) {
    log(`  Fixer pass ${pass}/${MAX_FIXER_PASSES}: ${remainingCount} findings`);

    // Batch if too many for one context window
    const batches = remainingCount > BATCH_SIZE
      ? chunkFindings(currentFindings, BATCH_SIZE)
      : [currentFindings];

    for (let i = 0; i < batches.length; i++) {
      const batchFile = `.qa/unified-r${round}-p${pass}-b${i + 1}.md`;
      writeFileSync(`${ctx.worktree}/${batchFile}`, batches[i]);

      const args = fixer.buildArgs(round, ctx, batchFile);
      const logName = `fixer-r${round}-p${pass}-b${i + 1}`;
      const expandedPath = promptPath(logName, ctx.issueId);
      expandAndSave(fixer.promptFile, args, expandedPath);

      await timedSandboxRun(
        `Fixer [${ctx.issueId}] r${round} p${pass} b${i + 1}`,
        fixer.agent, ctx.sandbox,
        {
          name: logName,
          maxIterations: fixer.maxIterations,
          logging: gateLoggingConfig(logName, ctx.issueId),
          promptFile: `./${expandedPath}`,
          promptArgs: {},
        },
      );
    }

    // Verify: what's still broken?
    const failures = await runVerification(fixer.verifyCommand, ctx);
    if (failures.length === 0) {
      log(`  All findings fixed after pass ${pass}.`);
      return;
    }

    // Match failures back to original findings
    const remaining = matchFailuresToFindings(failures, currentFindings);
    log(`  ${remaining.length} findings remain (was ${remainingCount}).`);

    // Progress check: backlog MUST shrink
    if (remaining.length >= remainingCount) {
      escalate(ctx.issueId,
        `Fixer stuck: ${remaining.length} findings remain after pass ${pass}. ` +
        `No progress since last pass (was ${remainingCount}). Needs human review.`);
      return;
    }

    remainingCount = remaining.length;
    currentFindings = formatFindings(remaining);
  }

  // Exhausted all passes
  if (remainingCount > 0) {
    escalate(ctx.issueId,
      `Fixer exhausted: ${remainingCount} findings remain after ${MAX_FIXER_PASSES} passes.`);
  }
}

/**
 * Unified gate loop: run all checkers in parallel, merge findings,
 * then run verified fixer.
 */
export async function runUnifiedGateLoop(
  checkers: Gate[],
  fixer: UnifiedFixerConfig,
  ctx: GateContext,
  verbose: boolean,
): Promise<boolean> {
  try {
    for (let round = 1; round <= MAX_GATE_ROUNDS; round++) {
      // 1. Run all checkers in parallel
      const results = await Promise.all(
        checkers.map(gate => runChecker(gate, round, ctx, verbose))
      );

      // 2. All clean → done
      if (results.every(r => r.clean)) {
        log(`  All checkers clean for ${ctx.issueId} after ${round} round(s).`);
        return false;
      }

      // 3. Any deferred → escalate
      if (results.some(r => r.deferred)) {
        escalate(ctx.issueId,
          `Deferred findings from: ${results.filter(r => r.deferred).map(r => r.gateName).join(", ")}`);
        return true;
      }

      // 4. Last round → escalate
      if (round === MAX_GATE_ROUNDS) {
        escalate(ctx.issueId,
          `Unified gate loop exhausted after ${MAX_GATE_ROUNDS} rounds.`);
        return true;
      }

      // 5. Cross-checker oscillation
      if (round >= 2) {
        const prevPath = `${ctx.worktree}/.qa/unified-r${round - 1}.md`;
        const currContent = results.map(r => r.findingsContent).join("\n");
        if (existsSync(prevPath) &&
            findingsOverlap(readFileSync(prevPath, "utf8"), currContent)) {
          escalate(ctx.issueId,
            `Cross-checker oscillation at round ${round}.`);
          return true;
        }
      }

      // 6. Merge findings with conflict detection
      const { mergedContent, conflicts } = mergeFindingsFromCheckers(results);
      const mergedPath = `${ctx.worktree}/.qa/unified-r${round}.md`;
      writeFileSync(mergedPath, mergedContent);

      if (conflicts.length > 0) {
        escalate(ctx.issueId,
          `Checker conflict on ${conflicts.length} location(s): ` +
          `${conflicts.map(c => c.location).join(", ")}. Needs human tiebreak.`);
        return true;
      }

      // 7. Pre-fix hooks (e.g. capture branch HEAD for diff narrowing)
      for (const gate of checkers) gate.beforeFix?.(round, ctx);

      // 8. Verified fixer with shrinking backlog
      await runVerifiedFixer(fixer, mergedContent, round, ctx, verbose);

      // 9. After-fix hooks
      for (const gate of checkers) gate.afterFix?.(round, ctx);
    }
    return false;
  } finally {
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isClean(path: string, passWord: string): boolean {
  if (!existsSync(path)) return true;
  return readFileSync(path, "utf8").trim().startsWith(passWord);
}

export function setPhase(worktree: string, phase: string): void {
  writeFileSync(join(worktree, ".sandcastle-phase"), phase);
}

export function archiveTestResults(worktree: string, label: string): void {
  const src = join(worktree, "test-results");
  if (!existsSync(src)) return;
  try {
    if (readdirSync(src).length === 0) return;
  } catch {
    return;
  }
  const dest = join(worktree, `test-results-${label}`);
  execSync(`mv ${JSON.stringify(src)} ${JSON.stringify(dest)}`);
}

/** Escape a string for safe interpolation inside double-quoted shell arguments. */
function shellEscapeDoubleQuoted(s: string): string {
  return s.replace(/[\\"`$!]/g, "\\$&");
}

export function escalate(issueId: string, reason: string): void {
  execSync(LABEL_TASK_COMMAND.replace("<ID>", issueId));
  const safeComment = shellEscapeDoubleQuoted(`${reason} Needs human review.`);
  execSync(
    COMMENT_TASK_COMMAND.replace("<ID>", issueId).replace(
      "<COMMENT>",
      safeComment,
    ),
  );
}

/**
 * Detect review oscillation: if two consecutive rounds raise the same
 * finding (same file AND similar description), the reviewer and fixer
 * are fighting. A new finding in the same file is NOT oscillation.
 */
export function findingsOverlap(prev: string, curr: string): boolean {
  interface Finding {
    file: string;
    desc: string;
  }
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const similarity = (a: string, b: string): number => {
    const setA = new Set(a.split(" ").filter((w) => w.length > 2));
    const setB = new Set(b.split(" ").filter((w) => w.length > 2));
    if (setA.size === 0 || setB.size === 0) return 0;
    let overlap = 0;
    for (const w of setA) {
      if (setB.has(w)) overlap++;
    }
    return overlap / Math.min(setA.size, setB.size);
  };
  const extract = (text: string): Finding[] => {
    const findings: Finding[] = [];
    for (const m of text.matchAll(
      /^- `?(src\/[^\s:]+)[:\s\d-]*\s*[—–-]\s*(.+)/gm,
    )) {
      findings.push({ file: m[1], desc: normalize(m[2]) });
    }
    return findings;
  };

  const prevFindings = extract(prev);
  const currFindings = extract(curr);
  let matches = 0;
  for (const cf of currFindings) {
    for (const pf of prevFindings) {
      if (cf.file === pf.file && similarity(cf.desc, pf.desc) > 0.5) {
        matches++;
        break;
      }
    }
  }
  return currFindings.length > 0 && matches / currFindings.length > 0.5;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function logFilePath(name: string, issueId: string): string {
  return `.sandcastle/logs/${issueId}/${name}.log`;
}

function gateLoggingConfig(name: string, issueId: string) {
  const path = logFilePath(name, issueId);
  // Formatter owns the log; display layer → /dev/null to avoid
  // untimestamped duplicates (see loggingConfig in phases.mts).
  return {
    type: "file" as const,
    path: "/dev/null",
    onAgentStreamEvent: createLogFormatter(path),
  };
}

function promptPath(name: string, issueId: string): string {
  return `.sandcastle/logs/${issueId}/${name}.prompt.md`;
}

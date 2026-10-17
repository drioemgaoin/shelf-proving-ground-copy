// QA gate infrastructure — the generic gate runner and its helpers.
//
// A Gate is a data descriptor: who checks, who fixes, how to build args.
// runGateLoop() drives the check → fix cycle for any gate type.

import * as sandcastle from "@ai-hero/sandcastle";
import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { log } from "./logging.mjs";
import { expandAndSave } from "./prompt.mjs";
import { setRulesVisible } from "./sandbox.mjs";
import { timedSandboxRun, type TaggedAgent } from "./tagged-agent.mjs";
import {
  LABEL_TASK_COMMAND,
  COMMENT_TASK_COMMAND,
} from "../config/tracker.mjs";
import { MAX_GATE_ROUNDS } from "../config/constants.mjs";

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
  for (let round = 1; round <= MAX_GATE_ROUNDS; round++) {
    const findingsFile = gate.findingsFile(round);
    const findingsPath = `${ctx.worktree}/${findingsFile}`;

    log(`  ${gate.name} round ${round}/${MAX_GATE_ROUNDS} for ${ctx.issueId}...`);

    // --- Checker ---
    setRulesVisible(ctx.worktree, false);
    gate.beforeCheck?.(round, ctx);
    const checkerArgs = gate.buildCheckerArgs(round, ctx);
    const checkerLogName = `${slugify(gate.name)}-r${round}`;
    const checkerExpandedPath = promptPath(checkerLogName, ctx.issueId);
    expandAndSave(gate.checkerPromptFile, checkerArgs, checkerExpandedPath, { ticketId: ctx.issueId });
    await timedSandboxRun(`${gate.name} [${ctx.issueId}] r${round}`, gate.checker, ctx.sandbox, {
      name: checkerLogName,
      maxIterations: gate.checkerMaxIterations,
      logging: verbose
        ? { type: "file", verbose: true, path: logFilePath(checkerLogName, ctx.issueId) }
        : undefined,
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
    setRulesVisible(ctx.worktree, true);
    gate.beforeFix?.(round, ctx);
    const fixerArgs = gate.buildFixerArgs(round, ctx);
    const fixerLogName = `${slugify(gate.name)}-fixer-r${round}`;
    const fixerExpandedPath = promptPath(fixerLogName, ctx.issueId);
    expandAndSave(gate.fixerPromptFile, fixerArgs, fixerExpandedPath);
    await timedSandboxRun(`${gate.name}-Fixer [${ctx.issueId}] r${round}`, gate.fixer, ctx.sandbox, {
      name: fixerLogName,
      maxIterations: gate.fixerMaxIterations,
      logging: verbose
        ? { type: "file", verbose: true, path: logFilePath(fixerLogName, ctx.issueId) }
        : undefined,
      promptFile: `./${fixerExpandedPath}`,
      promptArgs: {},
    });
    gate.afterFix?.(round, ctx);
  }
  return false;
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

// setRulesVisible lives in sandbox.mts — single source of truth for both
// host-side worktree renames (used here) and hook-level commands (planner/merger).

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

function promptPath(name: string, issueId: string): string {
  return `.sandcastle/logs/${issueId}/${name}.prompt.md`;
}

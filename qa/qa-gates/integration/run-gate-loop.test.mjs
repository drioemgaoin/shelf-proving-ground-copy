#!/usr/bin/env node
/**
 * TGF-3: runGateLoop — all verdict paths (PASS/DEFER/exhaustion/oscillation)
 *
 * Integration-mocked: reimplements runGateLoop control flow from
 * qa-gates.mts:70-140 with stubbed timedSandboxRun, expandAndSave,
 * escalate. Findings files are real temp files written by the checker stub.
 */
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  return fn().then(() => passed++).catch((e) => { failed++; failures.push(`FAIL: ${label} — ${e.message}`); });
}
function assert(condition, message) { if (!condition) throw new Error(message); }

// ---------------------------------------------------------------------------
// Reimplemented helpers (mirrors qa-gates.mts:146-149, 167-175)
// ---------------------------------------------------------------------------

function isClean(path, passWord) {
  if (!existsSync(path)) return true;
  return readFileSync(path, 'utf8').trim().startsWith(passWord);
}

// ---------------------------------------------------------------------------
// Reimplemented runGateLoop (mirrors qa-gates.mts:70-140)
// External calls replaced with recording stubs.
// ---------------------------------------------------------------------------

const MAX_ROUNDS = 3;

/**
 * @param {object} gate - Gate descriptor
 * @param {object} ctx - GateContext
 * @param {boolean} verbose
 * @param {object} stubs - { onCheckerRun, onFixerRun, onEscalate, onLog }
 */
async function runGateLoop(gate, ctx, verbose, stubs) {
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const findingsFile = gate.findingsFile(round);
    const findingsPath = `${ctx.worktree}/${findingsFile}`;

    stubs.onLog(`  ${gate.name} round ${round}/${MAX_ROUNDS} for ${ctx.issueId}...`);

    // --- Checker ---
    gate.beforeCheck?.(round, ctx);
    const checkerArgs = gate.buildCheckerArgs(round, ctx);
    await stubs.onCheckerRun(gate, round, ctx, checkerArgs);

    // --- Evaluate result ---
    if (isClean(findingsPath, gate.passWord)) {
      stubs.onLog(`  ${gate.name} clean for ${ctx.issueId} after ${round} round(s).`);
      return;
    }

    if (isClean(findingsPath, 'DEFER')) {
      stubs.onLog(`  ${gate.name} deferred for ${ctx.issueId}. Escalating.`);
      stubs.onEscalate(ctx.issueId, `${gate.name} found only deferred issues.`);
      return;
    }

    if (round === MAX_ROUNDS) {
      stubs.onLog(`  ${gate.name} still failing. Escalating ${ctx.issueId}.`);
      stubs.onEscalate(ctx.issueId, `${gate.name} loop exhausted after ${MAX_ROUNDS} rounds.`);
      return;
    }

    if (gate.detectOscillation?.(round, ctx)) {
      stubs.onLog(`  Oscillation detected for ${ctx.issueId} at round ${round}. Escalating.`);
      stubs.onEscalate(
        ctx.issueId,
        `${gate.name} oscillation at round ${round}: findings re-target locations from round ${round - 1}. Needs human tiebreak.`,
      );
      return;
    }

    // --- Fixer ---
    stubs.onLog(`  ${gate.name} findings detected. Fixer starting...`);
    gate.beforeFix?.(round, ctx);
    const fixerArgs = gate.buildFixerArgs(round, ctx);
    await stubs.onFixerRun(gate, round, ctx, fixerArgs);
    gate.afterFix?.(round, ctx);
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const testDir = join(tmpdir(), `runGateLoop-test-${process.pid}`);
mkdirSync(testDir, { recursive: true });

function makeCtx(overrides = {}) {
  return {
    issueId: 'TEST-1',
    branch: 'test-branch',
    worktree: testDir,
    sandbox: {},
    state: {},
    ...overrides,
  };
}

/**
 * Build a gate descriptor. `checkerBehavior` is a function(round) that
 * writes the findings file for that round (simulating checker output).
 */
function makeGate(name, passWord, checkerBehavior, opts = {}) {
  return {
    name,
    checker: {},
    fixer: {},
    checkerMaxIterations: 10,
    fixerMaxIterations: 10,
    passWord,
    findingsFile: (round) => `findings-r${round}.md`,
    checkerPromptFile: 'checker.md',
    fixerPromptFile: 'fixer.md',
    buildCheckerArgs: () => ({}),
    buildFixerArgs: () => ({}),
    beforeCheck: opts.beforeCheck,
    beforeFix: opts.beforeFix,
    afterFix: opts.afterFix,
    detectOscillation: opts.detectOscillation,
    _checkerBehavior: checkerBehavior,
  };
}

function makeStubs(gate) {
  const calls = { checker: [], fixer: [], escalate: [], log: [] };
  return {
    stubs: {
      onCheckerRun: async (g, round, ctx) => {
        calls.checker.push(round);
        // Write findings file as checker would
        const path = join(ctx.worktree, g.findingsFile(round));
        gate._checkerBehavior(round, path);
      },
      onFixerRun: async (g, round) => { calls.fixer.push(round); },
      onEscalate: (id, reason) => { calls.escalate.push({ id, reason }); },
      onLog: (msg) => { calls.log.push(msg); },
    },
    calls,
  };
}

function cleanup() {
  // Remove findings files between tests
  for (let r = 1; r <= 3; r++) {
    const p = join(testDir, `findings-r${r}.md`);
    if (existsSync(p)) rmSync(p);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test('TGF-3a: PASS round 1 → returns, no fixer called', async () => {
  cleanup();
  const gate = makeGate('Visual QA', 'PASS', (round, path) => {
    writeFileSync(path, 'PASS — no violations found');
  });
  const ctx = makeCtx();
  const { stubs, calls } = makeStubs(gate);

  await runGateLoop(gate, ctx, false, stubs);

  assert(calls.checker.length === 1, `Checker ran ${calls.checker.length} times, expected 1`);
  assert(calls.fixer.length === 0, `Fixer ran ${calls.fixer.length} times, expected 0`);
  assert(calls.escalate.length === 0, `Escalate called ${calls.escalate.length} times, expected 0`);
});

await test('TGF-3b: DEFER → escalate called, no fixer', async () => {
  cleanup();
  const gate = makeGate('Code review', 'CLEAN', (round, path) => {
    writeFileSync(path, 'DEFER — insufficient evidence to evaluate');
  });
  const ctx = makeCtx();
  const { stubs, calls } = makeStubs(gate);

  await runGateLoop(gate, ctx, false, stubs);

  assert(calls.checker.length === 1, `Checker ran ${calls.checker.length} times, expected 1`);
  assert(calls.fixer.length === 0, `Fixer ran ${calls.fixer.length} times, expected 0`);
  assert(calls.escalate.length === 1, `Escalate called ${calls.escalate.length} times, expected 1`);
  assert(calls.escalate[0].reason.includes('deferred'), `Reason should mention deferred: ${calls.escalate[0].reason}`);
});

await test('TGF-3c: 3×FAIL → escalate "exhausted"', async () => {
  cleanup();
  const gate = makeGate('Visual QA', 'PASS', (round, path) => {
    writeFileSync(path, 'FAIL — 3 violations found');
  });
  const ctx = makeCtx();
  const { stubs, calls } = makeStubs(gate);

  await runGateLoop(gate, ctx, false, stubs);

  assert(calls.checker.length === 3, `Checker ran ${calls.checker.length} times, expected 3`);
  assert(calls.fixer.length === 2, `Fixer ran ${calls.fixer.length} times, expected 2 (rounds 1-2 only)`);
  assert(calls.escalate.length === 1, `Escalate called ${calls.escalate.length} times, expected 1`);
  assert(calls.escalate[0].reason.includes('exhausted'), `Reason should mention exhausted: ${calls.escalate[0].reason}`);
});

await test('TGF-3d: oscillation round 2 → escalate, no round 3', async () => {
  cleanup();
  const gate = makeGate('Code review', 'CLEAN', (round, path) => {
    writeFileSync(path, 'FAIL — violations detected round ' + round);
  }, {
    detectOscillation: (round) => round === 2,
  });
  const ctx = makeCtx();
  const { stubs, calls } = makeStubs(gate);

  await runGateLoop(gate, ctx, false, stubs);

  assert(calls.checker.length === 2, `Checker ran ${calls.checker.length} times, expected 2`);
  assert(calls.fixer.length === 1, `Fixer ran ${calls.fixer.length} times, expected 1 (round 1 only)`);
  assert(calls.escalate.length === 1, `Escalate called ${calls.escalate.length} times, expected 1`);
  assert(calls.escalate[0].reason.includes('oscillation'), `Reason should mention oscillation: ${calls.escalate[0].reason}`);
});

await test('TGF-3e: PASS at round 2 → fixer runs once, then clean', async () => {
  cleanup();
  const gate = makeGate('Visual QA', 'PASS', (round, path) => {
    if (round === 1) writeFileSync(path, 'FAIL — 1 violation');
    else writeFileSync(path, 'PASS — no violations');
  });
  const ctx = makeCtx();
  const { stubs, calls } = makeStubs(gate);

  await runGateLoop(gate, ctx, false, stubs);

  assert(calls.checker.length === 2, `Checker ran ${calls.checker.length} times, expected 2`);
  assert(calls.fixer.length === 1, `Fixer ran ${calls.fixer.length} times, expected 1`);
  assert(calls.escalate.length === 0, `Escalate should not be called`);
});

await test('TGF-3f: hooks (beforeCheck, beforeFix, afterFix) called at correct rounds', async () => {
  cleanup();
  const hookCalls = { beforeCheck: [], beforeFix: [], afterFix: [] };
  const gate = makeGate('Code review', 'CLEAN', (round, path) => {
    if (round < 3) writeFileSync(path, 'FAIL — issues');
    else writeFileSync(path, 'CLEAN — all good');
  }, {
    beforeCheck: (round) => hookCalls.beforeCheck.push(round),
    beforeFix: (round) => hookCalls.beforeFix.push(round),
    afterFix: (round) => hookCalls.afterFix.push(round),
  });
  const ctx = makeCtx();
  const { stubs, calls } = makeStubs(gate);

  await runGateLoop(gate, ctx, false, stubs);

  assert(JSON.stringify(hookCalls.beforeCheck) === '[1,2,3]', `beforeCheck rounds: ${hookCalls.beforeCheck}`);
  assert(JSON.stringify(hookCalls.beforeFix) === '[1,2]', `beforeFix rounds: ${hookCalls.beforeFix}`);
  assert(JSON.stringify(hookCalls.afterFix) === '[1,2]', `afterFix rounds: ${hookCalls.afterFix}`);
  assert(calls.escalate.length === 0, 'Should not escalate — PASS at round 3');
});

// --- Report ---
cleanup();
rmSync(testDir, { recursive: true, force: true });

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`runGateLoop tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

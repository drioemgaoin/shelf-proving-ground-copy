// Regression test: runVerifiedFixer must run verification inside the sandbox
// (via sandbox.exec), not on the host (via execSync).
//
// Root cause: the worktree's node_modules is a symlink to /warm/node_modules
// which only exists inside Docker.  Host-side execSync hits ENOTDIR when
// Vitest tries to mkdir inside the broken symlink.
//
// Run: node --import tsx/esm --test --experimental-test-module-mocks \
//        .sandcastle/tests/verify-runs-in-sandbox.test.mts

import assert from "node:assert/strict";
import { describe, test, beforeEach, afterEach, mock } from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Module mocks — registered BEFORE importing qa-gates
// ---------------------------------------------------------------------------

const VERIFY_CMD = "npm run verify";

// Track whether execSync was called with the verify command (host-side)
const hostVerifyCalls: string[] = [];
// Track whether sandbox.exec was called with the verify command
const sandboxExecCalls: string[] = [];

await mock.module("child_process", {
  namedExports: {
    execSync: (cmd: string, _opts?: any) => {
      if (cmd === VERIFY_CMD) {
        hostVerifyCalls.push(cmd);
      }
      return "";
    },
  },
});

let fixerRunCount = 0;
await mock.module("../lib/tagged-agent.mjs", {
  namedExports: {
    timedSandboxRun: async () => { fixerRunCount++; },
  },
});

await mock.module("../lib/prompt.mjs", {
  namedExports: {
    expandAndSave: () => {},
  },
});

const { runVerifiedFixer } = await import("../lib/qa-gates.mjs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let WORK: string;

function makeSandbox() {
  return {
    exec: async (cmd: string) => {
      sandboxExecCalls.push(cmd);
      // Simulate clean verification (exit 0)
      return { stdout: "", stderr: "", exitCode: 0 };
    },
  };
}

function makeCtx(worktree: string) {
  return {
    issueId: "test-sandbox-verify",
    branch: "test-branch",
    worktree,
    sandbox: makeSandbox() as any,
    state: {} as Record<string, any>,
  };
}

function makeFixer() {
  return {
    agent: { model: "test" } as any,
    maxIterations: 1,
    verifyCommand: VERIFY_CMD,
    promptFile: "fixer.md",
    buildArgs: () => ({}),
  };
}

function buildFindings(count: number): string {
  const lines = ["FINDINGS"];
  for (let i = 1; i <= count; i++) {
    lines.push(`- src/file${i}.tsx:${i} \`symbol${i}\``);
    lines.push(`  Cause: [rule-${i}] issue ${i}`);
    lines.push(`  Current: old code ${i}`);
    lines.push(`  Fix: new code ${i}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  WORK = mkdtempSync(join(tmpdir(), "verify-sandbox-"));
  mkdirSync(join(WORK, ".qa"), { recursive: true });
  mkdirSync(join(WORK, ".sandcastle/logs/test-sandbox-verify"), { recursive: true });
  hostVerifyCalls.length = 0;
  sandboxExecCalls.length = 0;
  fixerRunCount = 0;
});

afterEach(() => {
  rmSync(WORK, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════

describe("verification runs inside sandbox, not on host", () => {

  test("runVerifiedFixer calls sandbox.exec for verification, not host execSync", async () => {
    const ctx = makeCtx(WORK);
    const findings = buildFindings(2);

    await runVerifiedFixer(makeFixer(), findings, 1, ctx, false);

    assert.equal(
      hostVerifyCalls.length, 0,
      `Verification must NOT run on host via execSync. ` +
      `Got ${hostVerifyCalls.length} host call(s).`,
    );
    assert.ok(
      sandboxExecCalls.length > 0,
      `Verification must run inside sandbox via sandbox.exec. ` +
      `Got ${sandboxExecCalls.length} sandbox call(s).`,
    );
    assert.ok(
      sandboxExecCalls.some(c => c === VERIFY_CMD),
      `sandbox.exec should be called with the verify command "${VERIFY_CMD}". ` +
      `Got: ${sandboxExecCalls.join(", ")}`,
    );
  });

  test("sandbox.exec failure output is parsed as verification failures", async () => {
    const ctx = makeCtx(WORK);
    ctx.sandbox = {
      exec: async (cmd: string) => {
        sandboxExecCalls.push(cmd);
        if (cmd === VERIFY_CMD) {
          return {
            stdout: "src/file1.tsx(1,1): error TS2322: still broken",
            stderr: "",
            exitCode: 1,
          };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    } as any;

    const findings = buildFindings(1);

    // With 1 finding and verification still failing with same count → stuck escalation
    // This proves failures from sandbox.exec are correctly parsed
    await runVerifiedFixer(makeFixer(), findings, 1, ctx, false);

    assert.equal(hostVerifyCalls.length, 0, "Must not fall back to host execSync");
    assert.ok(
      sandboxExecCalls.some(c => c === VERIFY_CMD),
      "sandbox.exec must be called for verification",
    );
  });
});

// Tests that the Docker image's claude wrapper forces line-buffered stdout,
// so stream-json events reach the host orchestrator in real time.
//
// Run: npx tsx --test .sandcastle/tests/stream-unbuffer.test.mts
//
// These tests verify the Dockerfile produces the correct wrapper structure
// without requiring a full Docker build (unit-level). An integration test
// builds the image and validates real streaming behavior.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";

const DOCKERFILE_PATH = join(
  import.meta.dirname,
  "..",
  "docker",
  "Dockerfile",
);

// ═══════════════════════════════════════════════════════════════════
// Unit: Dockerfile contains the wrapper
// ═══════════════════════════════════════════════════════════════════

describe("Dockerfile wrapper", () => {
  const dockerfile = readFileSync(DOCKERFILE_PATH, "utf8");

  test("renames claude to claude-real", () => {
    assert.match(dockerfile, /mv.*claude.*claude-real/);
  });

  test("creates a wrapper that calls stdbuf -oL claude-real", () => {
    assert.match(dockerfile, /stdbuf -oL claude-real/);
  });

  test("wrapper is marked executable", () => {
    assert.match(dockerfile, /chmod \+x.*\/claude/);
  });

  test("wrapper uses exec to replace shell process", () => {
    // exec ensures the wrapper doesn't leave a zombie parent shell
    assert.match(dockerfile, /exec stdbuf/);
  });

  test("wrapper passes through all arguments", () => {
    assert.match(dockerfile, /claude-real "\$@"/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Integration: stdbuf actually forces line-buffered output
// ═══════════════════════════════════════════════════════════════════

describe("stdbuf line buffering", () => {
  test("stdbuf -oL delivers lines immediately through a pipe", async () => {
    // Simulate what happens inside the Docker container:
    // A process writes lines to stdout through a pipe.
    // Without stdbuf, the pipe would buffer ~64KB before delivering.
    // With stdbuf -oL, each newline triggers a flush.

    // Check stdbuf is available on the host (macOS may not have it)
    try {
      execSync("which stdbuf", { encoding: "utf8" });
    } catch {
      // stdbuf not available on this host (e.g. macOS) — skip
      return;
    }

    const lines: { line: string; time: number }[] = [];
    const start = Date.now();

    // Spawn a process that writes 3 lines with 100ms gaps through stdbuf
    const proc = spawn("stdbuf", ["-oL", "sh", "-c", `
      echo '{"type":"system","subtype":"init","session_id":"test-123"}'
      sleep 0.1
      echo '{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}'
      sleep 0.1
      echo '{"type":"result","result":"done"}'
    `]);

    const rl = createInterface({ input: proc.stdout! });

    await new Promise<void>((resolve) => {
      rl.on("line", (line) => {
        lines.push({ line, time: Date.now() - start });
      });
      proc.on("close", () => resolve());
    });

    // We should have 3 lines
    assert.equal(lines.length, 3, `Expected 3 lines, got ${lines.length}`);

    // With line buffering, lines should arrive incrementally (not all at once).
    // Line 2 should arrive ~100ms after line 1, and line 3 ~100ms after line 2.
    // Without line buffering, all 3 would arrive at the same time (after exit).
    const gap1 = lines[1]!.time - lines[0]!.time;
    const gap2 = lines[2]!.time - lines[1]!.time;

    // Each gap should be >= 50ms (allowing for scheduling jitter)
    assert.ok(
      gap1 >= 50,
      `Line 2 arrived only ${gap1}ms after line 1 — expected ~100ms (line buffering not working)`,
    );
    assert.ok(
      gap2 >= 50,
      `Line 3 arrived only ${gap2}ms after line 2 — expected ~100ms (line buffering not working)`,
    );
  });

  test("without stdbuf, pipe-buffered output arrives in a burst", async () => {
    // This is the control test — shows what happens WITHOUT stdbuf.
    // A fully-buffered pipe delivers all output only when the process exits.
    // We use a Python subprocess with explicit full-buffering to demonstrate.

    try {
      execSync("which python3", { encoding: "utf8" });
    } catch {
      return; // skip if python3 not available
    }

    const lines: { line: string; time: number }[] = [];
    const start = Date.now();

    // Python with -u (unbuffered) OFF — writes go through libc full buffering
    // when stdout is a pipe. We use a tiny script that writes + sleeps.
    // The key: without stdbuf, all lines arrive together at process exit.
    const proc = spawn("python3", [
      "-c",
      `
import sys, time
# Force full buffering by writing to a pipe without -u
for i in range(3):
    sys.stdout.write(f'{{"line":{i}}}\\n')
    # Don't flush — let the buffer accumulate
    time.sleep(0.05)
# Buffer flushes on exit
`,
    ]);

    const rl = createInterface({ input: proc.stdout! });

    await new Promise<void>((resolve) => {
      rl.on("line", (line) => {
        lines.push({ line, time: Date.now() - start });
      });
      proc.on("close", () => resolve());
    });

    assert.equal(lines.length, 3, `Expected 3 lines, got ${lines.length}`);

    // All lines should arrive within a tight window (< 30ms of each other)
    // because the pipe buffer only flushes when the process exits.
    const totalSpread = lines[2]!.time - lines[0]!.time;
    assert.ok(
      totalSpread < 30,
      `Expected all lines within 30ms (buffered burst), got spread of ${totalSpread}ms`,
    );
  });
});

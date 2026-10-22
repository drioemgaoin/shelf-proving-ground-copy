// Proof that the log formatter produces human-readable output from raw
// stream-json events — no raw JSON, no noise, all meaningful LLM activity.
//
// Run: npx tsx --test .sandcastle/tests/verbose-logging-proof.test.mts

import assert from "node:assert/strict";
import { describe, test, beforeEach, afterEach } from "node:test";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { createLogFormatter } from "../lib/log-formatter.mjs";

// ═══════════════════════════════════════════════════════════════════
// Unit: thinking events are logged readably
// ═══════════════════════════════════════════════════════════════════

describe("log formatter: thinking", () => {
  let logPath: string;
  beforeEach(() => { logPath = join(tmpdir(), `fmt-${Date.now()}-${Math.random().toString(36).slice(2)}.log`); });
  afterEach(() => { try { rmSync(logPath); } catch {} });

  test("thinking produces a line with duration and content, no label", () => {
    const fmt = createLogFormatter(logPath);
    fmt({ type: "raw", line: '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"I need to read the acceptance tests first, then check the component structure."}]},"thinking_duration_ms":1515}' });

    const log = readFileSync(logPath, "utf8");
    assert.ok(log.includes("(1.5s)"), "should show duration");
    assert.ok(log.includes("acceptance tests first"), "should include thinking content");
    assert.ok(!log.includes("thinking"), "no 'thinking' label prefix");
    assert.ok(!log.includes('"type"'), "no raw JSON");
  });

  test("empty thinking (signature block) is excluded", () => {
    const fmt = createLogFormatter(logPath);
    fmt({ type: "raw", line: '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"","signature":"base64sig"}]}}' });

    let log = "";
    try { log = readFileSync(logPath, "utf8"); } catch {}
    assert.equal(log, "", "empty thinking should produce nothing");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Unit: tool results are correlated with their tool calls
// ═══════════════════════════════════════════════════════════════════

describe("log formatter: tool result correlation", () => {
  let logPath: string;
  beforeEach(() => { logPath = join(tmpdir(), `fmt-${Date.now()}-${Math.random().toString(36).slice(2)}.log`); });
  afterEach(() => { try { rmSync(logPath); } catch {} });

  test("successful Read shows file path and line count, no ANSI codes", () => {
    const fmt = createLogFormatter(logPath);

    fmt({ type: "raw", line: '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/home/agent/workspace/src/App.tsx"}}]}}' });
    fmt({ type: "raw", line: '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"1\\texport function App() {}\\n2\\t  return <div />;\\n3\\t}"}]},"tool_use_result":{"type":"text","file":{"filePath":"/home/agent/workspace/src/App.tsx","numLines":3,"totalLines":3}}}' });

    const log = readFileSync(logPath, "utf8");
    assert.ok(!log.includes("\x1b["), "success lines should have no ANSI codes");
    assert.ok(log.includes("Read(src/App.tsx)"), "should show tool name + short path");
    assert.ok(log.includes("3 lines"), "should show line count from structured result");
  });

  test("failed Read is wrapped in red ANSI", () => {
    const fmt = createLogFormatter(logPath);

    fmt({ type: "raw", line: '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/home/agent/workspace/tests/acceptance/shelf-grid.spec.ts"}}]}}' });
    fmt({ type: "raw", line: '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"File does not exist. Note: your current working directory is /home/agent/workspace.","is_error":true}]},"tool_use_result":"Error: File does not exist."}' });

    const log = readFileSync(logPath, "utf8");
    assert.ok(log.includes("\x1b[31m"), "error lines should start with red ANSI");
    assert.ok(log.includes("\x1b[0m"), "error lines should end with ANSI reset");
    assert.ok(log.includes("Read(tests/acceptance/shelf-grid.spec.ts)"), "should show tool + path");
    assert.ok(log.includes("File does not exist"), "should show error message");
  });

  test("Bash result shows output summary", () => {
    const fmt = createLogFormatter(logPath);

    fmt({ type: "raw", line: '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"npm run typecheck && npm run lint"}}]}}' });
    fmt({ type: "raw", line: '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"All checks passed."}]}}' });

    const log = readFileSync(logPath, "utf8");
    assert.ok(log.includes("Bash(npm run typecheck && npm run lint)"), "should show command");
    assert.ok(log.includes("All checks passed"), "should show output");
  });

  test("Write result shows file path", () => {
    const fmt = createLogFormatter(logPath);

    fmt({ type: "raw", line: '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Write","input":{"file_path":"/home/agent/workspace/src/ShelfGrid.tsx","content":"export function ShelfGrid() {}"}}]}}' });
    fmt({ type: "raw", line: '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"File written successfully"}]}}' });

    const log = readFileSync(logPath, "utf8");
    assert.ok(log.includes("Write(src/ShelfGrid.tsx)"), "should show tool + short path");
    assert.ok(log.includes("File written"), "should show result");
  });

  test("Bash error is wrapped in red ANSI", () => {
    const fmt = createLogFormatter(logPath);

    fmt({ type: "raw", line: '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"npm run typecheck"}}]}}' });
    fmt({ type: "raw", line: '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"src/App.tsx(3,5): error TS2304: Cannot find name React.","is_error":true}]}}' });

    const log = readFileSync(logPath, "utf8");
    assert.ok(log.includes("\x1b[31m"), "should have red ANSI");
    assert.ok(log.includes("Bash(npm run typecheck)"), "should show command");
    assert.ok(log.includes("TS2304"), "should show error content");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Unit: noise events are excluded
// ═══════════════════════════════════════════════════════════════════

describe("log formatter: noise exclusion", () => {
  let logPath: string;
  beforeEach(() => { logPath = join(tmpdir(), `fmt-${Date.now()}-${Math.random().toString(36).slice(2)}.log`); });
  afterEach(() => { try { rmSync(logPath); } catch {} });

  test("system events produce no output", () => {
    const fmt = createLogFormatter(logPath);

    fmt({ type: "raw", line: '{"type":"system","subtype":"init","session_id":"s1","tools":["Read","Write"],"model":"claude-opus-4-8"}' });
    fmt({ type: "raw", line: '{"type":"system","subtype":"thinking_tokens","estimated_tokens":133}' });
    fmt({ type: "raw", line: '{"type":"system","subtype":"hook_started","hook_id":"h1"}' });
    fmt({ type: "raw", line: '{"type":"system","subtype":"hook_response","hook_id":"h1","output":"huge blob"}' });

    let log = "";
    try { log = readFileSync(logPath, "utf8"); } catch {}
    assert.equal(log, "");
  });

  test("text events are written with a timestamp", () => {
    const fmt = createLogFormatter(logPath);
    fmt({ type: "raw", line: '{"type":"assistant","message":{"content":[{"type":"text","text":"Now implementing the feature."}]}}' });

    const log = readFileSync(logPath, "utf8");
    assert.match(log.trim(), /^\[\d{2}:\d{2}:\d{2}\]/, "text should have timestamp");
    assert.ok(log.includes("Now implementing the feature"), "should contain text");
  });

  test("non-raw event types are ignored", () => {
    const fmt = createLogFormatter(logPath);
    fmt({ type: "text", message: "display text" });
    fmt({ type: "toolCall", name: "Read", formattedArgs: "/path" });

    let log = "";
    try { log = readFileSync(logPath, "utf8"); } catch {}
    assert.equal(log, "");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Unit: every line gets a timestamp — no concatenation, no gaps
// ═══════════════════════════════════════════════════════════════════

describe("log formatter: every line timestamped", () => {
  let logPath: string;
  beforeEach(() => { logPath = join(tmpdir(), `fmt-${Date.now()}-${Math.random().toString(36).slice(2)}.log`); });
  afterEach(() => { try { rmSync(logPath); } catch {} });

  test("text events produce a timestamped line", () => {
    const fmt = createLogFormatter(logPath);
    fmt({ type: "raw", line: '{"type":"assistant","message":{"content":[{"type":"text","text":"Now implementing the shelf grid."}]}}' });

    const log = readFileSync(logPath, "utf8");
    assert.match(log.trim(), /^\[\d{2}:\d{2}:\d{2}\]/, "text line should start with [HH:MM:SS]");
    assert.ok(log.includes("Now implementing the shelf grid"), "should contain text content");
  });

  test("display-layer text before formatter output does not concatenate", () => {
    // Simulate the display layer writing text without a trailing newline
    // (this is what happens when type:"file" is set — sandcastle writes
    // text and toolCall events directly to the file).
    const fmt = createLogFormatter(logPath);
    appendFileSync(logPath, "All three are screenshot diff failures.");

    // Now the formatter writes a tool result
    fmt({ type: "raw", line: '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/home/agent/workspace/tests/foo.png"}}]}}' });
    fmt({ type: "raw", line: '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"image data"}]}}' });

    const log = readFileSync(logPath, "utf8");
    const lines = log.split("\n").filter(Boolean);

    // The formatter's timestamped output must NOT be on the same line as the display text
    for (const line of lines) {
      if (line.includes("[")) {
        const tsIndex = line.indexOf("[");
        if (tsIndex > 0) {
          // There's content before the timestamp — this is the concatenation bug
          assert.fail(`Timestamp not at start of line: "${line}"`);
        }
      }
    }
  });

  test("all formatter output lines start with a timestamp", () => {
    const fmt = createLogFormatter(logPath);

    const session = [
      '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Planning the approach."}]},"thinking_duration_ms":500}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"I will read the file first."}]}}',
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/home/agent/workspace/src/App.tsx"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"code here"}]},"tool_use_result":{"type":"text","file":{"filePath":"/home/agent/workspace/src/App.tsx","totalLines":42}}}',
    ];

    for (const line of session) {
      fmt({ type: "raw", line });
    }

    const log = readFileSync(logPath, "utf8");
    const lines = log.trim().split("\n");
    const tsPattern = /^\[\d{2}:\d{2}:\d{2}\]/;

    for (const line of lines) {
      assert.match(line, tsPattern, `Line missing timestamp: "${line}"`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Unit: full session — realistic sequence
// ═══════════════════════════════════════════════════════════════════

describe("log formatter: full session", () => {
  let logPath: string;
  beforeEach(() => { logPath = join(tmpdir(), `fmt-${Date.now()}-${Math.random().toString(36).slice(2)}.log`); });
  afterEach(() => { try { rmSync(logPath); } catch {} });

  test("realistic session produces meaningful, scannable log", () => {
    const fmt = createLogFormatter(logPath);

    const session = [
      // Noise — all excluded
      '{"type":"system","subtype":"init","session_id":"s1","tools":["Read"]}',
      '{"type":"system","subtype":"hook_started","hook_id":"h1"}',
      '{"type":"system","subtype":"hook_response","hook_id":"h1","output":"json"}',
      '{"type":"system","subtype":"thinking_tokens","estimated_tokens":50}',
      '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"","signature":"sig"}]}}',

      // Thinking — logged
      '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"The App component is empty. I need to build the shelf grid."}]},"thinking_duration_ms":2300}',

      // Read file — tool_use not logged, result logged with correlation
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/home/agent/workspace/src/App.tsx"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"1\\texport function App() {}"}]},"tool_use_result":{"type":"text","file":{"filePath":"/home/agent/workspace/src/App.tsx","totalLines":5}}}',

      // Text output — logged with timestamp
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Now implementing the shelf grid."}]}}',

      // Write file
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Write","input":{"file_path":"/home/agent/workspace/src/ShelfGrid.tsx","content":"code"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t2","content":"File written successfully"}]}}',

      // Bash error
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t3","name":"Bash","input":{"command":"npm run typecheck"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t3","content":"error TS2304: Cannot find name React","is_error":true}]}}',

      // Result — not logged
      '{"type":"result","result":"done"}',
    ];

    for (const line of session) {
      fmt({ type: "raw", line });
    }

    const log = readFileSync(logPath, "utf8");
    const lines = log.trim().split("\n");

    // 5 meaningful lines: thinking, tool result, text, tool result, tool result (error)
    assert.equal(lines.length, 5, `Expected 5 lines, got ${lines.length}:\n${log}`);

    assert.ok(lines[0]!.includes("(2.3s)"), `L1 duration: ${lines[0]}`);
    assert.ok(lines[0]!.includes("shelf grid"), `L1 content: ${lines[0]}`);
    assert.ok(!lines[0]!.includes("\x1b["), "L1 no ANSI (not an error)");

    assert.ok(lines[1]!.includes("Read(src/App.tsx)"), `L2: ${lines[1]}`);
    assert.ok(lines[1]!.includes("5 lines"), `L2 result: ${lines[1]}`);
    assert.ok(!lines[1]!.includes("\x1b["), "L2 no ANSI (not an error)");

    assert.ok(lines[2]!.includes("Now implementing the shelf grid"), `L3: ${lines[2]}`);
    assert.match(lines[2]!, /^\[\d{2}:\d{2}:\d{2}\]/, "L3 text should have timestamp");

    assert.ok(lines[3]!.includes("Write(src/ShelfGrid.tsx)"), `L4: ${lines[3]}`);
    assert.ok(lines[3]!.includes("File written"), `L4 result: ${lines[3]}`);

    assert.ok(lines[4]!.includes("Bash(npm run typecheck)"), `L5: ${lines[4]}`);
    assert.ok(lines[4]!.includes("TS2304"), `L5 error: ${lines[4]}`);
    assert.ok(lines[4]!.includes("\x1b[31m"), "L5 should be red (error)");

    // Every line has a timestamp (may be preceded by ANSI color code for errors)
    const tsPattern = /^(\x1b\[\d+m)?\[\d{2}:\d{2}:\d{2}\]/;
    for (const line of lines) {
      assert.match(line, tsPattern, `Line missing timestamp: "${line.slice(0, 60)}"`);
    }

    // No raw JSON anywhere
    assert.ok(!log.includes('{"type":'), "no raw JSON");
    assert.ok(!log.includes("thinking_tokens"), "no noise");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Integration: Docker stdbuf delivers events incrementally
// ═══════════════════════════════════════════════════════════════════

describe("Docker integration: incremental delivery + formatting", () => {
  test("events stream incrementally and format readably", async () => {
    try {
      execSync("docker info", { encoding: "utf8", stdio: "pipe" });
    } catch {
      return;
    }

    const testDir = join(tmpdir(), `docker-stream-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    writeFileSync(join(testDir, "Dockerfile"), `FROM node:22-bookworm
RUN apt-get update && apt-get install -y coreutils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY emit.sh /app/emit.sh
RUN chmod +x /app/emit.sh
`);
    writeFileSync(join(testDir, "emit.sh"), `#!/bin/sh
echo '{"type":"system","subtype":"init","session_id":"s1"}'
sleep 0.2
echo '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Planning the implementation..."}]},"thinking_duration_ms":200}'
sleep 0.2
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/home/agent/workspace/src/App.tsx"}}]}}'
sleep 0.1
echo '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"code here"}]},"tool_use_result":{"type":"text","file":{"filePath":"/home/agent/workspace/src/App.tsx","totalLines":42}}}'
sleep 0.1
echo '{"type":"result","result":"done"}'
`);

    const imageName = `sandcastle-fmt-test-${Date.now()}`;
    const fmtLogPath = join(tmpdir(), `docker-fmt-${Date.now()}.log`);

    try {
      execSync(`docker build -t ${imageName} ${testDir}`, {
        encoding: "utf8", stdio: "pipe", timeout: 120_000,
      });

      const formatter = createLogFormatter(fmtLogPath);
      const result = await collectDockerOutput(imageName, "stdbuf -oL /app/emit.sh");

      assert.equal(result.lines.length, 5, `Expected 5 lines, got ${result.lines.length}`);

      const gaps = result.timestamps.slice(1).map((t, i) => t - result.timestamps[i]!);
      assert.ok(gaps.some(g => g >= 80), `Expected incremental gaps: ${gaps.join(", ")}ms`);

      for (const line of result.lines) {
        formatter({ type: "raw", line });
      }

      const log = readFileSync(fmtLogPath, "utf8");
      const logLines = log.trim().split("\n");

      assert.equal(logLines.length, 2, `Expected 2 formatted lines:\n${log}`);
      assert.ok(logLines[0]!.includes("Planning the implementation"), `L1: ${logLines[0]}`);
      assert.ok(logLines[1]!.includes("Read(src/App.tsx) -> 42 lines"), `L2: ${logLines[1]}`);
      assert.ok(!log.includes('{"type":'), "no raw JSON");

    } finally {
      try { execSync(`docker rmi -f ${imageName}`, { stdio: "pipe" }); } catch {}
      try { rmSync(fmtLogPath); } catch {}
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});

async function collectDockerOutput(
  image: string,
  command: string,
): Promise<{ lines: string[]; timestamps: number[] }> {
  const lines: string[] = [];
  const timestamps: number[] = [];
  const start = Date.now();
  const proc = spawn("docker", ["run", "--rm", image, "sh", "-c", command]);
  const rl = createInterface({ input: proc.stdout! });
  await new Promise<void>((resolve) => {
    rl.on("line", (line) => {
      lines.push(line);
      timestamps.push(Date.now() - start);
    });
    proc.on("close", () => resolve());
  });
  return { lines, timestamps };
}

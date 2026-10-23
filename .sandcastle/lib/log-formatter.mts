// Human-readable log formatter for sandcastle agent output.
//
// Parses raw stream-json lines from the Claude Code CLI and writes
// readable, meaningful text to the log file. Replaces the raw JSON
// dump (verbose mode) with output a human can scan at a glance.
//
// Designed for `tail -f` consumption. Uses ANSI colors:
//   red for errors so they jump out when scanning.
//
// What gets logged (examples from a real session):
//   [10:04:53] (1.5s) I need to read the acceptance tests first…
//   [10:04:54] Read(tests/acceptance/shelf-grid.spec.ts) -> File does not exist  (red)
//   [10:04:54] Read(src/App.tsx) -> 5 lines
//   [10:04:55] Bash(npm run typecheck) -> exit 0, 12 lines
//   [10:04:56] Write(src/ShelfGrid.tsx) -> ok
//
// What gets excluded:
//   - thinking_tokens, hook_started, hook_response, init (noise)
//   - empty thinking blocks (just signatures)
//   - usage blocks, UUIDs, session metadata
//   - text and tool_use (already written by sandcastle's display layer)

import { appendFileSync, openSync, fstatSync, readSync, closeSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";

// ANSI escape codes for `tail -f` readability.
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

/** Shorten /home/agent/workspace/src/App.tsx → src/App.tsx */
function shortPath(p: string): string {
  return p.replace(/^\/home\/agent\/workspace\//, "");
}

/** Summarize tool_use input as a short string for the log line. */
function summarizeToolInput(name: string, input: any): string {
  if (!input || typeof input !== "object") return "";
  switch (name) {
    case "Read":
      return shortPath(input.file_path ?? "");
    case "Write":
      return shortPath(input.file_path ?? "");
    case "Edit": {
      const file = shortPath(input.file_path ?? "");
      const old = typeof input.old_string === "string"
        ? input.old_string.slice(0, 50).replace(/\n/g, "↵")
        : "";
      return old ? `${file} — "${old}…"` : file;
    }
    case "Bash":
      return (input.command ?? input.description ?? "").slice(0, 120);
    case "Glob":
      return input.pattern ?? "";
    case "Grep": {
      const pat = input.pattern ?? "";
      const path = input.path ? " in " + shortPath(input.path) : "";
      return `${pat}${path}`.slice(0, 120);
    }
    default: {
      for (const [k, v] of Object.entries(input)) {
        if (typeof v === "string" && v.length > 0) {
          return `${k}=${v.slice(0, 80)}`;
        }
      }
      return "";
    }
  }
}

/** Summarize a tool_result into a short human-readable string. */
function summarizeResult(content: any, toolUseResult: any): string {
  // Prefer the structured tool_use_result (has filePath, numLines, etc.)
  if (toolUseResult && typeof toolUseResult === "object") {
    if (toolUseResult.type === "text" && toolUseResult.file) {
      const f = toolUseResult.file;
      return `${f.totalLines ?? f.numLines ?? "?"} lines`;
    }
    if (typeof toolUseResult === "string") {
      return toolUseResult.replace(/\n/g, " ");
    }
  }

  // Fall back to raw content
  if (typeof content === "string") {
    if (content.length > 2000) {
      const lines = content.split("\n").length;
      return `${lines} lines`;
    }
    return content.replace(/\n/g, " ");
  }
  return "ok";
}

// ---------------------------------------------------------------------------
// Pending tool call tracker — correlates tool_use → tool_result
// ---------------------------------------------------------------------------

interface PendingTool {
  name: string;
  summary: string;
}

/**
 * Create an onAgentStreamEvent callback that writes human-readable
 * formatted output to a log file.
 */
export function createLogFormatter(logPath: string) {
  mkdirSync(dirname(logPath), { recursive: true });

  // Track pending tool calls so results can reference them.
  const pending = new Map<string, PendingTool>();

  return (event: { type: string; line?: string; message?: string; name?: string; formattedArgs?: string }) => {
    if (event.type !== "raw" || typeof event.line !== "string") return;

    const line = event.line;
    if (!line.startsWith("{")) return;

    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      return;
    }

    let output: string | undefined;

    // --- System events: all noise ---
    if (obj.type === "system") {
      return;
    }

    // --- Assistant messages ---
    if (obj.type === "assistant" && Array.isArray(obj.message?.content)) {
      for (const block of obj.message.content) {
        // Thinking — the key event that was previously invisible
        if (block.type === "thinking" && typeof block.thinking === "string" && block.thinking.length > 0) {
          const dur = obj.thinking_duration_ms
            ? `(${(obj.thinking_duration_ms / 1000).toFixed(1)}s) `
            : "";
          output = `[${ts()}] ${dur}${block.thinking.replace(/\n/g, " ")}`;
          break;
        }

        // Tool use — register pending, but don't log (display layer does it)
        if (block.type === "tool_use" && typeof block.name === "string") {
          pending.set(block.id, {
            name: block.name,
            summary: summarizeToolInput(block.name, block.input),
          });
          // Don't set output — FileDisplay already writes "ToolName(args)"
          return;
        }

        // Text — log with timestamp.
        // If the text contains <promise>COMPLETE</promise>, ensure it
        // lands on its own line (agents often emit it inline with a
        // final summary).
        if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
          const completeTag = "<promise>COMPLETE</promise>";
          const idx = block.text.indexOf(completeTag);
          if (idx !== -1) {
            const before = block.text.slice(0, idx).replace(/\n/g, " ").trim();
            const after = block.text.slice(idx + completeTag.length).replace(/\n/g, " ").trim();
            const parts: string[] = [];
            if (before) parts.push(`[${ts()}] ${before}`);
            parts.push(`[${ts()}] ${completeTag}`);
            if (after) parts.push(`[${ts()}] ${after}`);
            output = parts.join("\n");
          } else {
            output = `[${ts()}] ${block.text.replace(/\n/g, " ")}`;
          }
          break;
        }
      }
    }

    // --- User messages (tool results) ---
    if (obj.type === "user" && Array.isArray(obj.message?.content)) {
      for (const block of obj.message.content) {
        if (block.type !== "tool_result") continue;

        const toolId = block.tool_use_id;
        const tool = pending.get(toolId);
        pending.delete(toolId);

        const toolLabel = tool
          ? `${tool.name}(${tool.summary})`
          : `tool[${toolId?.slice(-8) ?? "?"}]`;

        const isError = !!block.is_error;
        const resultSummary = isError
          ? (typeof block.content === "string"
              ? block.content.replace(/\n/g, " ")
              : "failed")
          : summarizeResult(block.content, obj.tool_use_result);

        output = isError
          ? `${RED}[${ts()}] ${toolLabel} -> ${resultSummary}${RESET}`
          : `[${ts()}] ${toolLabel} -> ${resultSummary}`;
        break;
      }
    }

    // --- Result event: skip (display layer writes it) ---

    if (output) {
      try {
        // Ensure our output starts on its own line. The display layer
        // (sandcastle's type:"file" logger) may have written text or
        // tool_call names without a trailing newline — guard against
        // concatenation by prepending \n when the file doesn't end
        // with one.
        let prefix = "";
        if (existsSync(logPath)) {
          try {
            const buf = Buffer.alloc(1);
            const fd = openSync(logPath, "r");
            const stat = fstatSync(fd);
            if (stat.size > 0) {
              readSync(fd, buf, 0, 1, stat.size - 1);
              if (buf[0] !== 0x0a) prefix = "\n";
            }
            closeSync(fd);
          } catch { /* swallow — file may be empty or gone */ }
        }
        appendFileSync(logPath, prefix + output + "\n");
      } catch { /* swallow */ }
    }
  };
}

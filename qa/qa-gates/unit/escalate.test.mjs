#!/usr/bin/env node
/**
 * TGF-4: escalate — command construction and shell safety
 *
 * escalate(issueId, reason) builds two shell commands from tracker templates
 * and executes them via execSync. Shell metacharacters in `reason` must not
 * execute — they must be escaped or the function must avoid shell expansion.
 *
 * Seam: escalate(issueId, reason) with execSync stubbed to record commands.
 * Source: .sandcastle/lib/qa-gates.mts:167-175
 */

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

// ---------------------------------------------------------------------------
// Tracker command templates (mirrors .sandcastle/config/tracker.mts)
// ---------------------------------------------------------------------------

const LABEL_TASK_COMMAND = "bd label add <ID> ready-for-human";
const COMMENT_TASK_COMMAND = 'bd update <ID> --notes "<COMMENT>"';

// ---------------------------------------------------------------------------
// Reimplementation of escalate (mirrors qa-gates.mts:167-175)
// execSync replaced with a recording stub.
// ---------------------------------------------------------------------------

const execLog = [];

function mockExecSync(cmd) {
  execLog.push(cmd);
}

// Mirrors qa-gates.mts:167-181 — must stay in sync with source
function shellEscapeDoubleQuoted(str) {
  return str.replace(/[\\"`$!]/g, '\\$&');
}

function escalate(issueId, reason) {
  mockExecSync(LABEL_TASK_COMMAND.replace("<ID>", issueId));
  const safeComment = shellEscapeDoubleQuoted(`${reason} Needs human review.`);
  mockExecSync(
    COMMENT_TASK_COMMAND.replace("<ID>", issueId).replace(
      "<COMMENT>",
      safeComment,
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('TGF-4a: normal reason — label command contains issueId', () => {
  execLog.length = 0;
  escalate('beads-42', 'Gate exhausted after 3 rounds.');
  assert(execLog.length === 2, `Expected 2 commands, got ${execLog.length}`);
  assert(
    execLog[0] === 'bd label add beads-42 ready-for-human',
    `Label command wrong: ${execLog[0]}`,
  );
});

test('TGF-4b: normal reason — comment command contains issueId + reason', () => {
  execLog.length = 0;
  escalate('beads-42', 'Gate exhausted after 3 rounds.');
  const commentCmd = execLog[1];
  assert(commentCmd.includes('beads-42'), `Missing issueId in comment cmd: ${commentCmd}`);
  assert(commentCmd.includes('Gate exhausted after 3 rounds.'), `Missing reason in comment cmd: ${commentCmd}`);
  assert(commentCmd.includes('Needs human review.'), `Missing suffix in comment cmd: ${commentCmd}`);
});

test('TGF-4c: shell metacharacters in reason — backticks must be escaped for shell', () => {
  // Inside double quotes, `whoami` is expanded by the shell.
  // The command string must either escape the backticks or avoid shell execution.
  execLog.length = 0;
  const malicious = 'reason with `whoami` injection';
  escalate('beads-99', malicious);
  const commentCmd = execLog[1];
  // Unescaped backticks inside double quotes → shell expands them.
  // Safe: escaped (\`) or no shell (execFileSync / array form).
  const hasUnescapedBackticks = commentCmd.includes('`whoami`') && !commentCmd.includes('\\`whoami\\`');
  assert(!hasUnescapedBackticks, `Backticks unescaped inside double-quoted shell command — will execute: ${commentCmd}`);
});

test('TGF-4d: shell metacharacters in reason — $() must be escaped for shell', () => {
  // Inside double quotes, $(cmd) is expanded by the shell.
  execLog.length = 0;
  const malicious = 'reason $(echo INJECTED)';
  escalate('beads-99', malicious);
  const commentCmd = execLog[1];
  const hasUnescapedDollar = commentCmd.includes('$(echo INJECTED)') && !commentCmd.includes('\\$(echo INJECTED)');
  assert(!hasUnescapedDollar, `$() unescaped inside double-quoted shell command — will execute: ${commentCmd}`);
});

test('TGF-4e: shell metacharacters in reason — semicolon must not break command', () => {
  execLog.length = 0;
  const malicious = 'reason; rm -rf /';
  escalate('beads-99', malicious);
  const commentCmd = execLog[1];
  // The semicolon must be inside quotes or escaped — not splitting commands.
  // Since COMMENT_TASK_COMMAND wraps <COMMENT> in double quotes, the semicolon
  // is inside the quotes. But double quotes don't protect against $() and backticks.
  // For semicolons specifically, double-quoting IS sufficient.
  assert(commentCmd.includes('reason; rm -rf /'), `Semicolon should be inside quotes: ${commentCmd}`);
});

test('TGF-4f: shell metacharacters in reason — double-quote escape in reason', () => {
  // A reason containing " would break out of the COMMENT_TASK_COMMAND quotes.
  execLog.length = 0;
  const malicious = 'reason" && echo INJECTED && echo "';
  escalate('beads-99', malicious);
  const commentCmd = execLog[1];
  // The unescaped " in reason would close the --notes "..." argument,
  // allowing && echo INJECTED to run. The " must be escaped.
  const hasUnsafeQuoteBreak = commentCmd.includes('--notes "reason" && echo INJECTED');
  assert(!hasUnsafeQuoteBreak, `Double-quote injection not safe — command can break out of quotes: ${commentCmd}`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`escalate tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

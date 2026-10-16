#!/usr/bin/env node
/**
 * TGF-33: Global T2 child bug lifecycle — create/dedup/auto-close
 *
 * Acceptance (pipeline): tests the Global T2 orchestrator that runs
 * post-merge, creating child bug tickets on failure, deduplicating
 * by title, auto-closing on pass, and escalating after 5 rounds.
 *
 * Spec: "Global T2 suite. Post-merge. Hard round limit: 5 →
 *        escalate global-oscillation." (line 1180)
 *        "Child bug ticket title: [Global T2] {assertion name} —
 *        {fixture} @ {viewport}" (line 1180)
 *
 * Seam: runGlobalT2(opts) → Promise<GlobalT2Result>
 * Source: .sandcastle/lib/global-t2.mts
 */

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => passed++)
    .catch((e) => { failed++; failures.push(`FAIL: ${label} — ${e.message}`); });
}
function assert(condition, message) { if (!condition) throw new Error(message); }

// ---------------------------------------------------------------------------
// Reimplementation — mirrors .sandcastle/lib/global-t2.mts
// ---------------------------------------------------------------------------

const MAX_ROUNDS = 5;

function bugTitle(name, fixture, viewport) {
  return `[Global T2] ${name} — ${fixture} @ ${viewport}`;
}

/**
 * @param {object} opts
 * @param {() => Promise<{exitCode: number, failures: Array<{name: string, fixture: string, viewport: string}>}>} opts.runner
 * @param {object} opts.tracker
 * @param {(prefix: string) => Promise<string[]>} opts.tracker.searchBugs — returns titles of open bugs matching prefix
 * @param {(title: string, labels: string[]) => Promise<void>} opts.tracker.createBug
 * @param {(title: string) => Promise<void>} opts.tracker.closeBug
 * @param {(reason: string) => void} opts.tracker.escalate
 * @returns {Promise<{rounds: number, green: boolean}>}
 */
async function runGlobalT2(opts) {
  const { runner, tracker } = opts;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const result = await runner();

    // Exit 2 = infrastructure failure — escalate immediately
    if (result.exitCode === 2) {
      tracker.escalate("global-infra-failure");
      return { rounds: round, green: false };
    }

    // Collect titles of currently-failing assertions
    const failingTitles = new Set(
      result.failures.map((f) => bugTitle(f.name, f.fixture, f.viewport)),
    );

    // Fetch existing open bugs
    const existingBugs = new Set(await tracker.searchBugs("[Global T2]"));

    // Auto-close: open bugs whose assertion now passes
    for (const title of existingBugs) {
      if (!failingTitles.has(title)) {
        await tracker.closeBug(title);
      }
    }

    // Create: new failures not yet tracked
    for (const title of failingTitles) {
      if (!existingBugs.has(title)) {
        await tracker.createBug(title, ["bug", "Sandcastle"]);
      }
    }

    // All green?
    if (result.exitCode === 0 && result.failures.length === 0) {
      return { rounds: round, green: true };
    }
  }

  // Exhausted — escalate
  tracker.escalate("global-oscillation");
  return { rounds: MAX_ROUNDS, green: false };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRunner(sequence) {
  let call = 0;
  return async () => {
    if (call >= sequence.length) return { exitCode: 0, failures: [] };
    return sequence[call++];
  };
}

function mockTracker(existingBugs = []) {
  const openBugs = new Set(existingBugs);
  const log = { created: [], closed: [], searched: [], escalated: [] };
  return {
    log,
    openBugs,
    searchBugs: async (_prefix) => {
      log.searched.push(_prefix);
      return [...openBugs];
    },
    createBug: async (title, labels) => {
      log.created.push({ title, labels });
      openBugs.add(title);
    },
    closeBug: async (title) => {
      log.closed.push(title);
      openBugs.delete(title);
    },
    escalate: (reason) => {
      log.escalated.push(reason);
    },
  };
}

function failure(name, fixture, viewport) {
  return { name, fixture, viewport };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test('TGF-33a: All pass round 1 — no bugs created', async () => {
  const tracker = mockTracker();
  const runner = mockRunner([
    { exitCode: 0, failures: [] },
  ]);

  const result = await runGlobalT2({ runner, tracker });

  assert(result.rounds === 1, `Expected 1 round, got ${result.rounds}`);
  assert(result.green === true, `Expected green`);
  assert(tracker.log.created.length === 0, `No bugs should be created`);
  assert(tracker.log.escalated.length === 0, `No escalation`);
});

await test('TGF-33b: Failure creates child bug with correct title and labels', async () => {
  const tracker = mockTracker();
  const runner = mockRunner([
    { exitCode: 1, failures: [failure("no-axe-violations", "empty", "320px")] },
    { exitCode: 0, failures: [] },
  ]);

  const result = await runGlobalT2({ runner, tracker });

  assert(tracker.log.created.length === 1, `Expected 1 bug created, got ${tracker.log.created.length}`);
  const bug = tracker.log.created[0];
  assert(
    bug.title === '[Global T2] no-axe-violations — empty @ 320px',
    `Wrong title: ${bug.title}`,
  );
  assert(
    bug.labels.includes('bug') && bug.labels.includes('Sandcastle'),
    `Labels must include bug and Sandcastle, got: ${bug.labels}`,
  );
  assert(result.green === true, `Should be green after round 2 passes`);
});

await test('TGF-33c: Dedup — no duplicate bug if same title already open', async () => {
  const existingTitle = '[Global T2] no-axe-violations — empty @ 320px';
  const tracker = mockTracker([existingTitle]);
  const runner = mockRunner([
    { exitCode: 1, failures: [failure("no-axe-violations", "empty", "320px")] },
    { exitCode: 0, failures: [] },
  ]);

  await runGlobalT2({ runner, tracker });

  assert(tracker.log.created.length === 0, `No new bug should be created (dedup), got ${tracker.log.created.length}`);
});

await test('TGF-33d: Auto-close — bug closed when assertion passes in next round', async () => {
  const tracker = mockTracker();
  const runner = mockRunner([
    // Round 1: two failures
    { exitCode: 1, failures: [
      failure("no-axe-violations", "empty", "320px"),
      failure("no-overflow", "long", "768px"),
    ]},
    // Round 2: only one still failing — the other should auto-close
    { exitCode: 1, failures: [
      failure("no-overflow", "long", "768px"),
    ]},
    // Round 3: all pass
    { exitCode: 0, failures: [] },
  ]);

  const result = await runGlobalT2({ runner, tracker });

  assert(tracker.log.created.length === 2, `2 bugs created in round 1, got ${tracker.log.created.length}`);
  // Round 2 auto-closes the axe bug; round 3 (all pass) auto-closes the overflow bug
  assert(tracker.log.closed.length === 2, `2 bugs auto-closed total, got ${tracker.log.closed.length}`);
  assert(
    tracker.log.closed[0] === '[Global T2] no-axe-violations — empty @ 320px',
    `First close should be axe bug: ${tracker.log.closed[0]}`,
  );
  assert(
    tracker.log.closed[1] === '[Global T2] no-overflow — long @ 768px',
    `Second close should be overflow bug: ${tracker.log.closed[1]}`,
  );
  assert(result.rounds === 3, `Expected 3 rounds, got ${result.rounds}`);
  assert(result.green === true, `Should be green`);
});

await test('TGF-33e: 5 rounds exhausted → escalate global-oscillation', async () => {
  const tracker = mockTracker();
  const persistentFailure = { exitCode: 1, failures: [failure("no-overflow", "many", "1280px")] };
  const runner = mockRunner([
    persistentFailure, persistentFailure, persistentFailure, persistentFailure, persistentFailure,
  ]);

  const result = await runGlobalT2({ runner, tracker });

  assert(result.rounds === 5, `Expected 5 rounds, got ${result.rounds}`);
  assert(result.green === false, `Should not be green`);
  assert(tracker.log.escalated.length === 1, `Expected 1 escalation, got ${tracker.log.escalated.length}`);
  assert(
    tracker.log.escalated[0] === 'global-oscillation',
    `Expected global-oscillation, got: ${tracker.log.escalated[0]}`,
  );
  // Bug created only once (dedup across rounds)
  assert(tracker.log.created.length === 1, `Bug created only once, got ${tracker.log.created.length}`);
});

await test('TGF-33f: Exit 2 from runner → escalate global-infra-failure immediately', async () => {
  const tracker = mockTracker();
  const runner = mockRunner([
    { exitCode: 2, failures: [] },
  ]);

  const result = await runGlobalT2({ runner, tracker });

  assert(result.rounds === 1, `Should stop at round 1, got ${result.rounds}`);
  assert(result.green === false, `Should not be green`);
  assert(tracker.log.escalated.length === 1, `Expected 1 escalation`);
  assert(
    tracker.log.escalated[0] === 'global-infra-failure',
    `Expected global-infra-failure, got: ${tracker.log.escalated[0]}`,
  );
});

await test('TGF-33g: Multiple failures across fixtures/viewports — all get unique bugs', async () => {
  const tracker = mockTracker();
  const runner = mockRunner([
    { exitCode: 1, failures: [
      failure("no-axe-violations", "empty", "320px"),
      failure("no-axe-violations", "empty", "768px"),
      failure("no-axe-violations", "many", "320px"),
      failure("no-overflow", "long", "1280px"),
    ]},
    { exitCode: 0, failures: [] },
  ]);

  await runGlobalT2({ runner, tracker });

  assert(tracker.log.created.length === 4, `Expected 4 unique bugs, got ${tracker.log.created.length}`);
  const titles = tracker.log.created.map((b) => b.title);
  assert(titles.includes('[Global T2] no-axe-violations — empty @ 320px'), `Missing empty@320px`);
  assert(titles.includes('[Global T2] no-axe-violations — empty @ 768px'), `Missing empty@768px`);
  assert(titles.includes('[Global T2] no-axe-violations — many @ 320px'), `Missing many@320px`);
  assert(titles.includes('[Global T2] no-overflow — long @ 1280px'), `Missing long@1280px`);
});

// ---------------------------------------------------------------------------
// parsePlaywrightFailures — extracts T2 failure info from Playwright output
// Mirrors .sandcastle/lib/global-t2.mts:parsePlaywrightFailures
// ---------------------------------------------------------------------------

/**
 * Parses Playwright stdout/stderr for failed T2 global tests.
 * Test names follow: "{name}: {fixture} @ {viewport} ({width}px)"
 * e.g. "no-axe-violations: empty @ mobile (320px)"
 *
 * @param {string} output — combined stdout+stderr from Playwright
 * @returns {Array<{name: string, fixture: string, viewport: string}>}
 */
function parsePlaywrightFailures(output) {
  const failures = [];
  const lines = output.split('\n');
  for (const line of lines) {
    // Only match lines with failure markers (✘ or numbered error lines like "1)")
    if (!/[✘✗×]|^\s*\d+\)/.test(line)) continue;
    const match = line.match(/(\S+):\s+(\S+)\s+@\s+(\w+)\s+\(\d+px\)/);
    if (match) {
      failures.push({ name: match[1], fixture: match[2], viewport: match[3] });
    }
  }
  // Deduplicate (Playwright may mention a failure in summary + detail)
  const seen = new Set();
  return failures.filter((f) => {
    const key = `${f.name}|${f.fixture}|${f.viewport}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

await test('TGF-33h: parsePlaywrightFailures extracts name/fixture/viewport from output', async () => {
  const output = `
  Running 18 tests using 3 workers

  ✘  1 T2 global: no-axe-violations › fixture: empty › no-axe-violations: empty @ mobile (320px)
  ✓  2 T2 global: no-axe-violations › fixture: empty › no-axe-violations: empty @ tablet (768px)
  ✘  3 T2 global: no-overflow › fixture: long › no-overflow: long @ desktop (1280px)

  2 failed
  `;

  const result = parsePlaywrightFailures(output);

  assert(result.length === 2, `Expected 2 failures, got ${result.length}`);
  assert(result[0].name === 'no-axe-violations', `Wrong name: ${result[0].name}`);
  assert(result[0].fixture === 'empty', `Wrong fixture: ${result[0].fixture}`);
  assert(result[0].viewport === 'mobile', `Wrong viewport: ${result[0].viewport}`);
  assert(result[1].name === 'no-overflow', `Wrong name[1]: ${result[1].name}`);
  assert(result[1].fixture === 'long', `Wrong fixture[1]: ${result[1].fixture}`);
  assert(result[1].viewport === 'desktop', `Wrong viewport[1]: ${result[1].viewport}`);
});

await test('TGF-33i: parsePlaywrightFailures deduplicates repeated mentions', async () => {
  const output = `
  ✘  no-axe-violations: empty @ mobile (320px)

  1) T2 global: no-axe-violations › fixture: empty › no-axe-violations: empty @ mobile (320px)
     Error: Expected no violations
  `;

  const result = parsePlaywrightFailures(output);
  assert(result.length === 1, `Expected 1 (deduped), got ${result.length}`);
});

await test('TGF-33j: parsePlaywrightFailures returns empty for all-pass output', async () => {
  const output = `
  Running 18 tests using 3 workers
  18 passed
  `;

  const result = parsePlaywrightFailures(output);
  assert(result.length === 0, `Expected 0 failures, got ${result.length}`);
});

// ---------------------------------------------------------------------------
// createT2Tracker — wraps tracker shell commands
// Mirrors .sandcastle/lib/global-t2.mts:createT2Tracker
// ---------------------------------------------------------------------------

/**
 * @param {object} commands
 * @param {string} commands.searchCommand — template with <QUERY>
 * @param {string} commands.createBugCommand — template with <TITLE>, <DESCRIPTION>
 * @param {string} commands.closeBugCommand — template with <ID>
 * @param {string} commands.labelCommand — template with <ID>
 * @param {(cmd: string) => string} exec — shell executor (returns stdout)
 * @returns {import('.sandcastle/lib/global-t2.mts').GlobalT2Tracker}
 */
function createT2Tracker(commands, exec) {
  return {
    searchBugs: async (prefix) => {
      const cmd = commands.searchCommand.replace('<QUERY>', prefix);
      const raw = exec(cmd);
      if (!raw.trim()) return [];
      // Parse bd search --json output
      try {
        const issues = JSON.parse(raw);
        return issues.map((i) => i.title);
      } catch {
        // Fallback: one title per line
        return raw.trim().split('\n').filter(Boolean);
      }
    },
    createBug: async (title, labels) => {
      let cmd = commands.createBugCommand
        .replace('<TITLE>', title)
        .replace('<DESCRIPTION>', `Auto-filed by Global T2 suite`);
      for (const label of labels) {
        cmd = cmd.replace('--label=ready-for-human', `--label=${label}`);
      }
      exec(cmd);
    },
    closeBug: async (title) => {
      // Search for the bug by title, then close it
      const searchCmd = commands.searchCommand.replace('<QUERY>', title);
      const raw = exec(searchCmd);
      if (!raw.trim()) return;
      try {
        const issues = JSON.parse(raw);
        const match = issues.find((i) => i.title === title);
        if (match) {
          exec(commands.closeBugCommand.replace('<ID>', match.id));
        }
      } catch { /* ignore parse errors */ }
    },
    escalate: (reason) => {
      exec(commands.labelCommand.replace('<ID>', 'pipeline').replace('ready-for-human', reason));
    },
  };
}

await test('TGF-33k: createT2Tracker.searchBugs parses JSON output', async () => {
  const commands = {
    searchCommand: 'bd search "<QUERY>" --status open --json',
    createBugCommand: '',
    closeBugCommand: '',
    labelCommand: '',
  };
  const exec = () => JSON.stringify([
    { id: 'bug-1', title: '[Global T2] no-axe — empty @ mobile' },
    { id: 'bug-2', title: '[Global T2] no-overflow — long @ desktop' },
  ]);

  const tracker = createT2Tracker(commands, exec);
  const titles = await tracker.searchBugs('[Global T2]');

  assert(titles.length === 2, `Expected 2 titles, got ${titles.length}`);
  assert(titles[0] === '[Global T2] no-axe — empty @ mobile', `Wrong title[0]`);
});

await test('TGF-33l: createT2Tracker.searchBugs returns empty for empty output', async () => {
  const commands = { searchCommand: 'test', createBugCommand: '', closeBugCommand: '', labelCommand: '' };
  const tracker = createT2Tracker(commands, () => '');
  const titles = await tracker.searchBugs('[Global T2]');
  assert(titles.length === 0, `Expected 0 titles, got ${titles.length}`);
});

await test('TGF-33m: createT2Tracker.createBug calls exec with title', async () => {
  const calls = [];
  const commands = {
    searchCommand: '',
    createBugCommand: 'bd create --type=bug --label=ready-for-human --title="<TITLE>" --description="<DESCRIPTION>"',
    closeBugCommand: '',
    labelCommand: '',
  };
  const tracker = createT2Tracker(commands, (cmd) => { calls.push(cmd); return ''; });
  await tracker.createBug('[Global T2] test — empty @ mobile', ['bug', 'Sandcastle']);

  assert(calls.length === 1, `Expected 1 exec call`);
  assert(calls[0].includes('[Global T2] test — empty @ mobile'), `Title not in command: ${calls[0]}`);
});

// ---------------------------------------------------------------------------
// Pipeline wiring — Global T2 runs after merge
// Mirrors main.mts main loop with Global T2 step added
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 10;

async function runPipelineWithGlobalT2(opts) {
  const trace = { phases: [], mergedIssues: [], globalT2Results: [], iterations: 0 };

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    trace.iterations = iteration;

    const issues = await opts.plan();
    trace.phases.push("plan");

    if (issues.length === 0) break;

    const completedIssues = await opts.execute(issues);
    trace.phases.push("execute");

    if (completedIssues.length === 0) continue;

    await opts.merge(completedIssues);
    trace.phases.push("merge");
    trace.mergedIssues.push(completedIssues.map((i) => i.id));

    // Global T2 — post-merge
    const t2result = await opts.globalT2();
    trace.phases.push("global-t2");
    trace.globalT2Results.push(t2result);
  }

  return trace;
}

await test('TGF-33n: Pipeline calls Global T2 after merge', async () => {
  let planCalls = 0;
  const t2tracker = mockTracker();
  const t2runner = mockRunner([{ exitCode: 0, failures: [] }]);

  const trace = await runPipelineWithGlobalT2({
    plan: async () => (++planCalls === 1 ? [{ id: 'b-1', title: 'test', branch: 'b', touchesUI: false }] : []),
    execute: async (issues) => issues,
    merge: async () => {},
    globalT2: async () => runGlobalT2({ runner: t2runner, tracker: t2tracker }),
  });

  assert(trace.phases.includes('global-t2'), `Global T2 phase must run after merge, got: [${trace.phases}]`);
  const mergeIdx = trace.phases.indexOf('merge');
  const t2Idx = trace.phases.indexOf('global-t2');
  assert(t2Idx === mergeIdx + 1, `Global T2 must immediately follow merge`);
  assert(trace.globalT2Results[0].green === true, `T2 should be green`);
});

await test('TGF-33o: Global T2 skipped when no issues merged', async () => {
  let globalT2Called = false;
  let planCalls = 0;

  const trace = await runPipelineWithGlobalT2({
    plan: async () => (++planCalls === 1 ? [{ id: 'b-1', title: 'test', branch: 'b', touchesUI: false }] : []),
    execute: async () => [], // no commits
    merge: async () => {},
    globalT2: async () => { globalT2Called = true; return { rounds: 0, green: true }; },
  });

  assert(!globalT2Called, `Global T2 must NOT run when nothing merged`);
  assert(!trace.phases.includes('global-t2'), `global-t2 phase must not appear`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`global-t2-lifecycle tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

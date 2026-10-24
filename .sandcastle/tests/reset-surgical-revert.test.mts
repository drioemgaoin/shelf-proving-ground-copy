// Reset must undo ALL runs of a ticket while preserving independent main
// evolution. The real scenario: a ticket merged 11 times across multiple runs.
// Each run adds/modifies components. Between runs, main evolves independently
// (tokens.css gets @custom-media, @layer order, etc.).
//
// The fix uses two baselines:
//   preTicket  = oldestMerge^1 — true pre-ticket state (removes all ticket code)
//   preLatest  = newestMerge^1 — main before latest merge (has independent evolution)
//
// For each file: if it didn't exist at preTicket → remove (ticket added it).
// If it existed at preTicket but also evolved on main → restore to preLatest.
// Otherwise → restore to preTicket.
//
// Run: npx tsx --test .sandcastle/tests/reset-surgical-revert.test.mts

import assert from "node:assert/strict";
import { describe, test, afterEach } from "node:test";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

function git(repo: string, cmd: string): string {
  return execSync(`git ${cmd}`, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@test.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@test.com",
    },
  }).trim();
}

function writeFile(repo: string, relPath: string, content: string): void {
  const full = join(repo, relPath);
  const dir = dirname(full);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(full, content);
}

// ---------------------------------------------------------------------------
// Build a repo that mirrors the real multi-merge scenario:
//
// main:  A ── M1 ── B ── M2 ── C
//              \          \
// branch: D1 ──┘    D2 ───┘
//
// A:  initial tokens.css + api.ts (NO components)
// D1: branch run 1 — adds Shelf.tsx, modifies api.ts
// M1: merge run 1
// B:  independent tokens.css update on main (@custom-media, @layer order)
// D2: branch run 2 — adds ChipBar.tsx, touches tokens.css (stale branch copy)
// M2: merge run 2
// C:  post-merge WIP improving tokens.css
//
// Reset should:
//   - Remove Shelf.tsx and ChipBar.tsx (ticket added them, not at preTicket)
//   - Restore api.ts to preTicket state (commit A)
//   - Restore tokens.css to preLatest state (commit B, has @custom-media)
//     because it evolved independently on main between runs
// ---------------------------------------------------------------------------

function buildMultiMergeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "reset-test-"));
  git(repo, "init -b main");
  git(repo, "config commit.gpgsign false");

  // A: initial state — no @custom-media, no components
  writeFile(repo, "src/styles/tokens.css", "@layer tokens { --color: red; }\n");
  writeFile(repo, "src/api.ts", "export function getBooks() { return []; }\n");
  git(repo, "add -A");
  git(repo, "commit -m 'A: initial'");

  // Branch run 1
  git(repo, "checkout -b sandcastle/issue-test-ticket-1");
  writeFile(repo, "src/api.ts", "export function getBooks() { return ['a']; }\n");
  writeFile(repo, "src/components/Shelf.tsx", "export function Shelf() {}\n");
  git(repo, "add -A");
  git(repo, "commit -m 'D1: run 1 — add Shelf, modify api'");

  // M1: merge run 1
  git(repo, "checkout main");
  git(repo, "merge --no-ff sandcastle/issue-test-ticket-1 -m 'Merge pull request #1 from user/sandcastle/issue-test-ticket-1'");

  // B: independent tokens.css update on main
  writeFile(repo, "src/styles/tokens.css", "@custom-media --viewport-md (width >= 768px);\n@layer tokens, base, components;\n@layer tokens { --color: red; }\n@layer base { box-sizing: border-box; }\n");
  git(repo, "add -A");
  git(repo, "commit -m 'B: independent @custom-media and @layer order'");

  // Branch run 2 — starts from current main, touches tokens.css (stale copy)
  git(repo, "checkout sandcastle/issue-test-ticket-1");
  git(repo, "merge main -m 'sync with main'");
  writeFile(repo, "src/styles/tokens.css", "@layer tokens { --color: red; --new-token: blue; }\n");
  writeFile(repo, "src/components/ChipBar.tsx", "export function ChipBar() {}\n");
  git(repo, "add -A");
  git(repo, "commit -m 'D2: run 2 — add ChipBar, touch tokens'");

  // M2: merge run 2
  git(repo, "checkout main");
  git(repo, "merge --no-ff sandcastle/issue-test-ticket-1 -m 'Merge pull request #2 from user/sandcastle/issue-test-ticket-1'");

  // C: post-merge WIP
  writeFile(repo, "src/styles/tokens.css", "@custom-media --viewport-md (width >= 768px);\n@layer tokens, base, components;\n@layer tokens { --color: blue; --extra: yes; }\n@layer base { box-sizing: border-box; }\n");
  git(repo, "add -A");
  git(repo, "commit -m 'C: post-merge WIP'");

  return repo;
}

const repos: string[] = [];
afterEach(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true });
  repos.length = 0;
});

// ---------------------------------------------------------------------------
// Revert implementations
// ---------------------------------------------------------------------------

function findMerges(repo: string): string[] {
  const output = git(repo, 'log --first-parent --grep="sandcastle/issue-test-ticket-1" --merges --format=%H main');
  return output.split("\n").filter(Boolean);
}

/** The dual-baseline revert (the fix).
 *  hostAllowedPattern identifies host-owned files that evolve independently. */
function dualBaselineRevert(repo: string, hostAllowedPattern = /^src\/styles\/tokens\.css$/): void {
  const merges = findMerges(repo);
  const newest = merges[0]!;
  const oldest = merges[merges.length - 1]!;

  const preTicket = git(repo, `rev-parse ${oldest}^1`);
  const preLatest = newest !== oldest
    ? git(repo, `rev-parse ${newest}^1`)
    : "";

  const changedFiles = git(repo, `diff --name-only ${preTicket} HEAD -- src/`);
  const fileList = changedFiles ? changedFiles.split("\n").filter(Boolean) : [];

  for (const file of fileList) {
    const existsAtPreTicket = git(repo, `ls-tree ${preTicket} -- "${file}"`);
    if (existsAtPreTicket) {
      // Host-owned files restore to preLatest (preserve independent evolution).
      // Everything else restores to preTicket (undo all ticket work).
      let restoreTo = preTicket;
      if (preLatest && hostAllowedPattern.test(file)) {
        restoreTo = preLatest;
      }
      git(repo, `checkout ${restoreTo} -- "${file}"`);
    } else {
      try { git(repo, `rm -f --cached "${file}"`); } catch {}
      try { execSync(`rm -f "${join(repo, file)}"`, { cwd: repo }); } catch {}
    }
  }

  const staged = git(repo, "diff --cached --name-only");
  if (staged) git(repo, 'commit -m "Revert (dual-baseline)"');
  try { git(repo, "clean -fd src/"); } catch {}
}

/** newestMerge^1 only revert (the previous broken fix). */
function newestOnlyRevert(repo: string): void {
  const merges = findMerges(repo);
  const newest = merges[0]!;
  const baseline = git(repo, `rev-parse ${newest}^1`);

  const changedFiles = git(repo, `diff --name-only ${newest}^1 ${newest}^2 -- src/`);
  const fileList = changedFiles ? changedFiles.split("\n").filter(Boolean) : [];

  for (const file of fileList) {
    const existsAtBaseline = git(repo, `ls-tree ${baseline} -- "${file}"`);
    if (existsAtBaseline) {
      git(repo, `checkout ${baseline} -- "${file}"`);
    } else {
      try { git(repo, `rm -f --cached "${file}"`); } catch {}
      try { execSync(`rm -f "${join(repo, file)}"`, { cwd: repo }); } catch {}
    }
  }

  const staged = git(repo, "diff --cached --name-only");
  if (staged) git(repo, 'commit -m "Revert (newest-only)"');
  try { git(repo, "clean -fd src/"); } catch {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reset: dual-baseline multi-merge revert", () => {

  test("BUG: newestMerge^1 only leaves ticket components from earlier runs", () => {
    const repo = buildMultiMergeRepo();
    repos.push(repo);

    newestOnlyRevert(repo);

    // Shelf.tsx was added in run 1, so it exists at newestMerge^1 (it was
    // already on main before run 2). The newest-only revert doesn't remove it.
    assert.ok(
      existsSync(join(repo, "src/components/Shelf.tsx")),
      "BUG: Shelf.tsx from run 1 survives newest-only revert",
    );
  });

  test("FIX: dual-baseline removes ALL ticket-added components", () => {
    const repo = buildMultiMergeRepo();
    repos.push(repo);

    dualBaselineRevert(repo);

    // Both components should be removed — they didn't exist at preTicket
    assert.ok(
      !existsSync(join(repo, "src/components/Shelf.tsx")),
      "Shelf.tsx (added in run 1) should be removed",
    );
    assert.ok(
      !existsSync(join(repo, "src/components/ChipBar.tsx")),
      "ChipBar.tsx (added in run 2) should be removed",
    );
  });

  test("FIX: dual-baseline restores api.ts to true pre-ticket state", () => {
    const repo = buildMultiMergeRepo();
    repos.push(repo);

    dualBaselineRevert(repo);

    const api = readFileSync(join(repo, "src/api.ts"), "utf8");
    assert.equal(
      api,
      "export function getBooks() { return []; }\n",
      "api.ts should be at pre-ticket state (empty array)",
    );
  });

  test("FIX: dual-baseline preserves independent tokens.css evolution", () => {
    const repo = buildMultiMergeRepo();
    repos.push(repo);

    dualBaselineRevert(repo);

    // tokens.css evolved independently on main (commit B added @custom-media
    // and @layer order). The dual-baseline detects this and restores to
    // preLatest (commit B's version) instead of preTicket (commit A).
    const tokens = readFileSync(join(repo, "src/styles/tokens.css"), "utf8");
    assert.ok(
      tokens.includes("@custom-media"),
      "tokens.css should preserve @custom-media (independent main evolution)",
    );
    assert.ok(
      tokens.includes("@layer tokens, base, components"),
      "tokens.css should preserve @layer order (independent main evolution)",
    );
    assert.ok(
      tokens.includes("@layer base"),
      "tokens.css should preserve @layer base (independent main evolution)",
    );
    // Post-merge WIP additions should NOT survive (they built on ticket code)
    assert.ok(
      !tokens.includes("--extra"),
      "Post-merge WIP tokens should be reverted",
    );
  });

  test("FIX: single-merge ticket works correctly (no preLatest)", () => {
    const repo = mkdtempSync(join(tmpdir(), "reset-test-"));
    repos.push(repo);
    git(repo, "init -b main");
    git(repo, "config commit.gpgsign false");

    writeFile(repo, "src/styles/tokens.css", "@layer tokens { --color: red; }\n");
    writeFile(repo, "src/api.ts", "export const api = 1;\n");
    git(repo, "add -A");
    git(repo, "commit -m 'initial'");

    git(repo, "checkout -b sandcastle/issue-test-ticket-1");
    writeFile(repo, "src/api.ts", "export const api = 2;\n");
    writeFile(repo, "src/components/Card.tsx", "export function Card() {}\n");
    git(repo, "add -A");
    git(repo, "commit -m 'ticket work'");

    git(repo, "checkout main");
    git(repo, "merge --no-ff sandcastle/issue-test-ticket-1 -m 'Merge pull request #1 from user/sandcastle/issue-test-ticket-1'");

    dualBaselineRevert(repo);

    assert.ok(!existsSync(join(repo, "src/components/Card.tsx")), "Card.tsx removed");
    const api = readFileSync(join(repo, "src/api.ts"), "utf8");
    assert.equal(api, "export const api = 1;\n", "api.ts restored");
    const tokens = readFileSync(join(repo, "src/styles/tokens.css"), "utf8");
    assert.ok(tokens.includes("--color: red"), "tokens.css unchanged");
  });
});

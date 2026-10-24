// Reset must only revert src/ files the ticket branch changed in its LATEST
// run — and restore them to what main had right before that merge, not to
// some ancient baseline.
//
// The real-world scenario: 11 merges for the same ticket across multiple
// runs. Between runs, main evolves independently (tokens.css gets @custom-media,
// @layer order, etc.). The branch also touches tokens.css. On reset, tokens.css
// appears in the merge diff. Using the oldest merge's parent as baseline
// restores tokens.css to the initial project state, wiping all independent
// evolution. The fix: use newestMerge^1 as both diff source and restore target.
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
// Build a repo that mirrors the real scenario with MULTIPLE merges:
//
// main:  A ── M1 ── B ── M2 ── C
//              \          \
// branch: D1 ──┘    D2 ───┘
//
// A:  initial tokens.css + api.ts
// D1: branch run 1 — modifies api.ts (tokens.css unchanged on branch)
// M1: merge run 1 into main
// B:  independent tokens.css update on main (NOT part of ticket)
// D2: branch run 2 — adds Shelf.tsx, also touches tokens.css (stale branch copy)
// M2: merge run 2 into main (tokens.css shows in diff because branch had old version)
// C:  post-merge WIP commit improving tokens.css
//
// Reset should use M2^1 (commit B state) as baseline — NOT M1^1 (commit A state).
// tokens.css IS in the M2 diff (branch touched it), so it gets reverted — but
// to B's version (which has @custom-media), not A's version (which doesn't).
// ---------------------------------------------------------------------------

function buildMultiMergeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "reset-test-"));
  git(repo, "init -b main");
  git(repo, "config commit.gpgsign false");

  // A: initial state — no @custom-media, no @layer order
  writeFile(repo, "src/styles/tokens.css", "@layer tokens { --color: red; }\n");
  writeFile(repo, "src/api.ts", "export function getBooks() { return []; }\n");
  git(repo, "add -A");
  git(repo, "commit -m 'A: initial'");

  // Branch run 1
  git(repo, "checkout -b sandcastle/issue-test-ticket-1");
  writeFile(repo, "src/api.ts", "export function getBooks() { return ['a']; }\n");
  git(repo, "add -A");
  git(repo, "commit -m 'D1: run 1'");

  // M1: merge run 1
  git(repo, "checkout main");
  git(repo, "merge --no-ff sandcastle/issue-test-ticket-1 -m 'Merge pull request #1 from user/sandcastle/issue-test-ticket-1'");

  // B: independent tokens.css update on main between runs
  writeFile(repo, "src/styles/tokens.css", "@custom-media --viewport-md (width >= 768px);\n@layer tokens, base, components;\n@layer tokens { --color: red; }\n@layer base { box-sizing: border-box; }\n");
  git(repo, "add -A");
  git(repo, "commit -m 'B: add @custom-media and @layer order (independent)'");

  // Branch run 2 — starts from current main but has stale tokens.css
  git(repo, "checkout sandcastle/issue-test-ticket-1");
  git(repo, "merge main -m 'sync with main'");
  // Simulate the branch having a different tokens.css (common in sandcastle:
  // the builder modifies tokens.css to add component tokens)
  writeFile(repo, "src/styles/tokens.css", "@layer tokens { --color: red; --new-token: blue; }\n");
  writeFile(repo, "src/components/Shelf.tsx", "export function Shelf() {}\n");
  git(repo, "add -A");
  git(repo, "commit -m 'D2: run 2 — adds Shelf, touches tokens'");

  // M2: merge run 2
  git(repo, "checkout main");
  git(repo, "merge --no-ff sandcastle/issue-test-ticket-1 -m 'Merge pull request #2 from user/sandcastle/issue-test-ticket-1'");

  // C: post-merge WIP
  writeFile(repo, "src/styles/tokens.css", "@custom-media --viewport-md (width >= 768px);\n@layer tokens, base, components;\n@layer tokens { --color: blue; --extra: yes; }\n@layer base { box-sizing: border-box; }\n");
  git(repo, "add -A");
  git(repo, "commit -m 'C: post-merge WIP improvements'");

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

/** Surgical revert using newestMerge^1 as baseline (the fix). */
function surgicalRevertFixed(repo: string, newestMerge: string): void {
  const baseline = git(repo, `rev-parse ${newestMerge}^1`);
  const changedFiles = git(repo, `diff --name-only ${newestMerge}^1 ${newestMerge}^2 -- src/`);
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
  if (staged) git(repo, 'commit -m "Revert (fixed)"');
  try { git(repo, "clean -fd src/"); } catch {}
}

/** Broken revert using oldestMerge^1 as baseline (the bug). */
function surgicalRevertBroken(repo: string, oldestMerge: string, newestMerge: string): void {
  const baseline = git(repo, `rev-parse ${oldestMerge}^1`);
  const changedFiles = git(repo, `diff --name-only ${oldestMerge}^1 ${newestMerge}^2 -- src/`);
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
  if (staged) git(repo, 'commit -m "Revert (broken)"');
  try { git(repo, "clean -fd src/"); } catch {}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findMerges(repo: string): string[] {
  const output = git(repo, 'log --first-parent --grep="sandcastle/issue-test-ticket-1" --merges --format=%H main');
  return output.split("\n").filter(Boolean);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reset: multi-merge baseline selection", () => {

  test("BUG: using oldestMerge^1 as baseline clobbers independent changes", () => {
    const repo = buildMultiMergeRepo();
    repos.push(repo);

    const merges = findMerges(repo);
    assert.equal(merges.length, 2, "Should find 2 merge commits");
    const newest = merges[0]!;
    const oldest = merges[1]!;

    // Before revert: tokens.css has @custom-media (from post-merge WIP)
    const before = readFileSync(join(repo, "src/styles/tokens.css"), "utf8");
    assert.ok(before.includes("@custom-media"), "Pre-revert: tokens.css has @custom-media");

    // Run the broken revert (oldestMerge^1 = commit A, before @custom-media existed)
    surgicalRevertBroken(repo, oldest, newest);

    // tokens.css was clobbered to commit A state — @custom-media is gone
    const after = readFileSync(join(repo, "src/styles/tokens.css"), "utf8");
    assert.ok(
      !after.includes("@custom-media"),
      "BUG: oldestMerge^1 baseline lost @custom-media (added independently between runs)",
    );
    assert.ok(
      !after.includes("@layer tokens, base, components"),
      "BUG: oldestMerge^1 baseline lost @layer order (added independently between runs)",
    );
  });

  test("FIX: using newestMerge^1 as baseline preserves independent changes", () => {
    const repo = buildMultiMergeRepo();
    repos.push(repo);

    const merges = findMerges(repo);
    const newest = merges[0]!;

    // Before revert: tokens.css has post-merge WIP content
    const before = readFileSync(join(repo, "src/styles/tokens.css"), "utf8");
    assert.ok(before.includes("@custom-media"), "Pre-revert: tokens.css has @custom-media");
    assert.ok(before.includes("--extra: yes"), "Pre-revert: tokens.css has WIP additions");

    // Run the fixed revert (newestMerge^1 = commit B, which has @custom-media)
    surgicalRevertFixed(repo, newest);

    // tokens.css was restored to commit B state — @custom-media is preserved
    const after = readFileSync(join(repo, "src/styles/tokens.css"), "utf8");
    assert.ok(
      after.includes("@custom-media"),
      "FIX: newestMerge^1 baseline preserves @custom-media",
    );
    assert.ok(
      after.includes("@layer tokens, base, components"),
      "FIX: newestMerge^1 baseline preserves @layer order",
    );
    assert.ok(
      after.includes("@layer base"),
      "FIX: newestMerge^1 baseline preserves @layer base block",
    );

    // Post-merge WIP additions (--extra, --color: blue) are lost — that's correct,
    // they were built on ticket code being reset
    assert.ok(!after.includes("--extra"), "Post-merge WIP tokens are correctly reverted");

    // Ticket-added file should be removed
    assert.ok(
      !existsSync(join(repo, "src/components/Shelf.tsx")),
      "Shelf.tsx (added by ticket) should be removed",
    );

    // api.ts should be restored to newestMerge^1 state
    const apiAfter = readFileSync(join(repo, "src/api.ts"), "utf8");
    assert.ok(
      apiAfter.includes("return ['a']"),
      "api.ts should be at merge^1 state (includes run 1 changes that were already merged)",
    );
  });

  test("FIX: files not changed by the latest merge are untouched", () => {
    const repo = buildMultiMergeRepo();
    repos.push(repo);

    const merges = findMerges(repo);
    const newest = merges[0]!;

    // Check which files the latest merge changed
    const changed = git(repo, `diff --name-only ${newest}^1 ${newest}^2 -- src/`);
    const fileList = changed.split("\n").filter(Boolean);

    // api.ts was NOT changed in run 2 (only run 1 touched it)
    // It should NOT appear in the latest merge diff
    assert.ok(
      !fileList.includes("src/api.ts"),
      "api.ts was only changed in run 1, not in run 2 — should not be in latest merge diff",
    );

    // tokens.css WAS changed in run 2 (branch had stale copy)
    assert.ok(
      fileList.includes("src/styles/tokens.css"),
      "tokens.css was changed in run 2 — should be in latest merge diff",
    );

    // Shelf.tsx was added in run 2
    assert.ok(
      fileList.includes("src/components/Shelf.tsx"),
      "Shelf.tsx was added in run 2 — should be in latest merge diff",
    );
  });
});

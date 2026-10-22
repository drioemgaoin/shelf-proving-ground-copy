// Proof that concurrent `git config --global` calls in the sandbox container
// never race on .gitconfig.lock.
//
// The @ai-hero/sandcastle library runs `git config --global --add safe.directory`
// during every sandbox.run() setup.  When parallel QA gates (visual-qa +
// code-review) launch on the same sandbox, two setup sequences run concurrently,
// each calling git config --global.  Without serialization, git's O_EXCL lock
// on ~/.gitconfig.lock makes one of them fail with exit 255.
//
// This test reproduces the exact race by running N concurrent git config calls
// inside the warm image and asserting ALL succeed.
//
// Run: npx tsx --test .sandcastle/tests/git-config-lock.test.mts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Helper: run a command in a fresh container from the warm image
// ---------------------------------------------------------------------------

function dockerAvailable(): boolean {
  try {
    execSync("docker info", { encoding: "utf8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getWarmImage(): string {
  const output = execSync("bash .sandcastle/docker/build-warm.sh", {
    encoding: "utf8",
    timeout: 300_000,
  });
  return output.trim().split("\n").pop()!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("git config lock: concurrent writes in Docker", () => {
  test("the flock wrapper is installed at /usr/local/bin/git", () => {
    if (!dockerAvailable()) return;
    const image = getWarmImage();

    const result = execSync(
      `docker run --rm --entrypoint sh ${image} -c 'which git && test -x /usr/local/bin/git && echo WRAPPER_OK'`,
      { encoding: "utf8", timeout: 30_000 },
    );

    assert.ok(
      result.includes("/usr/local/bin/git"),
      `Expected /usr/local/bin/git in PATH, got: ${result}`,
    );
    assert.ok(
      result.includes("WRAPPER_OK"),
      "Wrapper script must be executable at /usr/local/bin/git",
    );
  });

  test("the wrapper serializes git config --global via flock", () => {
    if (!dockerAvailable()) return;
    const image = getWarmImage();

    const result = execSync(
      `docker run --rm --entrypoint sh ${image} -c '
        cat /usr/local/bin/git | grep -q "flock" && echo FLOCK_FOUND
      '`,
      { encoding: "utf8", timeout: 30_000 },
    );

    assert.ok(
      result.includes("FLOCK_FOUND"),
      "Wrapper must use flock to serialize git config --global",
    );
  });

  test("10 concurrent git config --global calls all succeed", () => {
    if (!dockerAvailable()) return;
    const image = getWarmImage();

    // This is the exact race: N parallel `git config --global --add safe.directory`
    // calls, mimicking what happens when sandbox.run() is called concurrently
    // for visual-qa + code-review checkers on the same container.
    //
    // Each subshell writes its exit code to a temp file so we can count
    // failures reliably (jobs -p is unreliable when PIDs exit before collection).
    const result = execSync(
      `docker run --rm --entrypoint sh ${image} -c '
        mkdir -p /tmp/results
        for i in $(seq 1 10); do
          ( git config --global --add safe.directory "/dir-$i" 2>/tmp/results/err-$i; echo $? > /tmp/results/exit-$i ) &
        done
        wait
        FAIL=0
        for i in $(seq 1 10); do
          code=$(cat /tmp/results/exit-$i 2>/dev/null || echo 1)
          [ "$code" != "0" ] && FAIL=$((FAIL+1))
        done
        echo "FAILED=$FAIL"
        echo "ENTRIES=$(git config --global --get-all safe.directory | wc -l | tr -d " ")"
      '`,
      { encoding: "utf8", timeout: 30_000 },
    );

    // Extract results
    const failMatch = result.match(/FAILED=(\d+)/);
    const entriesMatch = result.match(/ENTRIES=(\d+)/);

    assert.ok(failMatch, `Could not parse FAILED count from: ${result}`);
    assert.ok(entriesMatch, `Could not parse ENTRIES count from: ${result}`);

    const failed = parseInt(failMatch![1]!, 10);
    const entries = parseInt(entriesMatch![1]!, 10);

    assert.equal(
      failed,
      0,
      `Expected 0 failures, got ${failed}. ` +
      `Without the flock wrapper, concurrent git config --global races on .gitconfig.lock. ` +
      `Output: ${result}`,
    );
    assert.equal(
      entries,
      10,
      `Expected 10 safe.directory entries, got ${entries}. Some writes were lost.`,
    );
  });

  test("non-global git commands bypass the wrapper with zero overhead", () => {
    if (!dockerAvailable()) return;
    const image = getWarmImage();

    // Ensure the wrapper doesn't accidentally flock non-global git commands
    const result = execSync(
      `docker run --rm --entrypoint sh ${image} -c '
        mkdir -p /tmp/repo && cd /tmp/repo && git init -q
        git config user.name "test" && echo LOCAL_OK
        git rev-parse --git-dir && echo REVPARSE_OK
      '`,
      { encoding: "utf8", timeout: 30_000 },
    );

    assert.ok(result.includes("LOCAL_OK"), "Local git config must work without flock");
    assert.ok(result.includes("REVPARSE_OK"), "git rev-parse must work without flock");
  });
});

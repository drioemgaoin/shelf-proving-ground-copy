#!/usr/bin/env bash
# sandcastle:watch — live-preview a sandcastle worktree on the host.
#
# Builds an ephemeral directory that symlinks source files from the worktree
# and node_modules from the repo root, so Vite can serve the UI without
# touching Docker's node_modules inside the worktree.
#
# Loops: waits for a worktree to appear, serves it with Vite, and when the
# worktree disappears (sandcastle run finishes) it tears down and waits again.
#
# Usage:
#   npm run sandcastle:watch                          # auto-detect worktree
#   npm run sandcastle:watch -- <worktree-dir-name>   # explicit worktree (no loop)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKTREES_DIR="$REPO_ROOT/.sandcastle/worktrees"
WATCH_DIR="$REPO_ROOT/.sandcastle/watch"

# ── Helpers ──────────────────────────────────────────────────────────────────

cleanup() { rm -rf "$WATCH_DIR"; }
trap cleanup EXIT

find_worktree() {
  find "$WORKTREES_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1
}

wait_for_worktree() {
  echo "⏳ Waiting for a sandcastle worktree..."
  while true; do
    local wt
    wt=$(find_worktree)
    [[ -n "${wt:-}" && -d "$wt" ]] && { echo "$wt"; return; }
    sleep 2
  done
}

setup_watch_dir() {
  local worktree="$1"
  rm -rf "$WATCH_DIR"
  mkdir -p "$WATCH_DIR"

  # Source from worktree (agent's changes appear in real time)
  ln -sf "$worktree/index.html" "$WATCH_DIR/index.html"
  ln -sf "$worktree/src"        "$WATCH_DIR/src"
  [[ -d "$worktree/public" ]] && ln -sf "$worktree/public" "$WATCH_DIR/public"

  # Deps from repo root (host-native, not Docker's linux binaries)
  ln -sf "$REPO_ROOT/node_modules" "$WATCH_DIR/node_modules"

  # Config files — copy (Vite resolves relative to config location)
  cp "$REPO_ROOT/vite.config.ts" "$WATCH_DIR/"
  [[ -f "$REPO_ROOT/tsconfig.json" ]] && cp "$REPO_ROOT/tsconfig.json" "$WATCH_DIR/"
}

# ── Check host deps ─────────────────────────────────────────────────────────
if ! command -v npx &>/dev/null; then
  echo "error: npx not found. Node.js must be installed."
  exit 1
fi

# ── Explicit worktree mode (no loop) ────────────────────────────────────────
if [[ $# -gt 0 ]]; then
  WORKTREE="$WORKTREES_DIR/$1"
  if [[ ! -d "$WORKTREE" ]]; then
    echo "error: worktree '$1' not found in $WORKTREES_DIR"
    exit 1
  fi
  echo "👁  Watching: $(basename "$WORKTREE")"
  setup_watch_dir "$WORKTREE"
  cd "$WATCH_DIR"
  exec npx vite --host
fi

# ── Loop mode (auto-detect) ─────────────────────────────────────────────────
while true; do
  WORKTREE=$(find_worktree)
  if [[ -z "${WORKTREE:-}" || ! -d "$WORKTREE" ]]; then
    WORKTREE=$(wait_for_worktree)
  fi

  echo "👁  Watching: $(basename "$WORKTREE")"
  setup_watch_dir "$WORKTREE"

  # Run Vite in the foreground; kill it when the worktree disappears
  cd "$WATCH_DIR"
  npx vite --host &
  VITE_PID=$!

  # Poll until the worktree is removed (sandcastle finished)
  while [[ -d "$WORKTREE" ]]; do
    sleep 3
  done

  echo ""
  echo "🔄 Worktree gone — stopping Vite..."
  kill "$VITE_PID" 2>/dev/null || true
  wait "$VITE_PID" 2>/dev/null || true
  rm -rf "$WATCH_DIR"
  cd "$REPO_ROOT"

  echo "🔄 Ready for next sandcastle run."
done

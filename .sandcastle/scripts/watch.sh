#!/usr/bin/env bash
# sandcastle:watch — live-preview a sandcastle worktree on the host.
#
# Builds an ephemeral directory that symlinks source files from the worktree
# and node_modules from the repo root, so Vite can serve the UI without
# touching Docker's node_modules inside the worktree.
#
# Usage:
#   npm run sandcastle:watch                          # auto-detect worktree
#   npm run sandcastle:watch -- <worktree-dir-name>   # explicit worktree
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKTREES_DIR="$REPO_ROOT/.sandcastle/worktrees"
WATCH_DIR="$REPO_ROOT/.sandcastle/watch"

# ── Find worktree ────────────────────────────────────────────────────────────
if [[ $# -gt 0 ]]; then
  WORKTREE="$WORKTREES_DIR/$1"
else
  # Pick the only (or most recently modified) worktree
  WORKTREE=$(find "$WORKTREES_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)
fi

if [[ -z "${WORKTREE:-}" || ! -d "$WORKTREE" ]]; then
  echo "error: no sandcastle worktree found."
  echo "  Run 'npm run sandcastle' first, or pass the worktree name explicitly."
  exit 1
fi

echo "👁  Watching: $(basename "$WORKTREE")"

# ── Check host deps ──────────────────────────────────────────────────────────
if [[ ! -d "$REPO_ROOT/node_modules/vite" ]]; then
  echo "error: repo root has no node_modules. Run 'npm install' first."
  exit 1
fi

# ── Build watch directory ────────────────────────────────────────────────────
rm -rf "$WATCH_DIR"
mkdir -p "$WATCH_DIR"
cleanup() { rm -rf "$WATCH_DIR"; }
trap cleanup EXIT

# Source from worktree (agent's changes appear in real time)
ln -sf "$WORKTREE/index.html" "$WATCH_DIR/index.html"
ln -sf "$WORKTREE/src"        "$WATCH_DIR/src"
[[ -d "$WORKTREE/public" ]] && ln -sf "$WORKTREE/public" "$WATCH_DIR/public"

# Deps from repo root (host-native, not Docker's linux binaries)
ln -sf "$REPO_ROOT/node_modules" "$WATCH_DIR/node_modules"

# Config files — copy (Vite resolves relative to config location)
cp "$REPO_ROOT/vite.config.ts" "$WATCH_DIR/"
[[ -f "$REPO_ROOT/tsconfig.json" ]] && cp "$REPO_ROOT/tsconfig.json" "$WATCH_DIR/"

# ── Start Vite ───────────────────────────────────────────────────────────────
echo "Starting dev server..."
cd "$WATCH_DIR"
exec npx vite --host

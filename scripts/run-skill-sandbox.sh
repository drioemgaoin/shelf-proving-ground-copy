#!/usr/bin/env bash
# run-skill-sandbox.sh — Run a skill in a minimal Claude Code sandbox
#
# Usage:
#   ./run-skill-sandbox.sh <skill-name> [prompt]
#   ./run-skill-sandbox.sh rule-creator "Add enforcement to my rule"
#   ./run-skill-sandbox.sh rule-creator                # interactive mode
#
# Flags (env vars):
#   SANDBOX_TOOLS="Bash,Read,Grep,Glob,Edit,Write"   # tools to enable
#   SANDBOX_MODEL="sonnet"                            # model override
#   SANDBOX_ADD_DIR="/path/to/project"                # give access to project files
#   SANDBOX_INTERACTIVE=1                             # force interactive mode
#   SANDBOX_EXTRA_ARGS="--dangerously-skip-permissions"  # extra claude args
#
# Token comparison (tested on Opus 4.6):
#   Normal session (project dir):  ~26,000 input tokens
#   Clean /tmp (no overrides):     ~20,000 input tokens
#   This sandbox (skill loaded):   ~10,600 input tokens  (60% reduction)

set -euo pipefail

SKILL_NAME="${1:?Usage: $0 <skill-name> [prompt]}"
PROMPT="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR")"

# Search paths for skills (repo root, script dir, user home)
SEARCH_DIRS=(
  "$REPO_ROOT/.claude/skills"
  "$SCRIPT_DIR/.claude/skills"
  "$HOME/.claude/skills"
)

# Resolve skill file from search paths
SKILL_FILE=""
for dir in "${SEARCH_DIRS[@]}"; do
  if [[ -f "$dir/$SKILL_NAME/SKILL.md" ]]; then
    SKILL_FILE="$dir/$SKILL_NAME/SKILL.md"
    break
  fi
done

if [[ -z "$SKILL_FILE" ]]; then
  echo "Error: Skill '$SKILL_NAME' not found in any search path:"
  for dir in "${SEARCH_DIRS[@]}"; do
    echo "  $dir/"
  done
  echo ""
  echo "Available skills:"
  for dir in "${SEARCH_DIRS[@]}"; do
    ls -1 "$dir" 2>/dev/null | sed 's/^/  /'
  done | sort -u
  exit 1
fi

SKILLS_DIR="$(dirname "$(dirname "$SKILL_FILE")")"

# Collect any reference files the skill uses
REFS_DIR="$(dirname "$SKILL_FILE")/references"
SYSTEM_PROMPT=$(cat "$SKILL_FILE")
if [[ -d "$REFS_DIR" ]]; then
  for ref in "$REFS_DIR"/*; do
    [[ -f "$ref" ]] || continue
    REF_NAME=$(basename "$ref")
    SYSTEM_PROMPT+=$'\n\n'"--- Reference: $REF_NAME ---"$'\n'"$(cat "$ref")"
  done
fi

# Write combined prompt to temp file (avoids shell escaping issues)
TMPFILE=$(mktemp /tmp/skill-sandbox-prompt.XXXXXX)
trap 'rm -f "$TMPFILE"' EXIT
echo "$SYSTEM_PROMPT" > "$TMPFILE"

# Defaults
TOOLS="${SANDBOX_TOOLS:-Bash,Read,Grep,Glob,Edit,Write}"
ADD_DIR="${SANDBOX_ADD_DIR:-$SCRIPT_DIR}"

# Build args
ARGS=(
  --system-prompt-file "$TMPFILE"
  --disable-slash-commands
  --setting-sources ""
  --strict-mcp-config
  --tools "$TOOLS"
  --add-dir "$ADD_DIR"
)

# Optional model override
if [[ -n "${SANDBOX_MODEL:-}" ]]; then
  ARGS+=(--model "$SANDBOX_MODEL")
fi

# Extra args
if [[ -n "${SANDBOX_EXTRA_ARGS:-}" ]]; then
  # shellcheck disable=SC2086
  read -ra EXTRA <<< "$SANDBOX_EXTRA_ARGS"
  ARGS+=("${EXTRA[@]}")
fi

# Create sandbox working directory
SANDBOX_DIR=$(mktemp -d /tmp/skill-sandbox.XXXXXX)
trap 'rm -rf "$SANDBOX_DIR" "$TMPFILE"' EXIT

cd "$SANDBOX_DIR"

if [[ -n "$PROMPT" && "${SANDBOX_INTERACTIVE:-}" != "1" ]]; then
  # Non-interactive (print) mode
  ARGS+=(-p --no-session-persistence)
  exec claude "${ARGS[@]}" "$PROMPT"
else
  # Interactive mode
  exec claude "${ARGS[@]}"
fi

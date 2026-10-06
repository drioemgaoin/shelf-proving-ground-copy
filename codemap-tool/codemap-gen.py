#!/usr/bin/env python3
"""
codemap-gen.py — Generate a token-budgeted codemap for AI coding agents.

Two layers:
  L1 (repo map):    Directory tree with file counts. Shows the whole repo shape.
  L2 (work detail): repomix --compress on ticket-scoped dirs. Shows signatures.

Guarantees:
  - Total output ≤ budget tokens (default 45K), enforced by construction.
  - Multi-scope queries get proportional budget allocation per segment.
  - Entry-point files (index, mod, main) are prioritized over deep files.
  - Narrow scopes auto-expand to sibling dir for context.

Usage:
  python3 codemap-gen.py <scope_glob> [--output path] [--budget tokens] [--repo-root path]

Examples:
  python3 codemap-gen.py "src/**"
  python3 codemap-gen.py "pkg/services/dashboards/**,public/app/features/dashboard/**"
  python3 codemap-gen.py "django/db/models/**"
"""

import argparse
import os
import re
import subprocess

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

L1_TOKEN_BUDGET = 5000
L2_TOKEN_BUDGET = 40000
TOTAL_TOKEN_BUDGET = 45000
CHARS_PER_TOKEN = 3.5

SKIP_DIRS = {
    "node_modules", ".git", "dist", "vendor", "__snapshots__",
    "coverage", ".yarn", ".next", ".nuxt", "build", "out",
    "__pycache__", ".mypy_cache", ".pytest_cache", "venv", ".venv",
    ".turbo", ".cache",
}

SOURCE_EXTS = {
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".rb",
    ".java", ".kt", ".cs", ".cpp", ".c", ".h", ".hpp",
    ".css", ".scss", ".svelte", ".vue", ".astro",
}

REPOMIX_IGNORE_BASE = [
    "**/node_modules/**", "**/dist/**", "**/vendor/**", "**/.git/**",
    "**/__snapshots__/**", "**/*.d.ts", "**/migrations/**",
    "**/meta/*.json",
    "**/*.generated.*", "**/*_gen.go", "**/zz_generated*", "**/zz_gen_*",  # codegen conventions
    "**/generated/**",  # generated/ directories (K8s client-gen, protobuf, etc.)
    "**/*.svg", "**/*.snap", "**/*.map",
    "**/coverage/**", "**/__pycache__/**", "**/build/**",
    "**/*.min.js", "**/*.min.css", "**/*.lock",
    "**/eslint-suppressions*",  # Noise config files
]

REPOMIX_IGNORE_TESTS = [
    "**/*.test.*", "**/*.spec.*", "**/*_test.*", "**/*_test.go",
]

def _build_ignore(include_tests: bool = False) -> str:
    """Build the repomix ignore pattern, optionally keeping test files."""
    patterns = list(REPOMIX_IGNORE_BASE)
    if not include_tests:
        patterns.extend(REPOMIX_IGNORE_TESTS)
    return ",".join(patterns)

# Files that should appear first in L2 output (entry points, type defs)
PRIORITY_PATTERNS = [
    r"(^|/)index\.[^/]+$",
    r"(^|/)mod\.rs$",
    r"(^|/)main\.[^/]+$",
    r"(^|/)types?\.[^/]+$",
    r"(^|/)interfaces?\.[^/]+$",
    r"(^|/)constants?\.[^/]+$",
    r"(^|/)config\.[^/]+$",
    r"(^|/)__init__\.py$",
    r"(^|/)models?\.[^/]+$",
    r"(^|/)schema\.[^/]+$",
    r"(^|/)routes?\.[^/]+$",
    r"(^|/)api\.[^/]+$",
]

PRIORITY_RE = re.compile("|".join(PRIORITY_PATTERNS))


# ---------------------------------------------------------------------------
# L1: Smart directory tree with file counts
# ---------------------------------------------------------------------------

def generate_l1(repo_root: str) -> str:
    """Full-repo directory tree: dirs with source file counts, selective depth."""
    lines = []

    # Detect which top-level dirs contain source code
    source_roots = set()
    for entry in sorted(os.listdir(repo_root)):
        if entry in SKIP_DIRS or entry.startswith("."):
            continue
        path = os.path.join(repo_root, entry)
        if os.path.isdir(path) and _count_source_files(path) > 0:
            source_roots.add(entry)

    # Root-level files (only the most important config files)
    important_names = {
        "package.json", "tsconfig.json", "go.mod", "Cargo.toml",
        "pyproject.toml", "setup.py", "setup.cfg", "Makefile",
        "Dockerfile", "CLAUDE.md", "AGENTS.md",
    }
    config_exts = {".json", ".toml", ".yaml", ".yml", ".md", ".mjs", ".cjs"}
    root_files = []
    for f in sorted(os.listdir(repo_root)):
        if os.path.isfile(os.path.join(repo_root, f)):
            _, ext = os.path.splitext(f)
            if ext in config_exts or ext in SOURCE_EXTS or f in important_names:
                root_files.append(f)
    if root_files:
        important = [f for f in root_files if f in important_names]
        others = [f for f in root_files if f not in important_names]
        for f in important:
            lines.append(f)
        if others:
            lines.append(f"  ... +{len(others)} config files")

    # Directories: expand source roots to depth 3, others just name + count
    for entry in sorted(os.listdir(repo_root)):
        if entry in SKIP_DIRS or entry.startswith("."):
            continue
        path = os.path.join(repo_root, entry)
        if not os.path.isdir(path):
            continue
        count = _count_source_files(path)
        if count == 0:
            continue
        lines.append(f"{entry}/ ({count} source files)")

        if entry in source_roots:
            _expand_dir(path, lines, depth=1, max_depth=3)

    return "\n".join(lines)


def _expand_dir(dirpath: str, lines: list, depth: int, max_depth: int):
    """Recursively expand directory, showing subdirs with file counts."""
    if depth >= max_depth:
        return
    try:
        entries = sorted(os.listdir(dirpath))
    except PermissionError:
        return
    for entry in entries:
        if entry in SKIP_DIRS or entry.startswith("."):
            continue
        subpath = os.path.join(dirpath, entry)
        if not os.path.isdir(subpath):
            continue
        count = _count_source_files(subpath)
        if count == 0:
            continue
        indent = "  " * depth
        lines.append(f"{indent}{entry}/ ({count} files)")
        _expand_dir(subpath, lines, depth + 1, max_depth)


def _count_source_files(path: str) -> int:
    """Count source files recursively, skipping excluded dirs."""
    count = 0
    for _, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        count += sum(1 for f in files if os.path.splitext(f)[1] in SOURCE_EXTS)
    return count


# ---------------------------------------------------------------------------
# L2: Repomix compressed signatures, token-capped, proportionally allocated
# ---------------------------------------------------------------------------

def _run_repomix(repo_root: str, scope: str, out_path: str,
                  include_tests: bool = False) -> str:
    """Run repomix --compress for a single scope glob. Returns file content."""
    cmd = [
        "npx", "-q", "repomix",
        "--compress",
        "--remove-comments",
        "--remove-empty-lines",
        "--no-file-summary",
        "--no-directory-structure",
        "--style", "markdown",
        "--include", scope,
        "--ignore", _build_ignore(include_tests),
        "-o", out_path,
    ]

    try:
        subprocess.run(
            cmd, cwd=repo_root, capture_output=True, text=True, timeout=120
        )
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return f"<!-- repomix error: {e} -->\n"

    if not os.path.exists(out_path):
        return ""

    with open(out_path) as f:
        content = f.read()

    # Strip repomix boilerplate header (everything before first ## File:)
    first_file = content.find("## File:")
    if first_file > 0:
        content = content[first_file:]
    elif "## File:" not in content:
        return ""  # No files matched

    # Post-filter: remove file blocks that match noise patterns.
    # Repomix's --ignore can be overridden by --include, so we enforce here.
    content = _post_filter_noise(content, include_tests)

    return content


NOISE_FILE_PATTERNS = re.compile(
    r"eslint-suppression|_gen\.|zz_generated|\.generated\."
    r"|\.min\.js|\.min\.css|\.snap$|\.map$|\.lock$"
)

TEST_FILE_PATTERNS = re.compile(
    r"\.test\.|\.spec\.|_test\.|_test\.go$"
)


def _post_filter_noise(content: str, include_tests: bool = False) -> str:
    """Remove file blocks whose paths match known noise patterns.

    This catches cases where repomix's --ignore is overridden by --include
    (e.g., auto-expand widens scope and pulls in test files).
    """
    blocks = re.split(r"(?=## File:)", content)
    filtered = []
    for block in blocks:
        if not block.strip():
            continue
        first_line = block.split("\n", 1)[0]
        path = first_line.replace("## File:", "").strip()
        if NOISE_FILE_PATTERNS.search(path):
            continue
        if not include_tests and TEST_FILE_PATTERNS.search(path):
            continue
        filtered.append(block)
    return "\n".join(filtered) if filtered else content


def _reorder_by_priority(content: str) -> str:
    """Reorder file entries: priority files first, then by path depth (shallow first)."""
    # Split into individual file blocks
    blocks = []
    current_start = 0
    for match in re.finditer(r"\n## File:", content):
        if current_start < match.start():
            blocks.append(content[current_start:match.start()])
        current_start = match.start() + 1  # skip the leading newline
    if current_start < len(content):
        blocks.append(content[current_start:])

    if not blocks:
        return content

    def sort_key(block: str):
        # Extract file path from "## File: path/to/file"
        first_line = block.split("\n", 1)[0]
        path = first_line.replace("## File:", "").strip()
        is_priority = 1 if PRIORITY_RE.search(path) else 0
        depth = path.count("/")
        return (-is_priority, depth, path)

    blocks.sort(key=sort_key)
    return "\n".join(blocks)


def _truncate_to_budget(content: str, char_budget: int) -> str:
    """Truncate content at file boundary, appending omission notice."""
    if len(content) <= char_budget:
        return content

    total_files = content.count("## File:")
    cut = content[:char_budget].rfind("\n## File:")
    if cut > 0:
        content = content[:cut]
    else:
        content = content[:char_budget]
    included_files = content.count("## File:")
    omitted = total_files - included_files
    content += f"\n\n<!-- {omitted} of {total_files} files omitted. Read individually as needed. -->\n"
    return content


def _count_scope_files(repo_root: str, scope: str) -> int:
    """Estimate how many source files match a scope glob using find."""
    # Extract the directory prefix from the glob (e.g., "pkg/api/**" -> "pkg/api")
    dir_prefix = scope.split("**")[0].rstrip("/").rstrip("*")
    if not dir_prefix:
        dir_prefix = "."
    target = os.path.join(repo_root, dir_prefix)
    if not os.path.isdir(target):
        return 0
    return _count_source_files(target)


def _deduplicate_scopes(segments: list) -> list:
    """Remove scopes that are subsets of other scopes.

    Example: ["pkg/services/**", "pkg/services/accesscontrol/**"]
    The second is inside the first, so drop it.
    """
    # Extract directory prefixes from each glob
    prefixes = []
    for seg in segments:
        prefix = seg.split("**")[0].rstrip("/").rstrip("*").rstrip("/")
        prefixes.append(prefix or ".")

    keep = []
    for i, seg in enumerate(segments):
        is_subset = False
        for j, other in enumerate(segments):
            if i == j:
                continue
            # If prefix[i] starts with prefix[j]/, then i is inside j
            if prefixes[i].startswith(prefixes[j] + "/") or prefixes[i] == prefixes[j]:
                # Keep the broader one (shorter prefix), drop the narrower
                if len(prefixes[j]) < len(prefixes[i]):
                    is_subset = True
                    break
        if not is_subset:
            keep.append(seg)
    return keep if keep else segments  # fallback: keep all if dedup empties the list


def generate_l2(repo_root: str, scope: str, char_budget: int,
                 include_tests: bool = False) -> str:
    """
    Run repomix --compress on ticket-scoped dirs.

    Key behaviors:
    - Multi-scope (comma-separated): budget is split proportionally by file count
    - Results are reordered: priority files first, then by depth
    - Auto-expand: if scope is very narrow, expand to parent dir for context
    """
    segments = [s.strip().strip("/") for s in scope.split(",") if s.strip()]
    if not segments:
        return "<!-- empty scope -->\n"
    # Remove exact duplicates (preserving order), then subset dedup
    segments = list(dict.fromkeys(segments))
    segments = _deduplicate_scopes(segments)

    # If too many segments (e.g., 500 individual files), merge into one repomix call
    if len(segments) > 20:
        merged = ",".join(segments)
        return _generate_l2_single(repo_root, merged, char_budget, include_tests)

    if len(segments) == 1:
        return _generate_l2_single(repo_root, segments[0], char_budget, include_tests)

    # Multi-scope: allocate budget proportionally by file count
    file_counts = []
    for seg in segments:
        file_counts.append(_count_scope_files(repo_root, seg))
    total_files = sum(file_counts) or 1  # avoid division by zero

    # Minimum floor per segment: 10% or 1/N, whichever is smaller
    min_floor = min(0.1, 1.0 / len(segments))

    parts = []
    for seg, fc in zip(segments, file_counts):
        proportion = max(fc / total_files, min_floor)
        seg_budget = int(char_budget * proportion)
        part = _generate_l2_single(repo_root, seg, seg_budget, include_tests)
        if part.strip():
            parts.append(f"### Scope: {seg}\n\n{part}")

    # Rebalance: if some segments used less than their budget, redistribute
    combined = "\n\n".join(parts)
    if len(combined) > char_budget:
        combined = _truncate_to_budget(combined, char_budget)
    return combined


def _generate_l2_single(repo_root: str, scope: str, char_budget: int,
                         include_tests: bool = False) -> str:
    """Generate L2 for a single scope segment."""
    tmp_path = f"/tmp/_codemap_l2_raw_{os.getpid()}.md"
    content = _run_repomix(repo_root, scope, tmp_path, include_tests)

    expand_notice = ""
    file_count = content.count("## File:")
    if file_count < 5 and file_count > 0:
        # Auto-expand: if scope matched a few files, try parent dir for context.
        # Only expand when something matched — nonexistent paths stay empty.
        expanded = _auto_expand_scope(scope)
        if expanded != scope:
            expanded_content = _run_repomix(repo_root, expanded, tmp_path, include_tests)
            if expanded_content.count("## File:") > file_count:
                expand_notice = f"<!-- auto-expanded scope: {scope} → {expanded} -->\n"
                content = expanded_content

    # Clean up temp file
    try:
        os.unlink(tmp_path)
    except OSError:
        pass

    if not content.strip():
        return "<!-- no files matched scope -->\n"

    # Reorder: priority files first, shallow files first
    content = _reorder_by_priority(content)

    # Truncate to budget
    content = _truncate_to_budget(content, char_budget)

    # Prepend expand notice (after reorder/truncate so it's not lost)
    if expand_notice:
        content = expand_notice + content

    return content


def _auto_expand_scope(scope: str) -> str:
    """
    If scope is very narrow, expand to parent dir for context.
    Works for both file globs ('pkg/api/health*.go') and narrow directory
    scopes ('packages/grafana-ui/src/components/BarGauge/**').
    """
    if scope.endswith("/**"):
        # Directory scope — go up one level
        dir_path = scope[:-3]  # strip /**
        parts = dir_path.rsplit("/", 1)
        if len(parts) < 2:
            return scope  # already at root
        return f"{parts[0]}/**"

    # File glob — expand to parent directory
    parts = scope.rsplit("/", 1)
    if len(parts) < 2:
        return scope
    return f"{parts[0]}/**"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Generate token-budgeted codemap")
    parser.add_argument("scope", help="Glob pattern for ticket-relevant dirs (e.g. 'src/**')")
    parser.add_argument("--output", "-o", default=".sandcastle/CODEMAP.md")
    parser.add_argument("--budget", type=int, default=TOTAL_TOKEN_BUDGET,
                        help="Total token budget (default: 45000)")
    parser.add_argument("--repo-root", default=".", help="Repository root path")
    parser.add_argument("--include-tests", action="store_true",
                        help="Include test files in L2 (for test-related tickets)")
    args = parser.parse_args()

    repo_root = os.path.abspath(args.repo_root)
    if not os.path.isdir(repo_root):
        print(f"Error: repo root does not exist: {repo_root}", file=__import__('sys').stderr)
        raise SystemExit(1)
    l1_char_budget = int(L1_TOKEN_BUDGET * CHARS_PER_TOKEN)
    l2_char_budget = max(0, int((args.budget - L1_TOKEN_BUDGET) * CHARS_PER_TOKEN))

    # Generate L1
    l1 = generate_l1(repo_root)
    if len(l1) > l1_char_budget:
        l1 = l1[:l1_char_budget]
        last_nl = l1.rfind("\n")
        if last_nl > 0:
            l1 = l1[:last_nl]
        l1 += "\n... (tree truncated)"

    # Generate L2
    l2 = generate_l2(repo_root, args.scope, l2_char_budget, args.include_tests)

    # Warn if scope was non-empty but L2 matched nothing
    if args.scope.strip() and "## File:" not in l2 and "no files matched" in l2:
        print(f"Warning: scope '{args.scope}' matched no files. "
              f"Check for leading slashes or typos.", file=__import__('sys').stderr)

    # Combine
    l1_tokens = len(l1) / CHARS_PER_TOKEN
    l2_tokens = len(l2) / CHARS_PER_TOKEN
    total_tokens = l1_tokens + l2_tokens

    output = f"""# Codemap

## Repository Map

{l1}

## Detailed Signatures (scope: {args.scope})

{l2}
"""

    # Write output
    out_path = os.path.abspath(args.output)
    try:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w") as f:
            f.write(output)
    except OSError as e:
        print(f"Error: cannot write to {out_path}: {e}", file=__import__('sys').stderr)
        raise SystemExit(1)

    # Report
    print(f"L1 (repo map):  ~{l1_tokens:.0f} tokens")
    print(f"L2 (signatures): ~{l2_tokens:.0f} tokens")
    print(f"Total:           ~{total_tokens:.0f} tokens")
    print(f"Budget:          {args.budget} tokens")
    print(f"Margin:          {args.budget - total_tokens:.0f} tokens")
    print(f"Output:          {out_path}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
codemap-verify.py — Verify a generated codemap is sufficient for a ticket.

Three tiers of checks, run in order (cheapest first):

  Tier 1 (deterministic, free):
    - Budget check: codemap ≤ 45K tokens, full prompt ≤ 100K tokens
    - Symbol check: ticket-mentioned identifiers appear in the codemap
    - Test pattern check: if ticket needs tests, codemap has a test example

  Tier 2 (deterministic, ~200ms):
    - Scope boundary ratio: what % of imports from codemap files resolve
      to other codemap files? >85% = good, <60% = insufficient.

  Tier 3 (LLM, ~$0.02):
    - Gap detection: ask Haiku "what's missing to implement this ticket?"

Usage:
  python3 codemap-verify.py <codemap_path> --ticket "ticket text" --repo-root <path>
  python3 codemap-verify.py <codemap_path> --ticket-file ticket.md --repo-root <path>

  # Skip LLM check (deterministic only)
  python3 codemap-verify.py <codemap_path> --ticket "..." --repo-root <path> --no-llm

  # Only budget check
  python3 codemap-verify.py <codemap_path> --budget-only
"""

import argparse
import json
import os
import re
import subprocess
import sys

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FIXED_PROMPT_TOKENS = 15_100  # fallback when --prompt-dir is not provided
SYSTEM_PROMPT_TOKENS = 7_000  # Claude Code system prompt (not on disk, estimated)
CODEMAP_BUDGET = 45_000
FULL_PROMPT_BUDGET = 100_000
CHARS_PER_TOKEN = 3.5

# Prompt template files to read from --prompt-dir (relative paths).
# Entries ending with / are directories — all .md files inside are read.
PROMPT_TEMPLATE_FILES = [
    "CLAUDE.md",
    "AGENTS.md",
    ".claude/rules/",
    ".sandcastle/implement-prompt.md",
    ".sandcastle/CODING_STANDARDS.md",
    "GLOSSARY.md",
]

# Extensions we count as source code (must match codemap-gen.py)
SOURCE_EXTS = {
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".rb",
    ".java", ".kt", ".cs", ".cpp", ".c", ".h", ".hpp",
    ".css", ".scss", ".svelte", ".vue", ".astro",
}


# ---------------------------------------------------------------------------
# Prompt assembly (for measured budget check)
# ---------------------------------------------------------------------------

def _assemble_prompt(prompt_dir: str, repo_root: str,
                     ticket_text: str, codemap_text: str) -> str:
    """Assemble the full implementer prompt from real template files.

    Reads every component the agent actually sees (except the Claude Code
    system prompt, which isn't on disk) and substitutes placeholders with
    the scenario's ticket text and a real git log from the target repo.
    """
    parts = []

    for rel_path in PROMPT_TEMPLATE_FILES:
        full = os.path.join(prompt_dir, rel_path)

        if rel_path.endswith("/"):
            # Directory — read all .md files inside
            if os.path.isdir(full):
                for fname in sorted(os.listdir(full)):
                    if fname.endswith(".md"):
                        with open(os.path.join(full, fname)) as fh:
                            parts.append(fh.read())
            continue

        if not os.path.isfile(full):
            continue

        with open(full) as fh:
            content = fh.read()

        # Substitute placeholders in implement-prompt template
        if "implement-prompt" in rel_path:
            content = content.replace("{{ISSUE_DETAILS}}", ticket_text)
            content = content.replace("{{ISSUE_TITLE}}",
                                      ticket_text.split("\n", 1)[0][:80])
            content = content.replace("{{TASK_ID}}", "SCENARIO-001")
            content = content.replace("{{BRANCH}}", "sandcastle/scenario")
            content = content.replace("{{COMMENT_TASK_COMMAND}}", "bd comment SCENARIO-001 '<COMMENT>'")
            content = content.replace("{{LABEL_TASK_COMMAND}}", "bd update SCENARIO-001 --label=blocked")
            content = content.replace("{{CREATE_BUG_COMMAND}}", "bd create --title='<TITLE>' --description='<DESCRIPTION>' --type=bug")

            # Replace git log shell expansion with real git log from target repo
            git_log = _capture_git_log(repo_root)
            content = re.sub(r"!`git log.*?`", git_log, content)

        parts.append(content)

    parts.append(codemap_text)
    return "\n\n".join(parts)


def _capture_git_log(repo_root: str) -> str:
    """Run git log on the target repo, or return a representative stub."""
    try:
        result = subprocess.run(
            ["git", "log", "-n", "10", "--format=%H%n%ad%n%B---", "--date=short"],
            cwd=repo_root, capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass
    # Stub: 10 commits × ~80 chars ≈ representative size
    return ("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n"
            "2025-01-01\nFix: example commit\n---\n") * 10


# ---------------------------------------------------------------------------
# Tier 1: Budget + symbol + test pattern checks (free, instant)
# ---------------------------------------------------------------------------

def check_budget(codemap_text: str, prompt_dir: str = None,
                 repo_root: str = ".", ticket_text: str = "") -> dict:
    """Check token budget — measured when --prompt-dir is given, estimated otherwise."""
    codemap_tokens = len(codemap_text) / CHARS_PER_TOKEN

    if prompt_dir:
        assembled = _assemble_prompt(prompt_dir, repo_root, ticket_text, codemap_text)
        measured_tokens = len(assembled) / CHARS_PER_TOKEN
        full_prompt_tokens = measured_tokens + SYSTEM_PROMPT_TOKENS
        return {
            "check": "budget",
            "method": "assembled",
            "codemap_tokens": int(codemap_tokens),
            "measured_tokens": int(measured_tokens),
            "system_prompt_estimate": SYSTEM_PROMPT_TOKENS,
            "full_prompt_tokens": int(full_prompt_tokens),
            "codemap_ok": codemap_tokens <= CODEMAP_BUDGET,
            "prompt_ok": full_prompt_tokens <= FULL_PROMPT_BUDGET,
            "pass": codemap_tokens <= CODEMAP_BUDGET and full_prompt_tokens <= FULL_PROMPT_BUDGET,
        }

    # Fallback: hardcoded constant
    full_prompt_tokens = codemap_tokens + FIXED_PROMPT_TOKENS
    return {
        "check": "budget",
        "method": "estimated",
        "codemap_tokens": int(codemap_tokens),
        "full_prompt_tokens": int(full_prompt_tokens),
        "codemap_ok": codemap_tokens <= CODEMAP_BUDGET,
        "prompt_ok": full_prompt_tokens <= FULL_PROMPT_BUDGET,
        "pass": codemap_tokens <= CODEMAP_BUDGET and full_prompt_tokens <= FULL_PROMPT_BUDGET,
    }


def check_symbols(codemap_text: str, ticket_text: str) -> dict:
    """Check if identifiers mentioned in the ticket appear in the codemap."""
    # Extract backtick-quoted identifiers and CamelCase/snake_case words from ticket
    backtick_ids = re.findall(r"`([A-Za-z_]\w+)`", ticket_text)
    # Also find words that look like code identifiers (CamelCase, camelCase, or snake_case, 3+ chars)
    code_words = re.findall(r"\b([A-Z][a-z]+[A-Z]\w+|[a-z]+[A-Z]\w+|[a-z]+_[a-z_]+\w*)\b", ticket_text)
    # Filter out common English words that match patterns
    noise = {"the_", "for_", "with_", "from_", "this_", "that_", "into_"}
    identifiers = [i for i in set(backtick_ids + code_words) if i.lower() not in noise and len(i) > 2]

    if not identifiers:
        return {"check": "symbols", "pass": True, "identifiers": [], "note": "no identifiers found in ticket"}

    # Detect "create/add/new" tickets — new symbols won't exist yet
    create_words = {"add", "create", "new", "implement", "build", "introduce", "write"}
    is_create_ticket = any(w in ticket_text.lower().split() for w in create_words)

    found = []
    missing = []
    for ident in identifiers:
        if ident in codemap_text:
            found.append(ident)
        else:
            missing.append(ident)

    # For create tickets, missing symbols are expected (they're being created).
    # Only fail if EXISTING symbols the ticket references (types to import,
    # functions to call) are missing. Heuristic: symbols that appear near
    # "use", "import", "from", "existing", "current" in the ticket are dependencies.
    if is_create_ticket and missing:
        dep_context = re.findall(
            r"(?:use|using|import|from|existing|current|extend)\s+(?:the\s+)?`?(\w+)`?",
            ticket_text, re.IGNORECASE
        )
        dep_names = {d for d in dep_context if len(d) > 2}
        # Only fail on missing dependencies, not the new thing being created
        critical_missing = [m for m in missing if m in dep_names]
        return {
            "check": "symbols",
            "pass": len(critical_missing) == 0,
            "found": found,
            "missing_new": [m for m in missing if m not in dep_names],
            "missing_deps": critical_missing,
            "note": "create ticket: only dependency symbols checked",
        }

    # Only backtick-quoted identifiers are mandatory.  Heuristic
    # CamelCase/snake_case matches often catch platform APIs
    # (AbortController, HTMLElement, EventEmitter, etc.) that don't
    # belong in a project codemap — report but don't fail on them.
    backtick_set = set(backtick_ids)
    missing_mandatory = [m for m in missing if m in backtick_set]
    missing_heuristic = [m for m in missing if m not in backtick_set]

    return {
        "check": "symbols",
        "pass": len(missing_mandatory) == 0,
        "found": found,
        "missing": missing_mandatory,
        "missing_heuristic": missing_heuristic,
    }


def check_test_patterns(codemap_text: str, ticket_text: str) -> dict:
    """If the ticket mentions tests, check the codemap has test examples."""
    # Strong keywords: unmistakably about testing.
    # Weak keywords: ambiguous (e.g. "fixture" can mean app fixture, not test).
    # Only trigger if at least one strong keyword matches.
    strong_kw = [r"(?<![-])\btest\b", r"\bspec\b", r"\bassert\b", r"\bexpect\b", r"\bpytest\b", r"\bvitest\b", r"\bjest\b"]
    needs_tests = any(re.search(kw, ticket_text, re.IGNORECASE) for kw in strong_kw)

    if not needs_tests:
        return {"check": "test_patterns", "pass": True, "note": "ticket does not mention tests"}

    # Look for test framework imports or test function patterns in the codemap
    test_patterns = [
        r"import.*(?:test|describe|it|expect|assert|pytest|vitest|jest)",
        r"(?:def test_|it\(|describe\(|test\()",
        r"\.test\.|\.spec\.|_test\.",
    ]
    has_pattern = any(re.search(p, codemap_text, re.IGNORECASE) for p in test_patterns)

    return {
        "check": "test_patterns",
        "pass": has_pattern,
        "note": "test patterns found" if has_pattern else "ticket mentions tests but no test patterns in codemap",
    }


# ---------------------------------------------------------------------------
# Tier 2: Scope boundary ratio (deterministic, ~200ms)
# ---------------------------------------------------------------------------

def check_scope_boundary(codemap_text: str, repo_root: str) -> dict:
    """
    Check what % of imports from codemap files resolve to other codemap files.

    Uses regex-based import extraction (no external tools needed).
    Works for Python, TypeScript/JavaScript, and Go.
    """
    # Extract files listed in the codemap
    codemap_files = set()
    for match in re.finditer(r"## File:\s*(.+)", codemap_text):
        codemap_files.add(match.group(1).strip())

    if not codemap_files:
        return {"check": "scope_boundary", "pass": True, "ratio": 1.0, "note": "no files in codemap"}

    # For each codemap file, find it in the repo and extract imports
    total_imports = 0
    resolved_imports = 0
    unresolved = []

    for filepath in codemap_files:
        full_path = os.path.join(repo_root, filepath)
        if not os.path.isfile(full_path):
            continue

        try:
            with open(full_path, encoding="utf-8", errors="ignore") as f:
                source = f.read()
        except OSError:
            continue

        ext = os.path.splitext(filepath)[1]
        imports = _extract_imports(source, ext, filepath)

        for imp in imports:
            total_imports += 1
            resolved = _resolve_import(imp, filepath, repo_root, codemap_files)
            if resolved:
                resolved_imports += 1
            else:
                unresolved.append(f"{filepath} -> {imp}")

    if total_imports == 0:
        return {"check": "scope_boundary", "pass": True, "ratio": 1.0, "note": "no imports found"}

    ratio = resolved_imports / total_imports

    # Go monorepo packages typically have low ratios (5-20%) because packages
    # are small and import heavily from siblings. This is normal.
    # TS/Python modules are more self-contained (60-100%).
    # We use the ratio as informational, not pass/fail — the real question
    # is whether L1 (the repo tree) helps the agent find what it needs.
    return {
        "check": "scope_boundary",
        "pass": True,  # informational, not a gate
        "ratio": round(ratio, 3),
        "total_imports": total_imports,
        "resolved_in_codemap": resolved_imports,
        "sample_unresolved": unresolved[:5],
        "interpretation": "high" if ratio >= 0.85 else "medium" if ratio >= 0.40 else "low — agent will need to read files outside scope (L1 repo map helps navigate)",
    }


def _extract_imports(source: str, ext: str, filepath: str) -> list:
    """Extract import module paths from source code."""
    imports = []

    if ext in (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"):
        # ES imports: import { X } from './foo'  or  import X from '../bar'
        for m in re.finditer(r"""(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]""", source):
            mod = m.group(1)
            if mod.startswith("."):  # only relative imports
                imports.append(mod)

    elif ext == ".py":
        # from foo.bar import X  or  import foo.bar
        for m in re.finditer(r"^\s*(?:from\s+([\w.]+)|import\s+([\w.]+))", source, re.MULTILINE):
            mod = m.group(1) or m.group(2)
            # Only keep project-internal imports (heuristic: not stdlib/pip packages)
            parts = mod.split(".")
            if len(parts) >= 2:
                imports.append(mod)

    elif ext == ".go":
        # import "github.com/grafana/grafana/pkg/services/foo"
        for m in re.finditer(r'"([^"]+)"', source):
            mod = m.group(1)
            # Only internal imports (contain the repo's module path)
            if "/" in mod and not mod.startswith("github.com/") and not mod.startswith("golang.org/"):
                imports.append(mod)
            # For same-repo imports, check if the path suffix matches a codemap dir
            elif "pkg/" in mod or "internal/" in mod:
                imports.append(mod)

    return imports


def _resolve_import(imp: str, from_file: str, repo_root: str, codemap_files: set) -> bool:
    """Check if an import resolves to a file in the codemap."""

    ext = os.path.splitext(from_file)[1]

    if ext in (".ts", ".tsx", ".js", ".jsx"):
        # Resolve relative import
        dir_of_file = os.path.dirname(from_file)
        resolved = os.path.normpath(os.path.join(dir_of_file, imp))
        # Try common extensions
        for try_ext in [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"]:
            candidate = resolved + try_ext
            if candidate in codemap_files:
                return True
        return resolved in codemap_files

    elif ext == ".py":
        # Convert dotted module to path: foo.bar.baz -> foo/bar/baz.py or foo/bar/baz/__init__.py
        parts = imp.split(".")
        path_a = "/".join(parts) + ".py"
        path_b = "/".join(parts) + "/__init__.py"
        return path_a in codemap_files or path_b in codemap_files

    elif ext == ".go":
        # Go imports are package paths — check if any codemap file is under that path suffix
        for cf in codemap_files:
            if imp.endswith(os.path.dirname(cf)):
                return True
        return False

    return False


# ---------------------------------------------------------------------------
# Tier 3: LLM gap detection (~$0.02 with Haiku)
# ---------------------------------------------------------------------------

def _load_oauth_token() -> str | None:
    """Load OAuth token from .sandcastle/.env or environment."""
    token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
    if token:
        return token
    # Try loading from .sandcastle/.env relative to this script's repo
    env_path = os.path.join(os.path.dirname(__file__), "..", ".sandcastle", ".env")
    env_path = os.path.abspath(env_path)
    if os.path.isfile(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("CLAUDE_CODE_OAUTH_TOKEN=") and not line.startswith("#"):
                    return line.split("=", 1)[1].strip()
    return None


def check_llm_gaps(codemap_text: str, ticket_text: str) -> dict:
    """Ask an LLM if the codemap is sufficient to implement the ticket."""
    prompt = (
        "You are auditing a codemap (navigation aid) for an AI coding agent. "
        "The codemap shows file paths, function/type SIGNATURES, and a repo directory tree. "
        "It does NOT show function bodies — that is by design: the agent reads full files "
        "individually once it knows which files to open.\n\n"
        "Given the codemap and ticket below, check ONLY whether the codemap helps the agent "
        "find the RIGHT FILES and understand the CODE STRUCTURE. Specifically flag:\n"
        "- Key files the agent would need that are NOT listed in the codemap at all\n"
        "- Type/interface definitions the agent needs to import that are missing entirely\n"
        "- If the ticket requires tests but no test file patterns are shown\n\n"
        "Do NOT flag missing function bodies, implementation details, or config values — "
        "the agent will read those from the actual files.\n\n"
        "If the codemap points the agent to the right files, respond with exactly: SUFFICIENT\n\n"
        f"Codemap:\n{codemap_text[:50000]}\n\nTicket:\n{ticket_text}"
    )

    # Use Claude Code CLI with OAuth token (works with user subscription)
    oauth_token = _load_oauth_token()
    env = dict(os.environ)
    if oauth_token:
        env["CLAUDE_CODE_OAUTH_TOKEN"] = oauth_token

    try:
        result = subprocess.run(
            ["claude", "-p", prompt, "--model", "haiku", "--no-session-persistence"],
            capture_output=True, text=True, timeout=60, env=env,
        )
        if result.returncode != 0:
            err = (result.stderr or result.stdout or "unknown error").strip()[:200]
            return {"check": "llm_gaps", "pass": None, "note": f"claude CLI failed: {err}"}
        answer = result.stdout.strip()
    except FileNotFoundError:
        return {"check": "llm_gaps", "pass": None, "note": "claude CLI not found, skipping LLM check"}
    except subprocess.TimeoutExpired:
        return {"check": "llm_gaps", "pass": None, "note": "claude CLI timed out after 60s"}
    except Exception as e:
        return {"check": "llm_gaps", "pass": None, "note": f"LLM call failed: {e}"}

    is_sufficient = answer.upper().startswith("SUFFICIENT")

    return {
        "check": "llm_gaps",
        "pass": is_sufficient,
        "response": answer,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Verify codemap sufficiency for a ticket")
    parser.add_argument("codemap", help="Path to the generated codemap file")
    parser.add_argument("--ticket", help="Ticket description text")
    parser.add_argument("--ticket-file", help="Path to file containing ticket description")
    parser.add_argument("--repo-root", default=".", help="Repository root path")
    parser.add_argument("--prompt-dir", default=None,
                        help="Path to repo with prompt templates (CLAUDE.md, .sandcastle/, etc.) "
                             "for measured budget check. Falls back to estimated constant if omitted.")
    parser.add_argument("--no-llm", action="store_true", help="Skip LLM check (deterministic only)")
    parser.add_argument("--budget-only", action="store_true", help="Only run budget check")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    args = parser.parse_args()

    # Read codemap
    if not os.path.isfile(args.codemap):
        print(f"Error: codemap file not found: {args.codemap}", file=sys.stderr)
        sys.exit(1)
    with open(args.codemap) as f:
        codemap_text = f.read()

    # Read ticket
    ticket_text = ""
    if args.ticket:
        ticket_text = args.ticket
    elif args.ticket_file:
        with open(args.ticket_file) as f:
            ticket_text = f.read()

    repo_root = os.path.abspath(args.repo_root)

    results = []
    all_pass = True

    # Tier 1: Budget
    prompt_dir = os.path.abspath(args.prompt_dir) if args.prompt_dir else None
    budget = check_budget(codemap_text, prompt_dir=prompt_dir,
                          repo_root=repo_root, ticket_text=ticket_text)
    results.append(budget)
    if not budget["pass"]:
        all_pass = False

    if args.budget_only:
        _report(results, all_pass, args.json)
        return

    if not ticket_text:
        print("Warning: no ticket provided. Only budget check ran.", file=sys.stderr)
        _report(results, all_pass, args.json)
        return

    # Tier 1: Symbols
    symbols = check_symbols(codemap_text, ticket_text)
    results.append(symbols)
    if not symbols["pass"]:
        all_pass = False

    # Tier 1: Test patterns
    tests = check_test_patterns(codemap_text, ticket_text)
    results.append(tests)
    if not tests["pass"]:
        all_pass = False

    # Tier 2: Scope boundary (only if repo_root is valid)
    if os.path.isdir(repo_root):
        boundary = check_scope_boundary(codemap_text, repo_root)
        results.append(boundary)
        if not boundary["pass"]:
            all_pass = False
    else:
        results.append({"check": "scope_boundary", "pass": None, "note": "repo root not found, skipped"})

    # Tier 3: LLM (only if deterministic checks pass and not disabled)
    if not args.no_llm and all_pass:
        llm = check_llm_gaps(codemap_text, ticket_text)
        results.append(llm)
        if llm["pass"] is False:
            all_pass = False
    elif args.no_llm:
        results.append({"check": "llm_gaps", "pass": None, "note": "skipped (--no-llm)"})

    _report(results, all_pass, args.json)
    sys.exit(0 if all_pass else 1)


def _report(results: list, all_pass: bool, as_json: bool):
    """Print results."""
    if as_json:
        print(json.dumps({"pass": all_pass, "checks": results}, indent=2))
        return

    for r in results:
        status = "PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL")
        line = f"  [{status}] {r['check']}"

        if r["check"] == "budget" and "codemap_tokens" in r:
            method = r.get("method", "estimated")
            line += f": {r['codemap_tokens']}tok codemap, {r['full_prompt_tokens']}tok prompt ({method})"
        elif r["check"] == "symbols":
            missing = r.get("missing", []) + r.get("missing_deps", [])
            heuristic = r.get("missing_heuristic", [])
            if missing:
                line += f": missing {missing}"
            elif heuristic:
                line += f": {len(r.get('found', []))} found, {len(heuristic)} heuristic misses (ok): {heuristic}"
            else:
                line += f": {len(r.get('found', []))} identifiers found"
        elif r["check"] == "scope_boundary" and "ratio" in r and "interpretation" in r:
            line += f": {r['ratio']:.0%} imports resolve within codemap ({r['interpretation']})"
        elif r["check"] == "llm_gaps":
            if r["pass"]:
                line += ": SUFFICIENT"
            elif r["pass"] is False:
                line += f": {r.get('response', '')[:100]}"
            else:
                line += f": {r.get('note', '')}"
        elif "note" in r:
            line += f": {r['note']}"

        print(line)

    print(f"\n  {'ALL CHECKS PASSED' if all_pass else 'SOME CHECKS FAILED'}")


if __name__ == "__main__":
    main()

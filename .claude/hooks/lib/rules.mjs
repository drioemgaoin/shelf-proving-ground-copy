/**
 * Shared utilities for rule discovery and enforcement-block parsing.
 * Used by apply-t1.mjs and future enforcement hooks.
 */
import { readFileSync, statSync, realpathSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

// ─── discoverRulesFiles() ──────────────────────────────────────────

/**
 * Scan known rule locations and return deduplicated list of rule file paths.
 * Logs skipped paths to stderr.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {string[]} Deduplicated absolute paths to rule files.
 */
export function discoverRulesFiles(projectRoot) {
  const candidates = [];

  // 1. .claude/rules/
  collectDir(join(projectRoot, '.claude', 'rules'), candidates);

  // 2. .cursor/rules/
  collectDir(join(projectRoot, '.cursor', 'rules'), candidates);

  // 3. Project root CODING_STANDARDS.md
  candidates.push(join(projectRoot, 'CODING_STANDARDS.md'));

  // 4. rules.extraPaths from .sandcastle/config.json
  try {
    const configPath = join(projectRoot, '.sandcastle', 'config.json');
    const raw = readFileSync(configPath, 'utf8');
    let config;
    try {
      config = JSON.parse(raw);
    } catch {
      console.error(`Invalid JSON in ${configPath}`);
      process.exit(2);
    }
    const extra = config?.rules?.extraPaths;
    if (Array.isArray(extra)) {
      for (const p of extra) {
        candidates.push(resolve(projectRoot, p));
      }
    }
  } catch (err) {
    // Missing config file — skip silently (config is optional).
    if (err?.code !== 'ENOENT') throw err;
  }

  // Deduplicate by resolved absolute path, validate each.
  const seen = new Set();
  const result = [];
  let realRoot;
  try {
    realRoot = realpathSync(projectRoot);
  } catch {
    realRoot = resolve(projectRoot);
  }

  for (const candidate of candidates) {
    let abs;
    try {
      abs = realpathSync(candidate);
    } catch {
      process.stderr.write(`rules: skipped (not found): ${candidate}\n`);
      continue;
    }

    // Must be within project root.
    const rel = relative(realRoot, abs);
    if (rel.startsWith('..') || resolve(realRoot, rel) !== abs) {
      process.stderr.write(`rules: skipped (outside project): ${candidate}\n`);
      continue;
    }

    // Must be a regular file.
    try {
      const st = statSync(abs);
      if (!st.isFile()) {
        process.stderr.write(`rules: skipped (not a file): ${candidate}\n`);
        continue;
      }
    } catch {
      process.stderr.write(`rules: skipped (stat failed): ${candidate}\n`);
      continue;
    }

    if (seen.has(abs)) continue;
    seen.add(abs);
    result.push(abs);
  }

  return result;
}

function collectDir(dir, out) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.markdown'))) {
        out.push(join(dir, e.name));
      }
    }
  } catch {
    // Directory doesn't exist — skip.
  }
}

// ─── parseEnforcementBlocks() ──────────────────────────────────────

/**
 * @typedef {Object} EnforcementBlock
 * @property {string} id
 * @property {string} tier
 * @property {string} scope
 * @property {string} [exclude]
 * @property {string} [strip]
 * @property {string} pattern
 * @property {string} rule
 * @property {string} fix
 * @property {string} sourceFile - File this block was parsed from.
 */

/**
 * @typedef {Object} ParseError
 * @property {string} file
 * @property {string} message
 */

/**
 * Extract ```enforcement fences from markdown content.
 * Splits by `---` at column 0 (indented `---` treated as literal).
 * Parses each section as YAML key-value pairs.
 *
 * @param {string} content - Markdown file content.
 * @param {string} filePath - Source file path (for error reporting).
 * @returns {{ blocks: EnforcementBlock[], errors: ParseError[] }}
 */
export function parseEnforcementBlocks(content, filePath) {
  const blocks = [];
  const errors = [];

  // Extract ```enforcement ... ``` fences (indented or not).
  const fenceRe = /^[ \t]*```enforcement\s*\n([\s\S]*?)^[ \t]*```\s*$/gm;
  let fenceMatch;

  // Pre-split content lines for rule text lookback.
  const contentLines = content.split('\n');

  while ((fenceMatch = fenceRe.exec(content)) !== null) {
    // Gap 13: Associate rule text immediately above the fence.
    const fenceStartOffset = fenceMatch.index;
    const textBeforeFence = content.slice(0, fenceStartOffset);
    const linesBefore = textBeforeFence.split('\n');
    let ruleText = '';
    // Walk backwards from the line before the fence to find the nearest bullet.
    for (let li = linesBefore.length - 1; li >= 0; li--) {
      const l = linesBefore[li].trim();
      if (!l) continue; // skip blank lines
      if (l.startsWith('- ')) {
        ruleText = l.slice(2).trim();
        break;
      }
      // Skip indented continuation lines (part of the parent bullet body)
      if (/^\s/.test(linesBefore[li])) continue;
      break;
    }
    // Walk backwards to find the nearest ## heading above the fence.
    let sectionHeading = '';
    for (let li = linesBefore.length - 1; li >= 0; li--) {
      const l = linesBefore[li].trim();
      if (l.startsWith('## ')) {
        sectionHeading = l.slice(3).trim();
        break;
      }
    }
    // Strip common leading whitespace from indented fences.
    const rawBody = fenceMatch[1];
    const bodyLines = rawBody.split('\n');
    const nonEmpty = bodyLines.filter((l) => l.trim().length > 0);
    const minIndent = nonEmpty.reduce((min, l) => {
      const match = l.match(/^([ \t]*)/);
      return match ? Math.min(min, match[1].length) : min;
    }, Infinity);
    const body = minIndent > 0 && minIndent < Infinity
      ? bodyLines.map((l) => l.slice(minIndent)).join('\n')
      : rawBody;

    // Split by --- at column 0 (not indented).
    const sections = body.split(/^---\s*$/m);

    // Track shared id across sections in same fence.
    let sharedId = null;

    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;

      try {
        const parsed = parseSimpleYaml(trimmed);

        // Multi-tier: first block's id is shared.
        if (parsed.id) {
          sharedId = parsed.id;
        } else if (sharedId) {
          parsed.id = sharedId;
        }

        if (!parsed.tier) {
          errors.push({
            file: filePath,
            message: `Enforcement block missing required field (tier): ${trimmed.slice(0, 80)}`,
          });
          continue;
        }

        // Expand multi-entry blocks (e.g., T1 with multiple - pattern: entries).
        // Each entry becomes its own block inheriting top-level fields.
        if (parsed._entries) {
          const { _entries, ...shared } = parsed;
          for (const entry of _entries) {
            blocks.push({ ...shared, ...entry, sourceFile: filePath, ruleText, sectionHeading, _multiEntry: true });
          }
        } else {
          parsed.sourceFile = filePath;
          parsed.ruleText = ruleText;
          parsed.sectionHeading = sectionHeading;
          blocks.push(parsed);
        }
      } catch (err) {
        errors.push({
          file: filePath,
          message: `YAML parse error: ${err.message}`,
        });
      }
    }
  }

  return { blocks, errors };
}

/**
 * YAML parser for enforcement blocks.
 * Handles:
 *  - Simple key: value pairs
 *  - Multi-entry lists: "- pattern: ..." with indented sub-fields
 *  - Array values: "coverage:\n  - "item""
 *
 * Multi-entry blocks store entries in result._entries (array of objects).
 * Array-valued keys store values as string[].
 *
 * @param {string} text
 * @returns {Record<string, string|string[]> & { _entries?: Record<string, string>[] }}
 */
function unescapeYamlDoubleQuoted(s) {
  return s.replace(/\\(["\\\/bfnrt])/g, (_, c) => {
    switch (c) {
      case '"': return '"';
      case '\\': return '\\';
      case '/': return '/';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      default: return c;
    }
  });
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"'))) {
    return unescapeYamlDoubleQuoted(value.slice(1, -1));
  }
  if ((value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseSimpleYaml(text) {
  const result = {};
  const entries = [];
  const lines = text.split('\n');
  let currentEntry = null;
  let lastKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const hasIndent = /^\s/.test(line);

    // Indented list item: "  - "value"" — accumulate under lastKey as array.
    if (hasIndent && /^- /.test(trimmed) && lastKey && !currentEntry) {
      const itemValue = stripQuotes(trimmed.slice(2).trim());
      if (!Array.isArray(result[lastKey])) {
        result[lastKey] = result[lastKey] ? [result[lastKey]] : [];
      }
      result[lastKey].push(itemValue);
      continue;
    }

    // Top-level list entry: "- pattern: ..." (no leading whitespace).
    if (!hasIndent && /^- \w+/.test(trimmed)) {
      const withoutDash = trimmed.slice(2);
      const colonIdx = withoutDash.indexOf(':');
      if (colonIdx !== -1) {
        const key = withoutDash.slice(0, colonIdx).trim();
        const value = stripQuotes(withoutDash.slice(colonIdx + 1).trim());
        currentEntry = { [key]: value };
        entries.push(currentEntry);
        lastKey = null;
        continue;
      }
    }

    // Indented key-value under a list entry: "  assert: absent".
    if (hasIndent && currentEntry) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = stripQuotes(trimmed.slice(colonIdx + 1).trim());
        currentEntry[key] = value;
        continue;
      }
    }

    // Regular key: value.
    currentEntry = null;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      throw new Error(`Invalid YAML line (no colon): "${trimmed}"`);
    }

    const key = trimmed.slice(0, colonIdx).trim();
    const value = stripQuotes(trimmed.slice(colonIdx + 1).trim());

    result[key] = value;
    lastKey = key;
  }

  if (entries.length > 0) {
    result._entries = entries;
  }

  return result;
}

// ─── Glob matching ─────────────────────────────────────────────────

/**
 * Simple glob matcher supporting *, **, and ? patterns.
 * Paths should use forward slashes.
 *
 * @param {string} pattern - Glob pattern (e.g., "src/**\/*.css").
 * @param {string} path - Path to test.
 * @returns {boolean}
 */
export function globMatch(pattern, path) {
  try {
    const re = globToRegex(pattern);
    return re.test(path);
  } catch {
    // Gap 3: Invalid glob syntax → fail-open for that pattern, warn.
    process.stderr.write(`rules: invalid glob syntax "${pattern}", skipping\n`);
    return false;
  }
}

function globToRegex(pattern) {
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches any path segments.
        if (pattern[i + 2] === '/') {
          re += '(?:.+/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        // * matches anything except /.
        re += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      re += '[^/]';
      i++;
    } else if (c === '{') {
      // Brace expansion: {a,b,c} → (?:a|b|c)
      const close = pattern.indexOf('}', i);
      if (close !== -1) {
        const alts = pattern.slice(i + 1, close).split(',').map(escapeRegexLiteral).join('|');
        re += `(?:${alts})`;
        i = close + 1;
      } else {
        re += '\\{';
        i++;
      }
    } else if (c === '.') {
      re += '\\.';
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp(`^${re}$`);
}

function escapeRegexLiteral(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Content stripping ─────────────────────────────────────────────

/**
 * Strip comments and/or strings from content based on mode and file extension.
 *
 * @param {string} content
 * @param {string} strip - "comments", "strings", "comments+strings", or "comments+at-rule-params"
 * @param {string} filePath - For determining comment style by extension.
 * @returns {string}
 */
export function stripContent(content, strip, filePath) {
  if (!strip) return content;

  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  let result = content;

  if (strip === 'comments' || strip === 'comments+strings' || strip === 'comments+at-rule-params' || strip === 'comments+paren-contents') {
    if (ext === 'css') {
      // CSS block comments only.
      result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    } else if (['ts', 'tsx', 'js', 'jsx', 'mjs'].includes(ext)) {
      // JS-family: line comments and block comments.
      result = result.replace(/\/\/.*$/gm, '');
      result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    }
  }

  if (strip === 'strings' || strip === 'comments+strings') {
    // Remove string literals (single, double, template).
    result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''");
    result = result.replace(/`(?:[^`\\]|\\.)*`/g, '``');
  }

  // Strip at-rule parameters (@media, @supports preludes) so raw px values
  // in media queries are invisible to pattern matching.  CSS custom properties
  // cannot appear in media condition preludes, so these values are legitimate.
  if (strip && strip.includes('at-rule-params')) {
    // Blank out everything between @<word> and { on the same line.
    result = result.replace(/^(\s*@(?:media|supports|container|layer)\b)([^{]*)({?)$/gm,
      (_, prefix, _params, brace) => prefix + ' '.repeat(_params.length) + brace);
  }

  // Strip content inside balanced parentheses so words inside var(...), calc(...),
  // etc. are invisible to pattern matching.  Preserves newlines for line numbering.
  if (strip && strip.includes('paren-contents')) {
    let depth = 0;
    let out = '';
    for (const ch of result) {
      if (ch === '(') { depth++; out += ch; }
      else if (ch === ')') { depth--; out += ch; }
      else if (depth > 0) { out += ch === '\n' ? '\n' : ' '; }
      else { out += ch; }
    }
    result = out;
  }

  // Gap 4: Unrecognized strip value → warn (behavior is already strip: none).
  const knownStrips = ['comments', 'strings', 'comments+strings', 'comments+at-rule-params', 'at-rule-params', 'comments+paren-contents'];
  if (strip && !knownStrips.includes(strip)) {
    process.stderr.write(`rules: unrecognized strip value "${strip}", treating as strip: none\n`);
  }

  return result;
}

// ─── stripEnforcementFences() ─────────────────────────────────────

/**
 * Remove ```enforcement fences from markdown, leaving only the prose rules.
 * Uses the same fence regex as parseEnforcementBlocks for consistency.
 *
 * @param {string} content - Markdown file content.
 * @returns {string} Content with enforcement blocks removed.
 */
export function stripEnforcementFences(content) {
  return content
    .replace(/^[ \t]*```enforcement\s*\n[\s\S]*?^[ \t]*```\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';
}

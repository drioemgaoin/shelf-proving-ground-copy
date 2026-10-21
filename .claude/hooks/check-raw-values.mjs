#!/usr/bin/env node
// PreToolUse hook: block raw px/rem/em/hex values in component CSS.
// Components must use tokens from tokens.css. Exit 2 = block.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const tool = input.tool_name;
const ti = input.tool_input ?? {};
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

function block(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

/** Collect all content strings being written by this tool call. */
function getContents() {
  if (tool === 'Write') return [String(ti.content ?? '')];
  if (tool === 'Edit') return [String(ti.new_string ?? '')];
  if (tool === 'MultiEdit') return (ti.edits ?? []).map((e) => String(e.new_string ?? ''));
  return [];
}

function getFilePath() {
  return String(ti.file_path ?? '');
}

if (!['Edit', 'Write', 'MultiEdit'].includes(tool)) process.exit(0);

const abs = getFilePath();
const rel = relative(projectDir, abs).replace(/\\/g, '/');

// Only check component CSS in src/, skip tokens.css (it defines raw values).
if (!rel.startsWith('src/') || !rel.endsWith('.css')) process.exit(0);
if (rel === 'src/styles/tokens.css') process.exit(0);

// Strip CSS block comments to avoid false positives on commented-out code.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

const HEX_RE = /(?<!["\w-])#[0-9a-fA-F]{3,8}\b/;
const REM_EM_RE = /\b\d+(\.\d+)?(rem|em)\b/;
// px values: block unless the number is in the allowlist.
const PX_RE = /\b(\d+(?:\.\d+)?)px\b/g;
const PX_ALLOWLIST = new Set([0, 1, 9999]);

// Raw color functions — must use tokens instead.
const COLOR_FN_RE = /\b(rgb|rgba|hsl|hsla)\s*\(/;

// CSS named colors (W3C list, minus transparent/inherit/currentColor which are structural).
const NAMED_COLORS = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque',
  'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue',
  'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan',
  'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey',
  'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
  'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey',
  'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey',
  'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey',
  'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink',
  'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey',
  'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon',
  'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
  'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred',
  'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy',
  'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
  'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru',
  'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown',
  'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna',
  'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen',
  'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat',
  'white', 'whitesmoke', 'yellow', 'yellowgreen',
]);

// CSS properties that accept color values.
const COLOR_PROPS_RE = /^\s*(color|background|background-color|border-color|border|outline-color|outline|box-shadow|text-shadow|text-decoration-color|fill|stroke|caret-color|accent-color|column-rule-color|flood-color|lighting-color|stop-color)\s*:/;

// Lines that naturally contain raw px for structural reasons.
const STRUCTURAL_LINE_RE = /(@media|minmax\(|clamp\(|calc\()/;

for (const content of getContents()) {
  const clean = stripComments(content);
  const lines = clean.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // Skip structural lines (media queries, grid functions).
    if (STRUCTURAL_LINE_RE.test(trimmed)) continue;

    if (HEX_RE.test(trimmed)) {
      block(
        `Raw hex color found: "${trimmed.trim()}". Use a token from tokens.css. See ui-base.md > Values.`,
      );
    }

    // Raw color functions: rgb(), rgba(), hsl(), hsla().
    if (COLOR_FN_RE.test(trimmed)) {
      block(
        `Raw color function found: "${trimmed.trim()}". Use a token from tokens.css. See ui-base.md > Values.`,
      );
    }

    // Named CSS colors on color-accepting properties.
    if (COLOR_PROPS_RE.test(trimmed)) {
      // Extract the value part after the colon.
      const valueStr = trimmed.replace(/^[^:]+:\s*/, '').replace(/;.*$/, '').trim();
      // Split on whitespace and check each token (handles shorthand like `border: 1px solid red`).
      for (const token of valueStr.split(/\s+/)) {
        if (NAMED_COLORS.has(token.toLowerCase())) {
          block(
            `Named color "${token}" found: "${trimmed.trim()}". Use a token from tokens.css. See ui-base.md > Values.`,
          );
        }
      }
    }

    if (REM_EM_RE.test(trimmed)) {
      block(
        `Raw rem/em value found: "${trimmed.trim()}". Use a token from tokens.css. See ui-base.md > Values.`,
      );
    }

    // Check px values against allowlist.
    let match;
    PX_RE.lastIndex = 0;
    while ((match = PX_RE.exec(trimmed)) !== null) {
      const num = parseFloat(match[1]);
      if (!PX_ALLOWLIST.has(num)) {
        block(
          `Raw px value "${match[0]}" found: "${trimmed.trim()}". Use a token from tokens.css. See ui-base.md > Values.`,
        );
      }
    }
  }
}

process.exit(0);

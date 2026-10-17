#!/usr/bin/env node
/**
 * RED/GREEN tests for T1 enforcement patterns in coding-standards.md.
 *
 * Each pattern must:
 *   RED:   Match at least one violation string (proves the pattern catches bugs)
 *   GREEN: Not match clean code (proves no false positives)
 *
 * Seam: .claude/rules/coding-standards.md enforcement blocks
 * Level: unit
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// Read the rules file to confirm patterns exist
const rulesFile = readFileSync('.claude/rules/coding-standards.md', 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// style-naming-convention — "export default class "
// ═══════════════════════════════════════════════════════════════════════════

{
  assert(
    'style-naming-convention: pattern exists in rules file',
    rulesFile.includes('"export default class "'),
    'Pattern must be present in coding-standards.md',
  );

  const pattern = /export default class /;

  // RED: catches violation
  assert(
    'style-naming-convention RED: default class export',
    pattern.test('export default class Foo {}'),
    'Must catch export default class',
  );

  // GREEN: valid code passes
  assert(
    'style-naming-convention GREEN: named class export',
    !pattern.test('export class MyComponent {}'),
    'Named class export is valid',
  );
  assert(
    'style-naming-convention GREEN: camelCase function',
    !pattern.test('export function getBooks() {}'),
    'camelCase function is valid',
  );
  assert(
    'style-naming-convention GREEN: PascalCase function',
    !pattern.test('export function App() {}'),
    'PascalCase named export is valid',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// style-named-exports — "export default "
// ═══════════════════════════════════════════════════════════════════════════

{
  const pattern = /export default /;

  // RED
  assert(
    'style-named-exports RED: default function',
    pattern.test('export default function App() {}'),
    'Must catch export default function',
  );
  assert(
    'style-named-exports RED: default const',
    pattern.test('export default App;'),
    'Must catch export default value',
  );

  // GREEN
  assert(
    'style-named-exports GREEN: named export',
    !pattern.test('export function App() {}'),
    'Named export is valid',
  );
  assert(
    'style-named-exports GREEN: named const',
    !pattern.test('export const App = () => {};'),
    'Named const export is valid',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// style-no-nested-ternary — "(?<![?.])\?[^?:.]*(?<![?.])\?[^:]*:"
// ═══════════════════════════════════════════════════════════════════════════

{
  // JS doesn't support lookbehind in all envs, but Node 22 does
  const pattern = /(?<![?.])\?[^?:.]*(?<![?.])\?[^:]*:/;

  // RED: nested ternary
  assert(
    'no-nested-ternary RED: a ? b ? c : d : e',
    pattern.test('const x = a ? b ? c : d : e'),
    'Must catch nested ternary',
  );

  // GREEN: single ternary
  assert(
    'no-nested-ternary GREEN: single ternary',
    !pattern.test('const x = a ? b : c'),
    'Single ternary is valid',
  );

  // GREEN: optional chaining + single ternary (was the false positive)
  assert(
    'no-nested-ternary GREEN: optional chain + ternary',
    !pattern.test('const x = a?.b ? c : d'),
    'Optional chaining + ternary must NOT be flagged',
  );

  // GREEN: nullish coalescing + single ternary
  assert(
    'no-nested-ternary GREEN: nullish coalescing + ternary',
    !pattern.test('const x = a ?? b ? c : d'),
    'Nullish coalescing + ternary must NOT be flagged',
  );

  // GREEN: pure optional chaining
  assert(
    'no-nested-ternary GREEN: pure optional chaining',
    !pattern.test('const x = a?.b?.c'),
    'Pure optional chaining is valid',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// typescript-no-any — ":\s*any\b" and "\bas\s+any\b"
// ═══════════════════════════════════════════════════════════════════════════

{
  const colonAny = /:\s*any\b/;
  const asAny = /\bas\s+any\b/;

  // RED
  assert(
    'no-any RED: colon any',
    colonAny.test('const x: any = 5'),
    'Must catch : any',
  );
  assert(
    'no-any RED: as any',
    asAny.test('foo as any'),
    'Must catch as any',
  );

  // GREEN: word boundary prevents partial matches
  assert(
    'no-any GREEN: anyValue variable',
    !colonAny.test('const anyValue = 5'),
    'anyValue variable name must not be flagged',
  );
  assert(
    'no-any GREEN: unknown type',
    !colonAny.test('const x: unknown = 5'),
    'unknown type is valid',
  );
  assert(
    'no-any GREEN: analytics variable',
    !asAny.test('const analytics = foo'),
    'analytics must not be flagged by word boundary',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// typescript-no-unsafe-cast — "\bas\s+[A-Z]"
// ═══════════════════════════════════════════════════════════════════════════

{
  const pattern = /\bas\s+[A-Z]/;

  // RED
  assert(
    'no-unsafe-cast RED: as String',
    pattern.test('foo as String'),
    'Must catch as String',
  );
  assert(
    'no-unsafe-cast RED: as HTMLElement',
    pattern.test('el as HTMLElement'),
    'Must catch as HTMLElement',
  );

  // GREEN
  assert(
    'no-unsafe-cast GREEN: as const',
    !pattern.test('foo as const'),
    'as const is valid (lowercase)',
  );
  assert(
    'no-unsafe-cast GREEN: assertion variable',
    !pattern.test('const assertion = true'),
    'assertion variable must not be flagged',
  );
  assert(
    'no-unsafe-cast GREEN: satisfies',
    !pattern.test('foo satisfies Type'),
    'satisfies is valid',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// typescript-explicit-signatures — "export (async )?function \w+\([^)]*\)\s*\{"
// ═══════════════════════════════════════════════════════════════════════════

{
  const pattern = /export (async )?function \w+\([^)]*\)\s*\{/;

  // RED: missing return type
  assert(
    'explicit-signatures RED: no return type',
    pattern.test('export function getBooks() {'),
    'Must catch missing return type',
  );
  assert(
    'explicit-signatures RED: async no return type',
    pattern.test('export async function getBooks() {'),
    'Must catch async missing return type',
  );

  // GREEN: has return type — colon between ) and { breaks \s*\{
  assert(
    'explicit-signatures GREEN: with return type',
    !pattern.test('export function getBooks(): Promise<Book[]> {'),
    'Function with return type should not match',
  );
  assert(
    'explicit-signatures GREEN: async with return type',
    !pattern.test('export async function getBooks(): Promise<Book[]> {'),
    'Async function with return type should not match',
  );

  // GREEN: non-exported function
  assert(
    'explicit-signatures GREEN: non-exported',
    !pattern.test('function internal() {'),
    'Non-exported function is not checked',
  );

  // GREEN: arrow function
  assert(
    'explicit-signatures GREEN: arrow function',
    !pattern.test('export const getBooks = () => {'),
    'Arrow function is not matched by this pattern',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// testing-no-css-selectors — "querySelector|querySelectorAll" and "data-testid"
// ═══════════════════════════════════════════════════════════════════════════

{
  const selectorPattern = /querySelector|querySelectorAll/;
  const testidPattern = /data-testid/;

  // RED
  assert(
    'no-css-selectors RED: querySelector',
    selectorPattern.test("document.querySelector('.card')"),
    'Must catch querySelector',
  );
  assert(
    'no-css-selectors RED: querySelectorAll',
    selectorPattern.test("document.querySelectorAll('.card')"),
    'Must catch querySelectorAll',
  );
  assert(
    'no-css-selectors RED: data-testid',
    testidPattern.test('data-testid="card"'),
    'Must catch data-testid',
  );

  // GREEN
  assert(
    'no-css-selectors GREEN: getByRole',
    !selectorPattern.test("getByRole('button')"),
    'getByRole is valid',
  );
  assert(
    'no-css-selectors GREEN: getByLabelText',
    !testidPattern.test("getByLabelText('Name')"),
    'getByLabelText is valid',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// components-keyframes-in-layer — "^@keyframes" (line-start anchor)
// ═══════════════════════════════════════════════════════════════════════════

{
  const pattern = /^@keyframes/m;

  // RED: bare top-level @keyframes (violation)
  assert(
    'keyframes-in-layer RED: bare top-level',
    pattern.test('@keyframes shimmer {\n  from { opacity: 1 }\n}'),
    'Must catch bare top-level @keyframes',
  );

  // GREEN: @keyframes nested inside @layer (indented, not at line start)
  assert(
    'keyframes-in-layer GREEN: nested in @layer',
    !pattern.test('@layer components {\n  @keyframes shimmer {\n    from { opacity: 1 }\n  }\n}'),
    'Nested @keyframes inside @layer must NOT be flagged',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// architecture-composition-over-inherit — "class\s+\w+\s+extends\s+[A-Z]"
// ═══════════════════════════════════════════════════════════════════════════

{
  const pattern = /class\s+\w+\s+extends\s+[A-Z]/;

  // RED
  assert(
    'composition-over-inherit RED: class extends',
    pattern.test('class Dog extends Animal {'),
    'Must catch class inheritance',
  );
  assert(
    'composition-over-inherit RED: React class component',
    pattern.test('class App extends React.Component {'),
    'Must catch React class component',
  );

  // GREEN
  assert(
    'composition-over-inherit GREEN: function component',
    !pattern.test('function App() { return <div />; }'),
    'Function component is valid',
  );
  assert(
    'composition-over-inherit GREEN: composition',
    !pattern.test('const dog = createAnimal({ bark: true })'),
    'Composition pattern is valid',
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}

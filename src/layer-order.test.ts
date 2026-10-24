import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// CSS layers are ordered by first encounter — layers.css must load first
describe('CSS layer order architecture', () => {

  it('layers.css exists and contains only the @layer order declaration', () => {
    const layersPath = resolve(ROOT, 'src/styles/layers.css');
    const content = readFileSync(layersPath, 'utf-8');

    // Must contain the order declaration
    expect(content).toMatch(/@layer\s+base\s*,\s*tokens\s*,\s*components\s*;/);

    // Must NOT contain any @layer blocks (only the declaration statement)
    expect(content).not.toMatch(/@layer\s+\w+\s*\{/);
  });

  it('tokens.css does not contain the @layer order declaration', () => {
    const tokensPath = resolve(ROOT, 'src/styles/tokens.css');
    const content = readFileSync(tokensPath, 'utf-8');

    // The bare order declaration must NOT be in tokens.css
    expect(content).not.toMatch(/@layer\s+base\s*,\s*tokens\s*,\s*components\s*;/);

    // tokens.css should still have @layer blocks (tokens, base)
    expect(content).toMatch(/@layer\s+tokens\s*\{/);
    expect(content).toMatch(/@layer\s+base\s*\{/);
  });

  it('main.tsx imports layers.css before any other CSS or component import', () => {
    const mainPath = resolve(ROOT, 'src/main.tsx');
    const content = readFileSync(mainPath, 'utf-8');
    const lines = content.split('\n');

    // Find all import lines
    const imports = lines
      .map((line, i) => ({ line: line.trim(), index: i }))
      .filter(({ line }) => line.startsWith('import'));

    // Find the layers.css import
    const layersImport = imports.find(({ line }) =>
      /['"]\.\/styles\/layers\.css['"]/.test(line),
    );
    expect(layersImport, 'main.tsx must import layers.css').toBeDefined();

    // Find all CSS imports (any .css file)
    const cssImports = imports.filter(({ line }) => /['"][^'"]+\.css['"]/.test(line));
    expect(cssImports.length).toBeGreaterThanOrEqual(1);

    // layers.css must be the first CSS import
    const firstCssImport = cssImports[0];
    expect(
      firstCssImport.line,
      'layers.css must be the first CSS import in main.tsx',
    ).toMatch(/layers\.css/);

    // layers.css must come before any component/App import
    const appImport = imports.find(({ line }) => /from\s+['"]\.\/App['"]/.test(line));
    if (appImport && layersImport) {
      expect(
        layersImport.index,
        'layers.css import must appear before App import',
      ).toBeLessThan(appImport.index);
    }
  });
});

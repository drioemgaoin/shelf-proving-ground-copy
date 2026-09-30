#!/usr/bin/env node
// Adds Playwright (Chromium + WebKit) to the Dockerfile that `sandcastle init` generated.
// Re-run after changing the @playwright/test version, then rebuild the image:
//   node .sandcastle-overlay/patch-dockerfile.mjs && npx @ai-hero/sandcastle docker build-image
import { readFileSync, writeFileSync } from 'node:fs';

const DOCKERFILE = '.sandcastle/Dockerfile';

function getPlaywrightVersion() {
  // 1. CLI argument: node patch-dockerfile.mjs 1.52.0
  if (process.argv[2]) return process.argv[2];
  // 2. package-lock.json (npm)
  try {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const v = lock.packages?.['node_modules/@playwright/test']?.version;
    if (v) return v;
  } catch {}
  // 3. package.json devDependencies
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const spec = pkg.devDependencies?.['@playwright/test'] ?? pkg.dependencies?.['@playwright/test'];
    if (spec) {
      const m = spec.match(/(\d+\.\d+\.\d+)/);
      if (m) return m[1];
    }
  } catch {}
  throw new Error(
    'Cannot determine Playwright version.\n' +
    'Either run bootstrap.sh first, or pass the version explicitly:\n' +
    '  node .sandcastle-overlay/patch-dockerfile.mjs 1.52.0'
  );
}

const version = getPlaywrightVersion();

let df = readFileSync(DOCKERFILE, 'utf8').replace(/\n# >>> ui-kit playwright[\s\S]*?# <<< ui-kit playwright\n/g, '\n');

const asRoot = `
# >>> ui-kit playwright (root)
ARG PLAYWRIGHT_VERSION=${version}
RUN npx -y playwright@\${PLAYWRIGHT_VERSION} install-deps chromium webkit && rm -rf /var/lib/apt/lists/*
# <<< ui-kit playwright
`;
const asAgent = `
# >>> ui-kit playwright (agent)
RUN npx -y playwright@${version} install chromium webkit
# <<< ui-kit playwright
`;

const userLine = df.match(/^USER .*$/m);
if (!userLine) throw new Error('No USER line found in Dockerfile; add the Playwright lines by hand.');
df = df.replace(userLine[0], `${asRoot.trim()}\n\n${userLine[0]}`);

const pathLine = df.match(/^ENV PATH=.*$/m);
df = pathLine ? df.replace(pathLine[0], `${pathLine[0]}\n${asAgent.trim()}`) : df.replace(/^WORKDIR .*$/m, (m) => `${asAgent.trim()}\n\n${m}`);

writeFileSync(DOCKERFILE, df);
console.log(`Patched ${DOCKERFILE} with Playwright ${version}.`);

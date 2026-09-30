#!/usr/bin/env bash
# One-time, human-run setup of the Shelf test app. Deterministic, no AI involved.
# Run from the repo root after copying the ui-kit files in.
set -euo pipefail

if [ -f package.json ]; then
  echo "package.json already exists. bootstrap is for a fresh repo." >&2
  exit 1
fi

tmp="$(mktemp -d)"
echo "==> Scaffolding Vite + React + TypeScript"
(cd "$tmp" && npm create vite@latest app -- --template react-ts --no-interactive >/dev/null)
# Merge .gitignore, copy everything else (the kit's own files win on conflict)
cat "$tmp/app/.gitignore" >> .gitignore 2>/dev/null || cp "$tmp/app/.gitignore" .gitignore
rm -f "$tmp/app/.gitignore"
cp -rn "$tmp/app/." .
rm -rf "$tmp"

echo "==> Installing dependencies"
npm install --silent
npm install --silent -D \
  @playwright/test @axe-core/playwright \
  vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  @ai-hero/sandcastle tsx

echo "==> Scripts"
npm pkg set name=shelf
npm pkg set scripts.typecheck="tsc -b"
npm pkg set scripts.test="vitest run --passWithNoTests"
npm pkg set scripts.e2e="playwright test"
npm pkg set scripts.ui:qa="node scripts/ui-qa/run.mjs"
npm pkg set scripts.sandcastle="tsx .sandcastle/main.ts"

cat > vitest.config.ts <<'VITEST'
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
VITEST
echo "import '@testing-library/jest-dom/vitest';" > src/test-setup.ts

# Type-check the e2e tests too (tsc -b follows the root references)
cat > tsconfig.e2e.json <<'TSE2E'
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.e2e.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["e2e", "playwright.config.ts"]
}
TSE2E
node -e "const f='tsconfig.json',j=JSON.parse(require('fs').readFileSync(f,'utf8'));j.references=[...(j.references||[]),{path:'./tsconfig.e2e.json'}];require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\\n')"

cat >> .gitignore <<'GI'

# ui-kit
.ui-qa/
test-results/
playwright-report/
blob-report/
GI

echo "==> Checks"
npm run typecheck && npm run lint && npm test
echo
echo "Done. Next: follow TEST-PLAN.md, Phase 0 step 3."

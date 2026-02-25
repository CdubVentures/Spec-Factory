import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const GUI_SRC_ROOT = path.resolve('tools/gui-react/src');
const CHECK_ROOTS = [
  path.resolve('tools/gui-react/src/pages'),
  path.resolve('tools/gui-react/src/components'),
  path.resolve('tools/gui-react/src/hooks'),
];

function walkFiles(rootDir, out = []) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(nextPath, out);
      continue;
    }
    out.push(nextPath);
  }
  return out;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function stripJsComments(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('settings cache reads are owned by authority stores (no direct getQueryData usage in pages/components/hooks)', () => {
  const files = CHECK_ROOTS
    .flatMap((rootDir) => walkFiles(rootDir))
    .filter((filePath) => filePath.endsWith('.ts') || filePath.endsWith('.tsx'));

  const offenders = [];
  for (const filePath of files) {
    const text = stripJsComments(readText(filePath));
    if (text.includes('.getQueryData(')) {
      offenders.push(path.relative(GUI_SRC_ROOT, filePath));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `non-authority frontend files should not read query cache directly: ${JSON.stringify(offenders, null, 2)}`,
  );
});

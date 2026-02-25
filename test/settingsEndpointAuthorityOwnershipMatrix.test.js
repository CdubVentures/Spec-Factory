import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const GUI_SRC_ROOT = path.resolve('tools/gui-react/src');
const STORES_ROOT = path.resolve('tools/gui-react/src/stores');
const PAGES_ROOT = path.resolve('tools/gui-react/src/pages');

const DISALLOWED_ENDPOINT_PATTERNS = [
  { label: '/runtime-settings', match: (text) => text.includes('/runtime-settings') },
  { label: '/convergence-settings', match: (text) => text.includes('/convergence-settings') },
  {
    label: '/storage-settings (excluding /storage-settings/local/browse)',
    match: (text) => /\/storage-settings(?!\/local\/browse)/.test(text),
  },
  { label: '/ui-settings', match: (text) => text.includes('/ui-settings') },
  { label: '/llm-settings/', match: (text) => text.includes('/llm-settings/') },
  { label: '/source-strategy', match: (text) => text.includes('/source-strategy') },
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

test('settings endpoint ownership matrix: page surfaces do not call settings endpoints directly', () => {
  const allPageFiles = walkFiles(PAGES_ROOT)
    .filter((filePath) => filePath.endsWith('.ts') || filePath.endsWith('.tsx'));

  const offenders = [];
  for (const filePath of allPageFiles) {
    const text = stripJsComments(readText(filePath));
    for (const pattern of DISALLOWED_ENDPOINT_PATTERNS) {
      if (pattern.match(text)) {
        offenders.push({
          filePath: path.relative(GUI_SRC_ROOT, filePath),
          pattern: pattern.label,
        });
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `page files should not directly call settings endpoints: ${JSON.stringify(offenders, null, 2)}`,
  );
});

test('settings endpoint ownership matrix: authority stores own endpoint usage', () => {
  const runtimeAuthorityText = readText(path.join(STORES_ROOT, 'runtimeSettingsAuthority.ts'));
  const convergenceAuthorityText = readText(path.join(STORES_ROOT, 'convergenceSettingsAuthority.ts'));
  const storageAuthorityText = readText(path.join(STORES_ROOT, 'storageSettingsAuthority.ts'));
  const uiAuthorityText = readText(path.join(STORES_ROOT, 'uiSettingsAuthority.ts'));
  const llmAuthorityText = readText(path.join(STORES_ROOT, 'llmSettingsAuthority.ts'));
  const sourceStrategyAuthorityText = readText(path.join(STORES_ROOT, 'sourceStrategyAuthority.ts'));

  assert.equal(runtimeAuthorityText.includes('/runtime-settings'), true, 'runtime settings authority should own runtime settings endpoint usage');
  assert.equal(convergenceAuthorityText.includes('/convergence-settings'), true, 'convergence settings authority should own convergence settings endpoint usage');
  assert.equal(storageAuthorityText.includes('/storage-settings'), true, 'storage settings authority should own storage settings endpoint usage');
  assert.equal(uiAuthorityText.includes('/ui-settings'), true, 'ui settings authority should own ui settings endpoint usage');
  assert.equal(llmAuthorityText.includes('/llm-settings/'), true, 'llm settings authority should own llm settings endpoint usage');
  assert.equal(sourceStrategyAuthorityText.includes('/source-strategy'), true, 'source strategy authority should own source strategy endpoint usage');
});

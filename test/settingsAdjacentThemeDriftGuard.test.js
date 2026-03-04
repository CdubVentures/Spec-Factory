import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_ADJACENT_FILES = [
  path.resolve('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx'),
  path.resolve('tools/gui-react/src/pages/storage/StoragePage.tsx'),
];

const LEGACY_INLINE_BUNDLES = [
  'bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-4',
  'px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700',
  'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm',
  'px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700',
  'px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-blue-700 disabled:opacity-50',
  'px-3 py-1.5 text-xs border border-amber-300 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50',
  'inline-flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden',
];

const LEGACY_MICRO_TEXT_PATTERN = /text-\[(10|11)px\]/g;
const LEGACY_TEXT_XS_PATTERN = /\btext-xs\b/g;
const COLOR_UTILITY_PATTERN = /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const RADIUS_TOKEN_PATTERN = /\brounded(?:-[a-z0-9]+|\[[^\]]+\])?/g;
const APPROVED_RADIUS_TOKENS = new Set([
  'rounded',
  'rounded-full',
]);

function readEntries() {
  return SETTINGS_ADJACENT_FILES.map((filePath) => ({
    path: filePath,
    text: fs.readFileSync(filePath, 'utf8'),
  }));
}

function collectOffenders({ fragment, files }) {
  return files
    .filter((file) => file.text.includes(fragment))
    .map((file) => path.relative(process.cwd(), file.path));
}

test('settings-adjacent surfaces avoid legacy inline card/input/button bundles', () => {
  const files = readEntries();
  const offenders = LEGACY_INLINE_BUNDLES.reduce((acc, bundle) => {
    const bundleOffenders = collectOffenders({ fragment: bundle, files });
    if (bundleOffenders.length === 0) return acc;
    acc.push({
      bundle,
      files: bundleOffenders,
    });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `replace legacy settings-adjacent bundles with shared theme primitives: ${JSON.stringify(offenders)}`,
  );
});

test('settings-adjacent surfaces avoid arbitrary micro text utilities', () => {
  const files = readEntries();
  const offenders = files.reduce((acc, file) => {
    const matches = file.text.match(LEGACY_MICRO_TEXT_PATTERN) || [];
    if (matches.length === 0) return acc;
    acc.push({
      path: path.relative(process.cwd(), file.path),
      tokens: [...new Set(matches)].sort(),
    });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `replace arbitrary micro text utilities with shared text primitives: ${JSON.stringify(offenders)}`,
  );
});

test('settings-adjacent surfaces use typography primitives instead of raw text-xs', () => {
  const files = readEntries();
  const offenders = files.reduce((acc, file) => {
    const matches = file.text.match(LEGACY_TEXT_XS_PATTERN) || [];
    if (matches.length === 0) return acc;
    acc.push({
      path: path.relative(process.cwd(), file.path),
      count: matches.length,
    });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `replace raw text-xs utilities with shared typography primitives: ${JSON.stringify(offenders)}`,
  );
});

test('settings-adjacent surfaces keep a constrained radius utility palette', () => {
  const files = readEntries();
  const offenders = files.reduce((acc, file) => {
    const matches = file.text.match(RADIUS_TOKEN_PATTERN) || [];
    const invalidTokens = matches.filter((token) => !APPROVED_RADIUS_TOKENS.has(token));
    if (invalidTokens.length === 0) return acc;
    acc.push({
      path: path.relative(process.cwd(), file.path),
      tokens: [...new Set(invalidTokens)].sort(),
    });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `settings-adjacent radius token drift detected: ${JSON.stringify(offenders)}`,
  );
});

test('settings-adjacent surfaces reduce raw utility color density', () => {
  const files = readEntries();
  const offenders = files.reduce((acc, file) => {
    const count = (file.text.match(COLOR_UTILITY_PATTERN) || []).length;
    if (count <= 60) return acc;
    acc.push({
      path: path.relative(process.cwd(), file.path),
      count,
    });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `settings-adjacent utility color density remains too high: ${JSON.stringify(offenders)}`,
  );
});

test('llm settings selected preset rows map active tone directly to effort tiers', () => {
  const llmFile = readEntries().find((entry) => entry.path.endsWith('LlmSettingsPage.tsx'));
  assert.ok(llmFile, 'expected llm settings page file to be present');
  const text = llmFile?.text ?? '';

  assert.match(
    text,
    /function\s+selectedRouteTone\s*\(\s*row:\s*LlmRouteRow\s*\)\s*\{/s,
    'selected row class tone should be resolved through selectedRouteTone helper',
  );
  assert.match(
    text,
    /effortBand === '9-10'[\s\S]*'sf-callout sf-callout-danger'/s,
    'selected row class tone should map effort band 9-10 to danger',
  );
  assert.match(
    text,
    /effortBand === '7-8'[\s\S]*'sf-callout sf-callout-warning'/s,
    'selected row class tone should map effort band 7-8 to warning',
  );
  assert.match(
    text,
    /effortBand === '4-6'[\s\S]*'sf-callout sf-callout-info'[\s\S]*return 'sf-callout sf-callout-success';/s,
    'selected row class tone should map effort band 4-6 to info and lower effort to success',
  );
  assert.match(
    text,
    /selectedRouteTone\(row\)/,
    'selected row className should consume selectedRouteTone helper',
  );
  assert.match(
    text,
    /function\s+selectedRouteToneStyle\s*\(\s*row:\s*LlmRouteRow\s*\)\s*\{/s,
    'selected row inline style should be resolved through selectedRouteToneStyle helper',
  );
  assert.match(
    text,
    /style=\{selected \? selectedRouteToneStyle\(row\) : undefined\}/s,
    'selected row should pin effort-tone colors on hover via inline style',
  );
});

test('llm settings uses dedicated horizontal tab primitives', () => {
  const llmFile = readEntries().find((entry) => entry.path.endsWith('LlmSettingsPage.tsx'));
  assert.ok(llmFile, 'expected llm settings page file to be present');
  const text = llmFile?.text ?? '';

  assert.match(
    text,
    /sf-tab-strip/,
    'expected llm scope bar to use dedicated horizontal tab strip primitive',
  );
  assert.match(
    text,
    /sf-tab-item/,
    'expected llm scope buttons to use dedicated horizontal tab item primitive',
  );
  assert.match(
    text,
    /sf-tab-item-active/,
    'expected llm active scope button to use dedicated active tab primitive',
  );
});

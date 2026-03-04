import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PANELS_DIR = path.resolve('tools/gui-react/src/pages/indexing/panels');
const LEGACY_PANEL_SHELL_FRAGMENT = 'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800';
const LEGACY_PANEL_SECTION_FRAGMENT = 'rounded border border-gray-200 dark:border-gray-700';
const LEGACY_PANEL_BUTTON_FRAGMENT = 'rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700';
const LEGACY_CARD_SURFACE_FRAGMENT = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg';
const LEGACY_BADGE_COLOR_BUNDLES = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-500',
  'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500',
  'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200',
  'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  'bg-green-100 text-green-800',
  'bg-red-100 text-red-800',
  'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700',
  'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
  'border border-red-300 bg-red-50 px-1.5 py-0.5 sf-text-caption font-semibold text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300',
];
const LEGACY_CALLOUT_COLOR_BUNDLES = [
  'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800',
  'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800',
  'border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20',
  'border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20',
  'border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20',
  'border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20',
  'border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20',
  'border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20',
];
const LEGACY_MICRO_TEXT_PATTERN = /text-\[(8|9|10|11)px\]/g;
const RAW_COLOR_UTILITY_PATTERN = /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const INDEXING_RADIUS_TOKEN_PATTERN = /\brounded(?:-[a-z0-9]+|\[[^\]]+\])?/g;
const APPROVED_INDEXING_RADIUS_TOKENS = new Set([
  'rounded',
  'rounded-lg',
  'rounded-full',
]);

function readPanelEntries() {
  return fs
    .readdirSync(INDEXING_PANELS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => {
      const filePath = path.join(INDEXING_PANELS_DIR, entry.name);
      return {
        path: filePath,
        text: fs.readFileSync(filePath, 'utf8'),
      };
    });
}

function collectOffenders({ fragment, files }) {
  return files
    .filter((file) => file.text.includes(fragment))
    .map((file) => path.relative(process.cwd(), file.path));
}

test('indexing panels use shared outer shell primitive bundle', () => {
  const files = readPanelEntries();
  const offenders = collectOffenders({ fragment: LEGACY_PANEL_SHELL_FRAGMENT, files });
  assert.deepEqual(
    offenders,
    [],
    `replace legacy shell bundle with shared primitive class usage: ${offenders.join(', ')}`,
  );
});

test('indexing panels use shared elevated section primitive bundle', () => {
  const files = readPanelEntries();
  const offenders = collectOffenders({ fragment: LEGACY_PANEL_SECTION_FRAGMENT, files });
  assert.deepEqual(
    offenders,
    [],
    `replace legacy section bundle with shared primitive class usage: ${offenders.join(', ')}`,
  );
});

test('indexing panels use shared icon-button primitive bundle', () => {
  const files = readPanelEntries();
  const offenders = collectOffenders({ fragment: LEGACY_PANEL_BUTTON_FRAGMENT, files });
  assert.deepEqual(
    offenders,
    [],
    `replace legacy button bundle with shared primitive class usage: ${offenders.join(', ')}`,
  );
});

test('indexing panels use shared card surface primitive bundle', () => {
  const files = readPanelEntries();
  const offenders = collectOffenders({ fragment: LEGACY_CARD_SURFACE_FRAGMENT, files });
  assert.deepEqual(
    offenders,
    [],
    `replace legacy card surface bundle with shared primitive class usage: ${offenders.join(', ')}`,
  );
});

test('indexing panels avoid legacy inline badge color bundles', () => {
  const files = readPanelEntries();
  const offenders = LEGACY_BADGE_COLOR_BUNDLES.reduce((acc, bundle) => {
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
    `replace legacy badge color bundles with shared chip primitives: ${JSON.stringify(offenders)}`,
  );
});

test('indexing panels avoid legacy inline callout color bundles', () => {
  const files = readPanelEntries();
  const offenders = LEGACY_CALLOUT_COLOR_BUNDLES.reduce((acc, bundle) => {
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
    `replace legacy callout color bundles with shared callout primitives: ${JSON.stringify(offenders)}`,
  );
});

test('indexing panels keep a constrained radius utility palette', () => {
  const files = readPanelEntries();
  const offenders = files.reduce((acc, file) => {
    const matches = file.text.match(INDEXING_RADIUS_TOKEN_PATTERN) || [];
    const invalidTokens = matches.filter((token) => !APPROVED_INDEXING_RADIUS_TOKENS.has(token));
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
    `radius token drift detected: ${JSON.stringify(offenders)}`,
  );
});

test('indexing panels avoid arbitrary micro text utilities', () => {
  const files = readPanelEntries();
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

test('indexing migrated panels avoid raw utility color classes', () => {
  const migratedPanels = [
    'Phase05Panel.tsx',
    'RuntimePanel.tsx',
    'SearchProfilePanel.tsx',
    'SerpExplorerPanel.tsx',
    'LlmOutputPanel.tsx',
    'Phase06Panel.tsx',
    'EventStreamPanel.tsx',
    'BatchPanel.tsx',
    'LearningPanel.tsx',
    'LlmMetricsPanel.tsx',
    'NeedSetPanel.tsx',
    'OverviewPanel.tsx',
    'PanelControlsPanel.tsx',
    'SessionDataPanel.tsx',
    'UrlHealthPanel.tsx',
    'Phase08Panel.tsx',
    'Phase07Panel.tsx',
    'Phase06bPanel.tsx',
    'Phase09Panel.tsx',
    'PickerPanel.tsx',
    'WorkerPanel.tsx',
  ];
  const offenders = migratedPanels.reduce((acc, fileName) => {
    const filePath = path.join(INDEXING_PANELS_DIR, fileName);
    const text = fs.readFileSync(filePath, 'utf8');
    const rawColorTokens = [...new Set(text.match(RAW_COLOR_UTILITY_PATTERN) || [])].sort();
    if (rawColorTokens.length === 0) return acc;
    acc.push({
      fileName,
      tokens: rawColorTokens,
    });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `replace migrated indexing panel raw utility color tokens with semantic primitives: ${JSON.stringify(offenders)}`,
  );
});

test('phase 05 panel uses shared table primitives for visual parity', () => {
  const filePath = path.join(INDEXING_PANELS_DIR, 'Phase05Panel.tsx');
  const text = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    text.includes('sf-table-shell'),
    'Phase05Panel must wrap tables with sf-table-shell for consistent table surface treatment',
  );
  assert.ok(
    text.includes('sf-table-head'),
    'Phase05Panel must use sf-table-head for consistent table header treatment',
  );
  assert.ok(
    text.includes('sf-table-row'),
    'Phase05Panel must use sf-table-row for consistent row treatment',
  );
});

test('indexing panel titles avoid phase suffix labels', () => {
  const files = readPanelEntries();
  const offenders = files.reduce((acc, file) => {
    const matches = [...file.text.matchAll(/\(Phase [0-9A-Z]+\)/g)].map((match) => match[0]);
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
    `remove phase suffixes from indexing panel labels: ${JSON.stringify(offenders)}`,
  );
});

test('indexing page shell avoids raw utility color classes', () => {
  const filePath = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
  const text = fs.readFileSync(filePath, 'utf8');
  const rawColorTokens = [...new Set(text.match(RAW_COLOR_UTILITY_PATTERN) || [])].sort();

  assert.deepEqual(
    rawColorTokens,
    [],
    `replace IndexingPage raw utility color tokens with semantic primitives: ${JSON.stringify(rawColorTokens)}`,
  );
});

test('picker panel run controls use solid emphasis button variants', () => {
  const pickerPanelPath = path.resolve('tools/gui-react/src/pages/indexing/panels/PickerPanel.tsx');
  const pickerPanelText = fs.readFileSync(pickerPanelPath, 'utf8');
  const themePath = path.resolve('tools/gui-react/src/theme.css');
  const themeText = fs.readFileSync(themePath, 'utf8');

  const requiredPickerTokens = [
    'Run IndexLab',
    'sf-primary-button',
    'Stop Process',
    'sf-danger-button-solid',
    'Replay Selected Run',
    'sf-icon-button',
  ];
  const missingPickerTokens = requiredPickerTokens.filter((token) => !pickerPanelText.includes(token));
  assert.deepEqual(
    missingPickerTokens,
    [],
    `picker run controls should include solid emphasis button variants: ${JSON.stringify(missingPickerTokens)}`,
  );
  assert.equal(
    pickerPanelText.includes('Replay Selected Run') && pickerPanelText.includes('sf-action-button'),
    false,
    'Replay Selected Run should use a solid button variant instead of sf-action-button outline styling',
  );
  assert.match(
    pickerPanelText,
    /onClick=\{onReplaySelectedRunView\}[\s\S]*className=\"[^\"]*sf-icon-button/,
    'Replay Selected Run should use neutral icon-button styling for lower emphasis',
  );
  assert.equal(
    /onClick=\{onReplaySelectedRunView\}[\s\S]*className=\"[^\"]*sf-primary-button/.test(pickerPanelText),
    false,
    'Replay Selected Run should not share the same sf-primary-button class as Run IndexLab',
  );
  assert.equal(
    /onClick=\{onReplaySelectedRunView\}[\s\S]*className=\"[^\"]*sf-success-button-solid/.test(pickerPanelText),
    false,
    'Replay Selected Run should not use success-green solid styling',
  );
  assert.equal(
    /onClick=\{onReplaySelectedRunView\}[\s\S]*className=\"[^\"]*sf-accent-button-solid/.test(pickerPanelText),
    false,
    'Replay Selected Run should not use accent solid styling',
  );

  const requiredThemeTokens = [
    '.sf-danger-button-solid {',
    '.sf-danger-button-solid:hover {',
  ];
  const missingThemeTokens = requiredThemeTokens.filter((token) => !themeText.includes(token));
  assert.deepEqual(
    missingThemeTokens,
    [],
    `theme should define solid danger button primitive for picker run controls: ${JSON.stringify(missingThemeTokens)}`,
  );
});

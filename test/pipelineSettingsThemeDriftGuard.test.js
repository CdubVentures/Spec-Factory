import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PIPELINE_SETTINGS_FILES = [
  path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx'),
  path.resolve('tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx'),
];

const LEGACY_INLINE_BUNDLES = [
  'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-500',
  'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300',
  'border-gray-300 bg-gray-100 text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300',
  'border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700 dark:text-rose-200 dark:hover:bg-rose-900/20',
  'rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
  'rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40',
  'rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/35',
  'rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60',
  'rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50',
  'rounded bg-accent px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50',
  'border-blue-800 bg-blue-700 text-white ring-1 ring-inset ring-blue-900/40',
  'rounded border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50',
];

const LEGACY_MICRO_TEXT_PATTERN = /text-\[(10|11)px\]/g;
const LEGACY_TEXT_XS_PATTERN = /\btext-xs\b/g;
const RAW_COLOR_UTILITY_PATTERN = /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const RADIUS_TOKEN_PATTERN = /\brounded(?:-[a-z0-9]+|\[[^\]]+\])?/g;
const LEGACY_ROOT_RADIUS_FRAGMENT = 'min-h-[640px] rounded-lg overflow-hidden sf-shell border';
const APPROVED_RADIUS_TOKENS = new Set([
  'rounded',
  'rounded-full',
]);

function readEntries() {
  return PIPELINE_SETTINGS_FILES.map((filePath) => ({
    path: filePath,
    text: fs.readFileSync(filePath, 'utf8'),
  }));
}

function collectOffenders({ fragment, files }) {
  return files
    .filter((file) => file.text.includes(fragment))
    .map((file) => path.relative(process.cwd(), file.path));
}

test('pipeline settings surfaces avoid legacy inline color and shell bundles', () => {
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
    `replace legacy pipeline settings bundles with shared theme primitives: ${JSON.stringify(offenders)}`,
  );
});

test('pipeline settings keep a constrained radius utility palette', () => {
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
    `pipeline settings radius token drift detected: ${JSON.stringify(offenders)}`,
  );
});

test('pipeline settings root shell avoids oversized radius drift', () => {
  const files = readEntries();
  const offenders = collectOffenders({ fragment: LEGACY_ROOT_RADIUS_FRAGMENT, files });
  assert.deepEqual(
    offenders,
    [],
    `pipeline settings root shell should use baseline rounded radius: ${JSON.stringify(offenders)}`,
  );
});

test('pipeline settings avoid arbitrary micro text utilities', () => {
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

test('pipeline settings use typography primitives instead of raw text-xs', () => {
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
    `replace raw text-xs utilities in pipeline settings with shared typography primitives: ${JSON.stringify(offenders)}`,
  );
});

test('runtime flow card raw utility color drift is reduced for current migration wave', () => {
  const files = readEntries();
  const runtimeFlowCard = files.find((file) => file.path.endsWith('RuntimeSettingsFlowCard.tsx'));
  assert.ok(runtimeFlowCard, 'expected runtime settings flow card file to be present');
  const rawColorCount = ((runtimeFlowCard?.text ?? '').match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 12,
    true,
    `runtime flow card raw utility color refs should be <= 12 for this migration wave, got ${rawColorCount}`,
  );
});

test('pipeline sidebars keep uniform nav item heights', () => {
  const files = readEntries();
  const pipelinePage = files.find((file) => file.path.endsWith('PipelineSettingsPage.tsx'));
  assert.ok(pipelinePage, 'expected pipeline settings page file to be present');
  const text = pipelinePage?.text ?? '';

  assert.match(
    text,
    /className=\{`group w-full min-h-\[74px\] sf-nav-item px-2\.5 py-2\.5 text-left \$\{isActive \? 'sf-nav-item-active' : ''\}`\}/s,
    'expected primary sidebar nav items to use a uniform min height',
  );
  assert.match(
    text,
    /className=\{`group w-full min-h-\[74px\] sf-nav-item px-2\.5 py-2\.5 text-left \$\{isGroupActive \? 'sf-nav-item-active' : ''\}`\}/s,
    'expected convergence sidebar nav items to use a uniform min height',
  );
});

test('pipeline convergence sidebar avoids knob count copy in nav buttons', () => {
  const files = readEntries();
  const pipelinePage = files.find((file) => file.path.endsWith('PipelineSettingsPage.tsx'));
  assert.ok(pipelinePage, 'expected pipeline settings page file to be present');
  const text = pipelinePage?.text ?? '';

  assert.equal(
    text.includes('{group.knobs.length} knob'),
    false,
    'expected convergence sidebar buttons to avoid knob-count text',
  );
  assert.equal(
    text.includes('{activeGroup.knobs.length} knob'),
    false,
    'expected convergence header to avoid knob-count text',
  );
});

test('pipeline settings use full-height shell and nested sidebars avoid horizontal scrolling', () => {
  const files = readEntries();
  const pipelinePage = files.find((file) => file.path.endsWith('PipelineSettingsPage.tsx'));
  const runtimeFlowCard = files.find((file) => file.path.endsWith('RuntimeSettingsFlowCard.tsx'));
  assert.ok(pipelinePage, 'expected pipeline settings page file to be present');
  assert.ok(runtimeFlowCard, 'expected runtime settings flow card file to be present');

  const pipelineText = pipelinePage?.text ?? '';
  const runtimeText = runtimeFlowCard?.text ?? '';

  assert.match(
    pipelineText,
    /className="flex h-full min-h-0 rounded overflow-hidden sf-shell border"/,
    'expected pipeline settings shell to consume full available height',
  );
  assert.match(
    pipelineText,
    /sf-shell-main flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden/,
    'expected pipeline main panel to block horizontal overflow',
  );
  assert.match(
    pipelineText,
    /className="rounded sf-surface-elevated p-2\.5 sm:p-3 flex min-h-0 flex-col"/,
    'expected convergence sidebar to stretch within available height',
  );
  assert.match(
    pipelineText,
    /className="min-h-0 flex-1 space-y-1\.5 overflow-y-auto overflow-x-hidden pr-1"/,
    'expected convergence sidebar list to keep vertical-only scrolling',
  );

  assert.match(
    runtimeText,
    /className="rounded sf-surface-elevated p-2\.5 sm:p-3 flex min-h-0 flex-col"/,
    'expected runtime flow sidebar to stretch within available height',
  );
  assert.match(
    runtimeText,
    /className="min-h-0 flex-1 space-y-1\.5 overflow-y-auto overflow-x-hidden pr-1"/,
    'expected runtime flow sidebar list to keep vertical-only scrolling',
  );
});

test('convergence knob rows avoid mid-width overflow that causes horizontal scrollbars', () => {
  const files = readEntries();
  const pipelinePage = files.find((file) => file.path.endsWith('PipelineSettingsPage.tsx'));
  assert.ok(pipelinePage, 'expected pipeline settings page file to be present');
  const text = pipelinePage?.text ?? '';

  assert.equal(
    text.includes('md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)]'),
    false,
    'expected convergence knob rows to avoid md forced two-column widths',
  );
  assert.match(
    text,
    /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(220px,300px\)\]/,
    'expected convergence knob rows to switch to two-column layout only at xl and above',
  );
  assert.match(
    text,
    /inline-flex min-w-0 flex-wrap items-center gap-1 sf-text-label font-semibold/,
    'expected convergence knob labels to wrap instead of forcing horizontal overflow',
  );
});

test('runtime flow sidebar selection tone matches convergence selection rules', () => {
  const files = readEntries();
  const runtimeFlowCard = files.find((file) => file.path.endsWith('RuntimeSettingsFlowCard.tsx'));
  assert.ok(runtimeFlowCard, 'expected runtime settings flow card file to be present');
  const text = runtimeFlowCard?.text ?? '';

  assert.match(
    text,
    /const toneClass = active\s*\?\s*'sf-callout sf-callout-info'\s*:\s*'sf-callout sf-callout-neutral';/s,
    'expected runtime flow icon background tone to mirror convergence selected/neutral treatment',
  );
  assert.match(
    text,
    /backgroundColor:\s*isActive\s*\?\s*'rgb\(var\(--sf-color-accent-rgb\)\)'\s*:\s*'rgb\(var\(--sf-color-border-subtle-rgb\)\s*\/\s*0\.7\)'/s,
    'expected runtime flow row marker dots to use blue only for selected steps',
  );
  assert.match(
    text,
    /<RuntimeStepIcon[\s\S]*id=\{activeRuntimeStep\.id\}[\s\S]*active[\s\S]*\/>/s,
    'expected runtime flow detail header icon to use selected-state tone',
  );
});

test('pipeline top-level controls avoid duplicate save labels and runtime flow uses concise save/autosave/reset labels', () => {
  const files = readEntries();
  const pipelinePage = files.find((file) => file.path.endsWith('PipelineSettingsPage.tsx'));
  const runtimeFlowCard = files.find((file) => file.path.endsWith('RuntimeSettingsFlowCard.tsx'));
  assert.ok(pipelinePage, 'expected pipeline settings page file to be present');
  assert.ok(runtimeFlowCard, 'expected runtime settings flow card file to be present');

  const pipelineText = pipelinePage?.text ?? '';
  const runtimeText = runtimeFlowCard?.text ?? '';

  assert.equal(
    pipelineText.includes('Save Settings'),
    false,
    'pipeline top controls should not duplicate save labels',
  );
  assert.equal(
    runtimeText.includes('Reset All Defaults'),
    false,
    'runtime flow controls should use concise reset label',
  );
  assert.equal(
    runtimeText.includes('Reload'),
    false,
    'runtime flow controls should not expose local reload button',
  );
  assert.equal(
    runtimeText.includes('Auto-Save'),
    true,
    'runtime flow controls should keep autosave toggle with explicit state label',
  );
  assert.equal(
    runtimeText.includes("{runtimeSettingsSaving ? 'Saving...' : 'Save'}"),
    true,
    'runtime flow controls should keep a single save label',
  );
  assert.equal(
    runtimeText.includes("runtimeAutoSaveEnabled ? 'Auto-Save On' : 'Auto-Save Off'"),
    true,
    'runtime flow autosave toggle should display explicit On/Off state',
  );
  assert.equal(
    runtimeText.includes("runtimeAutoSaveEnabled\n            ? 'sf-icon-button'\n            : 'sf-primary-button'"),
    true,
    'runtime flow save button should be neutral when autosave is on and primary when autosave is off',
  );
  assert.equal(
    runtimeText.includes('disabled={!runtimeSettingsReady || !runtimeDirty || runtimeSettingsSaving || runtimeAutoSaveEnabled}'),
    false,
    'runtime flow save button should not fade from a dirty-state disable when autosave is off',
  );
});

test('pipeline source strategy buttons use shared primary/icon primitives', () => {
  const files = readEntries();
  const pipelinePage = files.find((file) => file.path.endsWith('PipelineSettingsPage.tsx'));
  assert.ok(pipelinePage, 'expected pipeline settings page file to be present');
  const text = pipelinePage?.text ?? '';

  assert.equal(
    text.includes('sf-button-primary'),
    false,
    'source strategy should not rely on undefined sf-button-primary class',
  );
  assert.equal(
    text.includes('sf-button-secondary'),
    false,
    'source strategy should not rely on undefined sf-button-secondary class',
  );
  assert.equal(
    text.includes('Add Source'),
    true,
    'source strategy should keep add action',
  );
  assert.match(
    text,
    /Add Source[\s\S]*sf-primary-button/s,
    'add action should use shared primary button styling',
  );
});

test('pipeline header does not render inline appearance controls', () => {
  const files = readEntries();
  const pipelinePage = files.find((file) => file.path.endsWith('PipelineSettingsPage.tsx'));
  assert.ok(pipelinePage, 'expected pipeline settings page file to be present');
  const text = pipelinePage?.text ?? '';

  assert.equal(
    text.includes('Appearance'),
    false,
    'pipeline header should not include inline appearance controls',
  );
  assert.equal(
    text.includes('SF_THEME_COLOR_PROFILES'),
    false,
    'pipeline page should not import global theme profile option contracts',
  );
  assert.equal(
    text.includes('SF_THEME_RADIUS_PROFILES'),
    false,
    'pipeline page should not import global radius profile option contracts',
  );
});

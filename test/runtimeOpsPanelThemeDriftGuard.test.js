import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RUNTIME_OPS_PANELS_DIR = path.resolve('tools/gui-react/src/pages/runtime-ops/panels');
const RUNTIME_OPS_COMPONENTS_DIR = path.resolve('tools/gui-react/src/pages/runtime-ops/components');
const RUNTIME_OPS_HELPERS_PATH = path.resolve('tools/gui-react/src/pages/runtime-ops/helpers.ts');
const RUNTIME_OPS_HELPER_MODULE_PATHS = [
  RUNTIME_OPS_HELPERS_PATH,
  path.resolve('tools/gui-react/src/pages/runtime-ops/panels/domainClassifierHelpers.js'),
  path.resolve('tools/gui-react/src/pages/runtime-ops/panels/searchResultsHelpers.js'),
  path.resolve('tools/gui-react/src/pages/runtime-ops/panels/serpTriageHelpers.js'),
  path.resolve('tools/gui-react/src/pages/runtime-ops/panels/urlPredictorHelpers.js'),
];
const LEGACY_PANEL_SECTION_FRAGMENT = 'rounded border border-gray-200 dark:border-gray-700';
const LEGACY_ACTION_BUTTON_FRAGMENT = 'w-full text-xs text-center py-2 rounded border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors';
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
];
const LEGACY_CALLOUT_COLOR_BUNDLES = [
  'rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300',
  'rounded border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 text-xs text-yellow-700 dark:text-yellow-300',
  'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800',
  'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800',
  'bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800',
  'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800',
  'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-xs text-yellow-700 dark:text-yellow-300',
  'bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800',
  'bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-100',
  'border-green-200 text-green-800 bg-green-50 dark:border-green-800 dark:text-green-200 dark:bg-green-900/20',
  'border-yellow-200 text-yellow-800 bg-yellow-50 dark:border-yellow-800 dark:text-yellow-200 dark:bg-yellow-900/20',
  'border-red-200 text-red-800 bg-red-50 dark:border-red-800 dark:text-red-200 dark:bg-red-900/20',
  'border-blue-200 text-blue-800 bg-blue-50 dark:border-blue-800 dark:text-blue-200 dark:bg-blue-900/20',
  'border-emerald-200 text-emerald-800 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:bg-emerald-900/20',
  'border-amber-200 text-amber-800 bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:bg-amber-900/20',
  'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700',
  'border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 sf-text-caption text-red-700 dark:text-red-300',
];
const LEGACY_MICRO_TEXT_PATTERN = /text-\[(8|9|10|11)px\]/g;
const RAW_COLOR_UTILITY_PATTERN = /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const RUNTIME_OPS_RADIUS_TOKEN_PATTERN = /\brounded(?:-[a-z0-9]+|\[[^\]]+\])?/g;
const APPROVED_RUNTIME_OPS_RADIUS_TOKENS = new Set([
  'rounded',
  'rounded-sm',
  'rounded-lg',
  'rounded-full',
  'rounded-t',
  'rounded-b',
]);

function readPanelEntries() {
  return fs
    .readdirSync(RUNTIME_OPS_PANELS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => {
      const filePath = path.join(RUNTIME_OPS_PANELS_DIR, entry.name);
      return {
        path: filePath,
        text: fs.readFileSync(filePath, 'utf8'),
      };
    });
}

function readComponentEntries() {
  return fs
    .readdirSync(RUNTIME_OPS_COMPONENTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => {
      const filePath = path.join(RUNTIME_OPS_COMPONENTS_DIR, entry.name);
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

test('runtime-ops panels use shared elevated section primitive bundle', () => {
  const files = readPanelEntries();
  const offenders = collectOffenders({ fragment: LEGACY_PANEL_SECTION_FRAGMENT, files });
  assert.deepEqual(
    offenders,
    [],
    `replace legacy section bundle with shared primitive class usage: ${offenders.join(', ')}`,
  );
});

test('runtime-ops panels use shared action-button primitive bundle', () => {
  const files = readPanelEntries();
  const offenders = collectOffenders({ fragment: LEGACY_ACTION_BUTTON_FRAGMENT, files });
  assert.deepEqual(
    offenders,
    [],
    `replace legacy action button bundle with shared primitive class usage: ${offenders.join(', ')}`,
  );
});

test('runtime-ops panels use shared card surface primitive bundle', () => {
  const files = readPanelEntries();
  const offenders = collectOffenders({ fragment: LEGACY_CARD_SURFACE_FRAGMENT, files });
  assert.deepEqual(
    offenders,
    [],
    `replace legacy card surface bundle with shared primitive class usage: ${offenders.join(', ')}`,
  );
});

test('runtime-ops panels keep a constrained radius utility palette', () => {
  const files = readPanelEntries();
  const offenders = files.reduce((acc, file) => {
    const matches = file.text.match(RUNTIME_OPS_RADIUS_TOKEN_PATTERN) || [];
    const invalidTokens = matches.filter((token) => !APPROVED_RUNTIME_OPS_RADIUS_TOKENS.has(token));
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

test('runtime-ops panels avoid legacy inline badge color bundles', () => {
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

test('runtime-ops panels avoid legacy inline callout color bundles', () => {
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

test('runtime-ops panels avoid arbitrary micro text utilities', () => {
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

test('runtime migrated panels avoid raw utility color classes', () => {
  const migratedPanels = [
    'QueueTab.tsx',
    'PrefetchSearchPlannerPanel.tsx',
    'PrefetchBrandResolverPanel.tsx',
    'PrefetchUrlPredictorPanel.tsx',
    'PrefetchSerpTriagePanel.tsx',
    'PrefetchSearchResultsPanel.tsx',
    'PrefetchDomainClassifierPanel.tsx',
    'PrefetchNeedSetPanel.tsx',
    'PrefetchQueryJourneyPanel.tsx',
    'PrefetchSearchProfilePanel.tsx',
    'WorkerDataDrawer.tsx',
    'PrefetchLlmCallPanel.tsx',
    'PrefetchTabRow.tsx',
    'OverviewTab.tsx',
    'MetricsRail.tsx',
    'PipelineFlowStrip.tsx',
    'WorkerSubTabs.tsx',
    'WorkerLivePanel.tsx',
    'WorkersTab.tsx',
    'BrowserStream.tsx',
    'ScreenshotPreview.tsx',
    'DocumentsTab.tsx',
    'ExtractionTab.tsx',
    'FallbacksTab.tsx',
  ];
  const offenders = migratedPanels.reduce((acc, fileName) => {
    const filePath = path.join(RUNTIME_OPS_PANELS_DIR, fileName);
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
    `replace migrated runtime panel raw utility color tokens with semantic primitives: ${JSON.stringify(offenders)}`,
  );
});

test('runtime-ops page shell avoids raw utility color classes', () => {
  const pagePath = path.resolve('tools/gui-react/src/pages/runtime-ops/RuntimeOpsPage.tsx');
  const text = fs.readFileSync(pagePath, 'utf8');
  const rawColorTokens = [...new Set(text.match(RAW_COLOR_UTILITY_PATTERN) || [])].sort();
  assert.deepEqual(
    rawColorTokens,
    [],
    `replace runtime ops page raw utility color tokens with semantic primitives: ${JSON.stringify(rawColorTokens)}`,
  );
});

test('runtime-ops top-level tabs do not render dot markers', () => {
  const pagePath = path.resolve('tools/gui-react/src/pages/runtime-ops/RuntimeOpsPage.tsx');
  const text = fs.readFileSync(pagePath, 'utf8');
  assert.equal(
    text.includes('w-1.5 h-1.5 rounded-full mr-1.5'),
    false,
    'remove dot marker spans from highest-level runtime-ops tabs',
  );
});

test('prefetch tab row keeps semantic idle tint cues for non-selected tabs', () => {
  const tabRowPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchTabRow.tsx');
  const text = fs.readFileSync(tabRowPath, 'utf8');
  const requiredSemanticTintClasses = [
    'sf-prefetch-tab-idle-success',
    'sf-prefetch-tab-idle-warning',
    'sf-prefetch-tab-idle-info',
    'sf-prefetch-tab-idle-accent',
  ];
  const missing = requiredSemanticTintClasses.filter((token) => !text.includes(token));
  assert.deepEqual(
    missing,
    [],
    `restore semantic idle tint cues on prefetch tabs: ${JSON.stringify(missing)}`,
  );
});

test('prefetch tab row keeps semantic colored marker dots', () => {
  const tabRowPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchTabRow.tsx');
  const text = fs.readFileSync(tabRowPath, 'utf8');
  const requiredMarkerClasses = [
    'sf-prefetch-dot-success',
    'sf-prefetch-dot-warning',
    'sf-prefetch-dot-info',
    'sf-prefetch-dot-accent',
  ];
  const missing = requiredMarkerClasses.filter((token) => !text.includes(token));
  assert.deepEqual(
    missing,
    [],
    `restore semantic prefetch marker dot classes: ${JSON.stringify(missing)}`,
  );
});

test('prefetch tab row uses button-style controls for readability', () => {
  const tabRowPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchTabRow.tsx');
  const text = fs.readFileSync(tabRowPath, 'utf8');
  assert.equal(
    text.includes('sf-prefetch-tab-button'),
    true,
    'use shared prefetch button primitive class on prefetch controls',
  );
  assert.equal(
    text.includes('rounded-t'),
    false,
    'remove tab-like rounded-t styling from prefetch controls',
  );
  assert.equal(
    text.includes('border-b-2'),
    false,
    'remove tab-strip bottom-border styling from prefetch controls',
  );
});

test('worker subtabs keep semantic colored marker dots', () => {
  const workerSubTabsPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/WorkerSubTabs.tsx');
  const text = fs.readFileSync(workerSubTabsPath, 'utf8');
  assert.equal(
    text.includes('poolDotClass(w.pool)'),
    true,
    'worker subtabs should use shared poolDotClass mapping for semantic dots',
  );
});

test('worker subtabs use soft pool tint when selected and white semantic border when idle', () => {
  const workerSubTabsPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/WorkerSubTabs.tsx');
  const workerSubTabsText = fs.readFileSync(workerSubTabsPath, 'utf8');
  const helpersPath = path.resolve('tools/gui-react/src/pages/runtime-ops/helpers.ts');
  const helpersText = fs.readFileSync(helpersPath, 'utf8');
  const requiredWorkerSubTabTokens = [
    'poolSelectedTabClass(w.pool)',
    'poolOutlineTabClass(w.pool)',
    'sf-prefetch-tab-selected',
  ];
  const missingWorkerSubTabTokens = requiredWorkerSubTabTokens.filter((token) => !workerSubTabsText.includes(token));
  assert.deepEqual(
    missingWorkerSubTabTokens,
    [],
    `worker subtabs should map selected/idle visual states via pool semantic helper classes: ${JSON.stringify(missingWorkerSubTabTokens)}`,
  );
  const requiredHelperTokens = [
    'export function poolSelectedTabClass(pool: string): string',
    'case \'search\':\n      return \'sf-prefetch-tab-idle-accent\';',
    'case \'fetch\':\n      return \'sf-prefetch-tab-idle-success\';',
    'case \'parse\':\n      return \'sf-prefetch-tab-idle-info\';',
    'case \'llm\':\n      return \'sf-prefetch-tab-idle-warning\';',
    'case \'index\':\n      return \'sf-prefetch-tab-idle-success\';',
    'default:\n      return \'sf-prefetch-tab-idle-neutral\';',
    'export function poolOutlineTabClass(pool: string): string',
    'case \'search\':\n      return \'sf-prefetch-tab-outline-accent\';',
    'case \'fetch\':\n      return \'sf-prefetch-tab-outline-success\';',
    'case \'parse\':\n      return \'sf-prefetch-tab-outline-info\';',
    'case \'llm\':\n      return \'sf-prefetch-tab-outline-warning\';',
    'case \'index\':\n      return \'sf-prefetch-tab-outline-success\';',
    'default:\n      return \'sf-prefetch-tab-outline-neutral\';',
  ];
  const missingHelperTokens = requiredHelperTokens.filter((token) => !helpersText.includes(token));
  assert.deepEqual(
    missingHelperTokens,
    [],
    `define semantic worker tab selected/outline mappings in shared runtime helpers: ${JSON.stringify(missingHelperTokens)}`,
  );
});

test('runtime-ops shared components avoid raw utility color classes', () => {
  const files = readComponentEntries();
  const offenders = files.reduce((acc, file) => {
    const rawColorTokens = [...new Set(file.text.match(RAW_COLOR_UTILITY_PATTERN) || [])].sort();
    if (rawColorTokens.length === 0) return acc;
    acc.push({
      file: path.relative(process.cwd(), file.path),
      tokens: rawColorTokens,
    });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `replace runtime-ops component raw utility color tokens with semantic primitives: ${JSON.stringify(offenders)}`,
  );
});

test('runtime-ops shared components avoid arbitrary micro text utilities', () => {
  const files = readComponentEntries();
  const offenders = files.reduce((acc, file) => {
    const matches = [...new Set(file.text.match(LEGACY_MICRO_TEXT_PATTERN) || [])].sort();
    if (matches.length === 0) return acc;
    acc.push({
      file: path.relative(process.cwd(), file.path),
      tokens: matches,
    });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `replace runtime-ops component micro text utilities with shared text primitives: ${JSON.stringify(offenders)}`,
  );
});

test('runtime-ops score bars use high-contrast metric fill classes', () => {
  const scoreBarPath = path.resolve('tools/gui-react/src/pages/runtime-ops/components/ScoreBar.tsx');
  const text = fs.readFileSync(scoreBarPath, 'utf8');
  const requiredClasses = [
    'sf-metric-fill-success',
    'sf-metric-fill-warning',
    'sf-metric-fill-danger',
    'sf-text-primary',
  ];
  const missing = requiredClasses.filter((token) => !text.includes(token));
  assert.deepEqual(
    missing,
    [],
    `use high-contrast metric fill classes for score bars: ${JSON.stringify(missing)}`,
  );
});

test('runtime-ops circle metrics use high-contrast ring classes', () => {
  const progressRingPath = path.resolve('tools/gui-react/src/pages/runtime-ops/components/ProgressRing.tsx');
  const progressRingText = fs.readFileSync(progressRingPath, 'utf8');
  const brandResolverPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchBrandResolverPanel.tsx');
  const brandResolverText = fs.readFileSync(brandResolverPath, 'utf8');
  const requiredRingClasses = [
    'sf-metric-ring-success',
    'sf-metric-ring-warning',
    'sf-metric-ring-danger',
  ];
  const progressMissing = requiredRingClasses.filter((token) => !progressRingText.includes(token));
  const brandMissing = requiredRingClasses.filter((token) => !brandResolverText.includes(token));
  assert.deepEqual(
    progressMissing,
    [],
    `use high-contrast ring classes in ProgressRing: ${JSON.stringify(progressMissing)}`,
  );
  assert.deepEqual(
    brandMissing,
    [],
    `use high-contrast ring classes in Brand Resolver confidence ring: ${JSON.stringify(brandMissing)}`,
  );
});

test('needset top unsatisfied needs show score as /100 with semantic badge color', () => {
  const needsetPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchNeedSetPanel.tsx');
  const text = fs.readFileSync(needsetPath, 'utf8');
  const requiredTokens = [
    'needScoreBadgeClass',
    '/100',
    'sf-chip-danger',
    'sf-chip-warning',
    'sf-chip-success',
    'if (score > 0) return \'sf-chip-danger\';',
  ];
  const missing = requiredTokens.filter((token) => !text.includes(token));
  assert.deepEqual(
    missing,
    [],
    `needset top score display should use /100 plus semantic badge color: ${JSON.stringify(missing)}`,
  );
  assert.equal(
    text.includes('if (score > 0) return \'sf-chip-info\';'),
    false,
    'needset low-score badge should not be info/blue when the bar is danger/red',
  );
});

test('runtime-ops pool colors are defined once and reused across workers and badges', () => {
  const helpersText = fs.readFileSync(RUNTIME_OPS_HELPERS_PATH, 'utf8');
  const workerSubTabsPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/WorkerSubTabs.tsx');
  const workerSubTabsText = fs.readFileSync(workerSubTabsPath, 'utf8');
  const requiredHelperTokens = [
    'export function poolDotClass(pool: string): string',
    'case \'search\':\n      return \'sf-dot-accent\';',
    'case \'fetch\':\n      return \'sf-dot-success\';',
    'case \'parse\':\n      return \'sf-dot-info\';',
    'case \'llm\':\n      return \'sf-dot-warning\';',
    'case \'search\':\n      return \'sf-chip-accent\';',
    'case \'fetch\':\n      return \'sf-chip-success\';',
    'case \'parse\':\n      return \'sf-chip-info\';',
    'case \'llm\':\n      return \'sf-chip-warning\';',
  ];
  const missingHelperTokens = requiredHelperTokens.filter((token) => !helpersText.includes(token));
  assert.deepEqual(
    missingHelperTokens,
    [],
    `define single pool semantic mapping in helpers: ${JSON.stringify(missingHelperTokens)}`,
  );
  assert.equal(
    workerSubTabsText.includes('poolDotClass('),
    true,
    'worker subtabs should use shared poolDotClass helper',
  );
});

test('runtime-ops helper modules avoid raw utility color classes', () => {
  const offenders = RUNTIME_OPS_HELPER_MODULE_PATHS.reduce((acc, helperPath) => {
    const text = fs.readFileSync(helperPath, 'utf8');
    const rawColorTokens = [...new Set(text.match(RAW_COLOR_UTILITY_PATTERN) || [])].sort();
    if (rawColorTokens.length === 0) return acc;
    acc.push({
      file: path.relative(process.cwd(), helperPath),
      tokens: rawColorTokens,
    });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `replace runtime-ops helper module raw utility color tokens with semantic primitives: ${JSON.stringify(offenders)}`,
  );
});

test('runtime-ops helpers define semantic mapping for pool meter fills and prefetch selected accents', () => {
  const helpersText = fs.readFileSync(RUNTIME_OPS_HELPERS_PATH, 'utf8');
  const requiredHelperTokens = [
    'export function poolMeterFillClass(pool: string): string',
    'case \'search\':\n      return \'sf-meter-fill\';',
    'case \'fetch\':\n      return \'sf-meter-fill-success\';',
    'case \'parse\':\n      return \'sf-meter-fill-info\';',
    'case \'llm\':\n      return \'sf-meter-fill-warning\';',
    'case \'index\':\n      return \'sf-meter-fill-success\';',
    'default:\n      return \'sf-meter-fill-neutral\';',
    'case \'needset\': return \'sf-prefetch-tab-selected-success\';',
    'case \'search_results\': return \'sf-prefetch-tab-selected-accent\';',
    'case \'query_journey\': return \'sf-prefetch-tab-selected-info\';',
    'case \'domain_classifier\': return \'sf-prefetch-tab-selected-warning\';',
    'default: return \'sf-prefetch-tab-selected-neutral\';',
  ];
  const missingHelperTokens = requiredHelperTokens.filter((token) => !helpersText.includes(token));
  assert.deepEqual(
    missingHelperTokens,
    [],
    `define semantic pool meter + prefetch selected accent mappings in helpers: ${JSON.stringify(missingHelperTokens)}`,
  );
});

test('runtime-ops metrics rail uses semantic pool meter fill helper', () => {
  const metricsRailPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/MetricsRail.tsx');
  const metricsRailText = fs.readFileSync(metricsRailPath, 'utf8');
  assert.equal(
    metricsRailText.includes('poolMeterFillClass(label)'),
    true,
    'metrics rail pool cards should map utilization bars through shared poolMeterFillClass helper',
  );
});

test('theme token success green is tuned for runtime readability', () => {
  const themePath = path.resolve('tools/gui-react/src/theme.css');
  const themeText = fs.readFileSync(themePath, 'utf8');
  assert.equal(
    themeText.includes('--sf-token-state-success-fg: #16a34a;'),
    true,
    'set runtime success foreground token to a brighter green for better visual parity',
  );
});

test('prefetch tabs use soft selected tint and white bordered idle state', () => {
  const themePath = path.resolve('tools/gui-react/src/theme.css');
  const themeText = fs.readFileSync(themePath, 'utf8');
  const prefetchTabRowPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchTabRow.tsx');
  const prefetchTabRowText = fs.readFileSync(prefetchTabRowPath, 'utf8');
  const classesWithNeutralBorders = [
    'sf-prefetch-tab-idle-success',
    'sf-prefetch-tab-idle-warning',
    'sf-prefetch-tab-idle-info',
    'sf-prefetch-tab-idle-accent',
    'sf-prefetch-tab-idle-neutral',
    'sf-prefetch-tab-outline-success',
    'sf-prefetch-tab-outline-warning',
    'sf-prefetch-tab-outline-info',
    'sf-prefetch-tab-outline-accent',
    'sf-prefetch-tab-outline-neutral',
  ];
  classesWithNeutralBorders.forEach((className) => {
    const blockMatch = themeText.match(new RegExp(`\\.${className}\\s*\\{([\\s\\S]*?)\\}`));
    assert.equal(blockMatch !== null, true, `missing ${className} in theme`);
    const block = blockMatch?.[1] ?? '';
    assert.match(
      block,
      /border-color:\s*rgb\(var\(--sf-color-border-subtle-rgb\)\s*\/\s*0\.42\);/,
      `${className} should use neutral border color`,
    );
  });
  assert.equal(
    themeText.includes('background: rgb(var(--sf-color-surface-elevated-rgb));'),
    true,
    'prefetch non-selected tabs should keep white/elevated surface background',
  );
  const selectedBlockMatch = themeText.match(/\.sf-prefetch-tab-selected\s*\{([\s\S]*?)\}/);
  assert.equal(selectedBlockMatch !== null, true, 'missing .sf-prefetch-tab-selected in theme');
  const selectedBlock = selectedBlockMatch?.[1] ?? '';
  assert.match(selectedBlock, /box-shadow:\s*none;/, 'selected prefetch tabs should not render blur/glow shadow');
  assert.equal(
    /inset\s+0\s+0\s+0\s+1px/.test(selectedBlock),
    false,
    'selected prefetch tabs should avoid inset glow effects',
  );
  assert.equal(
    prefetchTabRowText.includes('sf-prefetch-tab-selected ${t.idleClass}'),
    true,
    'selected prefetch buttons should reuse the prior soft semantic tint classes',
  );
  assert.equal(
    prefetchTabRowText.includes('outlineClass'),
    true,
    'prefetch tabs should define semantic outline classes for non-selected state',
  );
  assert.equal(
    prefetchTabRowText.includes('prefetchTabAccent('),
    false,
    'prefetch selected state should not rely on dedicated solid accent helper classes',
  );
});

test('theme token danger colors are red for metrics and error states', () => {
  const themePath = path.resolve('tools/gui-react/src/theme.css');
  const themeText = fs.readFileSync(themePath, 'utf8');
  const requiredTokens = [
    '--sf-token-state-error-fg: #dc2626;',
    '--sf-token-state-error-bg: rgba(220, 38, 38, 0.12);',
    '--sf-token-state-error-border: rgba(220, 38, 38, 0.32);',
    '--sf-token-state-error-fg: #f87171;',
    '--sf-token-state-error-bg: rgba(248, 113, 113, 0.2);',
    '--sf-token-state-error-border: rgba(248, 113, 113, 0.42);',
  ];
  const missing = requiredTokens.filter((token) => !themeText.includes(token));
  assert.deepEqual(
    missing,
    [],
    `use red danger tokens (not pink) for runtime metrics and error surfaces: ${JSON.stringify(missing)}`,
  );
});

test('prefetch and worker tabs hover only when non-selected and never glow', () => {
  const themePath = path.resolve('tools/gui-react/src/theme.css');
  const themeText = fs.readFileSync(themePath, 'utf8');
  const workerSubTabsPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/WorkerSubTabs.tsx');
  const workerSubTabsText = fs.readFileSync(workerSubTabsPath, 'utf8');

  assert.equal(
    workerSubTabsText.includes('sf-prefetch-tab-button'),
    true,
    'worker tab buttons should use the shared prefetch-tab button primitive so hover behavior matches prefetch tabs',
  );

  const hoverBlockMatch = themeText.match(/\.sf-prefetch-tab-button:not\(\.sf-prefetch-tab-selected\):hover\s*\{([\s\S]*?)\}/);
  assert.equal(hoverBlockMatch !== null, true, 'missing non-selected hover rule for prefetch/worker tab buttons');
  const hoverBlock = hoverBlockMatch?.[1] ?? '';
  assert.match(
    hoverBlock,
    /border-color:\s*rgb\(var\(--sf-color-border-subtle-rgb\)\s*\/\s*0\.62\);/,
    'non-selected hover state should increase border contrast on prefetch/worker tab buttons',
  );
  assert.match(
    hoverBlock,
    /background:\s*rgb\(var\(--sf-color-surface-elevated-rgb\)\);/,
    'non-selected hover state should raise prefetch/worker tab button background contrast',
  );
  assert.equal(
    /box-shadow:/.test(hoverBlock),
    false,
    'hover feedback should avoid blur/glow shadows',
  );

  assert.equal(
    themeText.includes('.sf-prefetch-tab-button.sf-prefetch-tab-selected:hover'),
    false,
    'selected prefetch/worker tabs should not change on hover',
  );
});

test('prefetch search results header toggles use solid-selected button controls', () => {
  const panelPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchSearchResultsPanel.tsx');
  const panelText = fs.readFileSync(panelPath, 'utf8');
  const requiredTokens = [
    'const [showSnippets, toggleSnippets, setShowSnippets] = usePersistedToggle(',
    'const [kanbanView, toggleKanbanView, setKanbanView] = usePersistedToggle(',
    'setKanbanView(false)',
    'setKanbanView(true)',
    'setShowSnippets(false)',
    'setShowSnippets(true)',
    'sf-primary-button',
    'sf-icon-button',
  ];
  const missing = requiredTokens.filter((token) => !panelText.includes(token));
  assert.deepEqual(
    missing,
    [],
    `search results view/snippet toggles should expose explicit selected buttons with solid selected styling: ${JSON.stringify(missing)}`,
  );
  assert.equal(
    panelText.includes('className="sf-text-caption sf-link-accent hover:underline"'),
    false,
    'search results header toggles should not use link-style controls',
  );
});

test('prefetch serp triage header toggles use solid-selected button controls', () => {
  const panelPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchSerpTriagePanel.tsx');
  const panelText = fs.readFileSync(panelPath, 'utf8');
  const requiredTokens = [
    'const [showScoreDecomposition, toggleScoreDecomposition, setShowScoreDecomposition] = usePersistedToggle(',
    'const [kanbanView, toggleKanbanView, setKanbanView] = usePersistedToggle(',
    'setKanbanView(false)',
    'setKanbanView(true)',
    'setShowScoreDecomposition(false)',
    'setShowScoreDecomposition(true)',
    'sf-primary-button',
    'sf-icon-button',
  ];
  const missing = requiredTokens.filter((token) => !panelText.includes(token));
  assert.deepEqual(
    missing,
    [],
    `serp triage view/score toggles should expose explicit selected buttons with solid selected styling: ${JSON.stringify(missing)}`,
  );
  assert.equal(
    panelText.includes('className="sf-text-caption sf-link-accent hover:underline"'),
    false,
    'serp triage header toggles should not use link-style controls',
  );
});

test('prefetch url predictor header toggles use solid-selected button controls', () => {
  const panelPath = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchUrlPredictorPanel.tsx');
  const panelText = fs.readFileSync(panelPath, 'utf8');
  const requiredTokens = [
    'const [viewMode, toggleViewMode, setViewMode] = usePersistedToggle(',
    'setViewMode(false)',
    'setViewMode(true)',
    'sf-primary-button',
    'sf-icon-button',
  ];
  const missing = requiredTokens.filter((token) => !panelText.includes(token));
  assert.deepEqual(
    missing,
    [],
    `url predictor view toggle should expose explicit selected buttons with solid selected styling: ${JSON.stringify(missing)}`,
  );
});

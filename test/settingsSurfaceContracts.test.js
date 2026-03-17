import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

async function loadSettingsSurfaceModules() {
  return Promise.all([
    loadBundledModule(
      'tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftNormalization.ts',
      { prefix: 'settings-surface-runtime-flow-' },
    ),
    loadBundledModule(
      'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsAuthorityHelpers.ts',
      { prefix: 'settings-surface-runtime-authority-' },
    ),
    loadBundledModule(
      'tools/gui-react/src/stores/settingsManifest.ts',
      { prefix: 'settings-surface-manifest-' },
    ),
  ]);
}

test('settings surface normalizes cached runtime settings through the public GUI contract', async () => {
  const [
    { normalizeRuntimeDraft, RUNTIME_NUMBER_BOUNDS },
    {
      RUNTIME_SETTINGS_QUERY_KEY,
      RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS,
      readRuntimeSettingsNumericBaseline,
      readRuntimeSettingsSnapshot,
      readRuntimeSettingsBootstrap,
    },
    { RUNTIME_SETTING_DEFAULTS },
  ] = await loadSettingsSurfaceModules();

  const cachedRuntimeSettings = {
    searchProvider: 'none',
    helperFilesRoot: 'helper-root-canonical',
    fetchConcurrency: 9999,
    discardMe: { nested: true },
  };
  const queryClient = {
    getQueryData(queryKey) {
      assert.deepEqual(queryKey, RUNTIME_SETTINGS_QUERY_KEY);
      return cachedRuntimeSettings;
    },
  };

  const snapshot = readRuntimeSettingsSnapshot(queryClient);
  assert.deepEqual(snapshot, {
    searchProvider: 'none',
    helperFilesRoot: 'helper-root-canonical',
    fetchConcurrency: 9999,
  });

  const bootstrap = readRuntimeSettingsBootstrap(queryClient, RUNTIME_SETTING_DEFAULTS);
  assert.equal(bootstrap.helperFilesRoot, 'helper-root-canonical');
  assert.equal(bootstrap.maxRunSeconds, RUNTIME_SETTING_DEFAULTS.maxRunSeconds);

  const numericBaseline = readRuntimeSettingsNumericBaseline(
    snapshot,
    RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS,
  );
  assert.equal(numericBaseline.fetchConcurrency, 9999);

  const normalized = normalizeRuntimeDraft(snapshot, RUNTIME_SETTING_DEFAULTS);
  assert.equal(normalized.helperFilesRoot, 'helper-root-canonical');
  assert.equal(normalized.categoryAuthorityRoot, 'helper-root-canonical');
  assert.equal(normalized.searchProvider, RUNTIME_SETTING_DEFAULTS.searchProvider);
  assert.equal(
    normalized.fetchConcurrency,
    RUNTIME_NUMBER_BOUNDS.fetchConcurrency.max,
  );
});

test('settings manifest surface keeps concrete option defaults and labels aligned', async () => {
  const [, , settingsManifest] = await loadSettingsSurfaceModules();
  const {
    CONVERGENCE_KNOB_GROUPS,
    LLM_ROUTE_PRESET_LIMITS,
    LLM_SETTING_LIMITS,
    RUNTIME_OCR_BACKEND_OPTIONS,
    RUNTIME_REPAIR_DEDUPE_RULE_OPTIONS,
    RUNTIME_RESUME_MODE_OPTIONS,
    RUNTIME_SEARCH_PROVIDER_OPTIONS,
    RUNTIME_SETTING_DEFAULTS,
    SETTINGS_AUTOSAVE_DEBOUNCE_MS,
    SETTINGS_AUTOSAVE_STATUS_MS,
    STORAGE_DESTINATION_OPTIONS,
    STORAGE_SETTING_DEFAULTS,
    formatRuntimeSearchProviderLabel,
  } = settingsManifest;

  assert.deepEqual(
    [...RUNTIME_SEARCH_PROVIDER_OPTIONS].sort(),
    ['bing', 'dual', 'google', 'searxng'],
  );

  const providerLabelCases = [
    ['searxng', 'SearXNG Meta Search'],
    ['bing', 'Bing Lane via SearXNG'],
    ['google', 'Google Lane via SearXNG'],
    ['dual', 'Dual Lanes via SearXNG'],
    ['none', ''],
  ];
  for (const [provider, expectedLabel] of providerLabelCases) {
    assert.equal(formatRuntimeSearchProviderLabel(provider), expectedLabel);
  }

  const runtimeDefaultOptionSets = [
    [RUNTIME_SEARCH_PROVIDER_OPTIONS, RUNTIME_SETTING_DEFAULTS.searchProvider, 'searchProvider'],
    [RUNTIME_RESUME_MODE_OPTIONS, RUNTIME_SETTING_DEFAULTS.resumeMode, 'resumeMode'],
    [RUNTIME_OCR_BACKEND_OPTIONS, RUNTIME_SETTING_DEFAULTS.scannedPdfOcrBackend, 'scannedPdfOcrBackend'],
    [RUNTIME_REPAIR_DEDUPE_RULE_OPTIONS, RUNTIME_SETTING_DEFAULTS.repairDedupeRule, 'repairDedupeRule'],
  ];
  for (const [options, defaultValue, label] of runtimeDefaultOptionSets) {
    assert.equal(
      options.includes(defaultValue),
      true,
      `${label} default should stay selectable through the manifest contract`,
    );
  }

  assert.equal(
    CONVERGENCE_KNOB_GROUPS.some((group) =>
      group.knobs.some((knob) => knob.key === 'serpTriageMaxUrls')),
    true,
  );
  assert.equal(LLM_SETTING_LIMITS.maxTokens.max > LLM_SETTING_LIMITS.maxTokens.min, true);
  assert.equal(LLM_ROUTE_PRESET_LIMITS.deep.enableWebsearch, true);
  assert.equal(
    STORAGE_DESTINATION_OPTIONS.includes(STORAGE_SETTING_DEFAULTS.destinationType),
    true,
  );
  assert.equal(
    Object.values(SETTINGS_AUTOSAVE_DEBOUNCE_MS).every((value) => typeof value === 'number' && value > 0),
    true,
  );
  assert.equal(
    Object.values(SETTINGS_AUTOSAVE_STATUS_MS).every((value) => typeof value === 'number' && value > 0),
    true,
  );
});

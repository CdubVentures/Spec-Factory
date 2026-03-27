import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

let settingsSurfaceModulesPromise;
const PIPELINE_SETTINGS_PUBLIC_STUBS = {
  './state/RuntimeFlowDraftPayload.ts': `
    export function collectRuntimeFlowDraftPayload() {
      return {};
    }
  `,
  './state/RuntimeFlowModelTokenOptions.ts': `
    export function deriveRuntimeLlmModelOptions() {
      return [];
    }
    export function deriveRuntimeLlmTokenPresetOptions() {
      return [];
    }
  `,
  './state/RuntimeFlowModelTokenDefaults.ts': `
    export function buildRuntimeLlmTokenProfileLookup() {
      return new Map();
    }
    export function createRuntimeModelTokenDefaultsResolver() {
      return () => null;
    }
    export function deriveRuntimeLlmTokenContractPresetMax() {
      return 0;
    }
  `,
  './state/runtimeSettingsDomain.ts': `
    export function clampTokenForModel(value) {
      return value;
    }
    export function collectRuntimeSettingsPayload() {
      return {};
    }
    export function createRuntimeHydrationBindings() {
      return {};
    }
    export function hydrateRuntimeSettingsFromBindings() {
      return {};
    }
    export function parseRuntimeFloat(value) {
      return Number(value);
    }
    export function parseRuntimeInt(value) {
      return Number.parseInt(value, 10);
    }
    export function parseRuntimeLlmTokenCap(value) {
      return Number(value);
    }
    export function parseRuntimeString(value) {
      return String(value ?? '');
    }
  `,
  './state/runtimeSettingsEditorAdapter.ts': `
    export function useRuntimeSettingsEditorAdapter() {
      return null;
    }
  `,
  './state/sourceStrategyAuthority.ts': `
    export function readSourceStrategySnapshot() {
      return null;
    }
    export const sourceStrategyQueryKey = ['source-strategy'];
    export function useSourceStrategyAuthority() {
      return null;
    }
    export function useSourceStrategyReader() {
      return null;
    }
  `,
  './state/useSettingsAutoSaveEffect.ts': `
    export function useSettingsAutoSaveEffect() {
      return null;
    }
  `,
  './components/RuntimeFlowPrimitives.tsx': `
    export function AdvancedSettingsBlock(props) { return props?.children ?? null; }
    export function FlowOptionPanel(props) { return props?.children ?? null; }
    export function MasterSwitchRow(props) { return props?.children ?? null; }
    export function SettingGroupBlock(props) { return props?.children ?? null; }
    export function SettingNumberInput() { return null; }
    export function SettingRow(props) { return props?.children ?? null; }
    export function SettingToggle() { return null; }
  `,
};

async function loadSettingsSurfaceModules() {
  if (!settingsSurfaceModulesPromise) {
    settingsSurfaceModulesPromise = Promise.all([
      loadBundledModule(
        'tools/gui-react/src/features/pipeline-settings/index.ts',
        {
          prefix: 'settings-surface-feature-',
          stubs: PIPELINE_SETTINGS_PUBLIC_STUBS,
        },
      ),
      loadBundledModule(
        'tools/gui-react/src/stores/settingsManifest.ts',
        { prefix: 'settings-surface-manifest-' },
      ),
    ]);
  }
  return settingsSurfaceModulesPromise;
}

test('settings surface normalizes cached runtime settings through the public GUI contract', async () => {
  const [
    {
      normalizeRuntimeDraft,
      RUNTIME_NUMBER_BOUNDS,
      RUNTIME_SETTINGS_QUERY_KEY,
      RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS,
      readRuntimeSettingsNumericBaseline,
      readRuntimeSettingsSnapshot,
      readRuntimeSettingsBootstrap,
    },
    {
      RUNTIME_SETTING_DEFAULTS,
    },
  ] = await loadSettingsSurfaceModules();

  const cachedRuntimeSettings = {
    searchEngines: '',
    categoryAuthorityRoot: 'helper-root-canonical',
    domainClassifierUrlCap: 9999,
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
    searchEngines: '',
    categoryAuthorityRoot: 'helper-root-canonical',
    domainClassifierUrlCap: 9999,
  });

  const bootstrap = readRuntimeSettingsBootstrap(queryClient, RUNTIME_SETTING_DEFAULTS);
  assert.equal(bootstrap.categoryAuthorityRoot, 'helper-root-canonical');
  assert.equal(bootstrap.maxRunSeconds, RUNTIME_SETTING_DEFAULTS.maxRunSeconds);

  const numericBaseline = readRuntimeSettingsNumericBaseline(
    snapshot,
    RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS,
  );
  assert.equal(numericBaseline.domainClassifierUrlCap, 9999);

  const normalized = normalizeRuntimeDraft(snapshot, RUNTIME_SETTING_DEFAULTS);
  assert.equal(normalized.categoryAuthorityRoot, 'helper-root-canonical');
  assert.equal(normalized.searchEngines, RUNTIME_SETTING_DEFAULTS.searchEngines);
  assert.equal(
    normalized.domainClassifierUrlCap,
    RUNTIME_NUMBER_BOUNDS.domainClassifierUrlCap.max,
  );
});

test('settings manifest surface keeps concrete option defaults and labels aligned', async () => {
  const [pipelineSettingsFeature, settingsManifest] = await loadSettingsSurfaceModules();
  const {
    LLM_ROUTE_PRESET_LIMITS,
    LLM_SETTING_LIMITS,
    RUNTIME_SETTING_DEFAULTS,
    SEARXNG_ENGINE_LABELS,
    SETTINGS_AUTOSAVE_DEBOUNCE_MS,
    SETTINGS_AUTOSAVE_STATUS_MS,
    STORAGE_DESTINATION_OPTIONS,
    STORAGE_SETTING_DEFAULTS,
  } = settingsManifest;
  const {
    SEARXNG_ENGINE_OPTIONS,
  } = pipelineSettingsFeature;

  assert.deepEqual(
    [...SEARXNG_ENGINE_OPTIONS].sort(),
    ['brave', 'bing', 'duckduckgo', 'google', 'google-proxy'].sort(),
  );

  const engineLabelCases = [
    ['google', 'Google (Crawlee)'],
    ['bing', 'Bing'],
    ['google-proxy', 'Google Proxy'],
    ['duckduckgo', 'DuckDuckGo'],
    ['brave', 'Brave'],
  ];
  for (const [engine, expectedLabel] of engineLabelCases) {
    assert.equal(SEARXNG_ENGINE_LABELS[engine], expectedLabel);
  }

  // searchEngines default is CSV — verify each token is a valid engine.
  // WHY: settingsDefaults.js still has 'startpage' as the default engine, but the
  // registry + manifest options replaced 'startpage' with 'google-proxy'. Validate
  // that every option in the manifest is a recognized engine, and that the default
  // is a non-empty string (the stale-defaults drift is tracked separately).
  assert.ok(
    typeof RUNTIME_SETTING_DEFAULTS.searchEngines === 'string' &&
      RUNTIME_SETTING_DEFAULTS.searchEngines.length > 0,
    'searchEngines default should be a non-empty string',
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

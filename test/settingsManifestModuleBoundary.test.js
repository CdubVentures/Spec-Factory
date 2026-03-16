import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

test('settings manifest exports are sourced from dedicated manifest modules', async () => {
  const {
    settingsManifest,
    convergenceManifest,
    runtimeManifest,
    llmManifest,
    storageUiManifest,
  } = await loadBundledModule(
    'test/fixtures/settingsManifestModuleBoundary.entry.ts',
    { prefix: 'settings-manifest-boundary-' },
  );

  assert.strictEqual(settingsManifest.CONVERGENCE_KNOB_GROUPS, convergenceManifest.CONVERGENCE_KNOB_GROUPS);
  assert.strictEqual(settingsManifest.CONVERGENCE_SETTING_DEFAULTS, convergenceManifest.CONVERGENCE_SETTING_DEFAULTS);

  assert.strictEqual(settingsManifest.RUNTIME_PROFILE_OPTIONS, runtimeManifest.RUNTIME_PROFILE_OPTIONS);
  assert.strictEqual(settingsManifest.RUNTIME_SEARCH_PROVIDER_OPTIONS, runtimeManifest.RUNTIME_SEARCH_PROVIDER_OPTIONS);
  assert.strictEqual(settingsManifest.RUNTIME_SEARCH_ROUTE_HELP_TEXT, runtimeManifest.RUNTIME_SEARCH_ROUTE_HELP_TEXT);
  assert.strictEqual(settingsManifest.RUNTIME_SEARCH_PROVIDER_LABELS, runtimeManifest.RUNTIME_SEARCH_PROVIDER_LABELS);
  assert.strictEqual(settingsManifest.formatRuntimeSearchProviderLabel, runtimeManifest.formatRuntimeSearchProviderLabel);
  assert.strictEqual(settingsManifest.RUNTIME_RESUME_MODE_OPTIONS, runtimeManifest.RUNTIME_RESUME_MODE_OPTIONS);
  assert.strictEqual(settingsManifest.RUNTIME_OCR_BACKEND_OPTIONS, runtimeManifest.RUNTIME_OCR_BACKEND_OPTIONS);
  assert.strictEqual(settingsManifest.RUNTIME_REPAIR_DEDUPE_RULE_OPTIONS, runtimeManifest.RUNTIME_REPAIR_DEDUPE_RULE_OPTIONS);
  assert.strictEqual(
    settingsManifest.RUNTIME_AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS,
    runtimeManifest.RUNTIME_AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS,
  );
  assert.strictEqual(settingsManifest.RUNTIME_SETTING_DEFAULTS, runtimeManifest.RUNTIME_SETTING_DEFAULTS);

  assert.strictEqual(settingsManifest.LLM_SETTING_LIMITS, llmManifest.LLM_SETTING_LIMITS);
  assert.strictEqual(settingsManifest.LLM_ROUTE_PRESET_LIMITS, llmManifest.LLM_ROUTE_PRESET_LIMITS);

  assert.strictEqual(settingsManifest.STORAGE_SETTING_DEFAULTS, storageUiManifest.STORAGE_SETTING_DEFAULTS);
  assert.strictEqual(settingsManifest.STORAGE_DESTINATION_OPTIONS, storageUiManifest.STORAGE_DESTINATION_OPTIONS);
  assert.strictEqual(settingsManifest.UI_SETTING_DEFAULTS, storageUiManifest.UI_SETTING_DEFAULTS);
  assert.strictEqual(settingsManifest.SETTINGS_AUTOSAVE_DEBOUNCE_MS, storageUiManifest.SETTINGS_AUTOSAVE_DEBOUNCE_MS);
  assert.strictEqual(settingsManifest.SETTINGS_AUTOSAVE_STATUS_MS, storageUiManifest.SETTINGS_AUTOSAVE_STATUS_MS);
});

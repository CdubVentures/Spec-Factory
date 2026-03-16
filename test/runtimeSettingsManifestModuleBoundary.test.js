import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

test('runtime settings manifest exports are sourced from dedicated option/default modules', async () => {
  const {
    runtimeSettingsManifest,
    runtimeSettingsOptions,
    runtimeSettingsDefaults,
  } = await loadBundledModule(
    'test/fixtures/runtimeSettingsManifestModuleBoundary.entry.ts',
    { prefix: 'runtime-settings-manifest-boundary-' },
  );

  assert.strictEqual(runtimeSettingsManifest.RUNTIME_PROFILE_OPTIONS, runtimeSettingsOptions.RUNTIME_PROFILE_OPTIONS);
  assert.strictEqual(
    runtimeSettingsManifest.RUNTIME_SEARCH_PROVIDER_OPTIONS,
    runtimeSettingsOptions.RUNTIME_SEARCH_PROVIDER_OPTIONS,
  );
  assert.strictEqual(
    runtimeSettingsManifest.RUNTIME_SEARCH_ROUTE_HELP_TEXT,
    runtimeSettingsOptions.RUNTIME_SEARCH_ROUTE_HELP_TEXT,
  );
  assert.strictEqual(
    runtimeSettingsManifest.RUNTIME_SEARCH_PROVIDER_LABELS,
    runtimeSettingsOptions.RUNTIME_SEARCH_PROVIDER_LABELS,
  );
  assert.strictEqual(
    runtimeSettingsManifest.formatRuntimeSearchProviderLabel,
    runtimeSettingsOptions.formatRuntimeSearchProviderLabel,
  );
  assert.strictEqual(
    runtimeSettingsManifest.RUNTIME_RESUME_MODE_OPTIONS,
    runtimeSettingsOptions.RUNTIME_RESUME_MODE_OPTIONS,
  );
  assert.strictEqual(
    runtimeSettingsManifest.RUNTIME_OCR_BACKEND_OPTIONS,
    runtimeSettingsOptions.RUNTIME_OCR_BACKEND_OPTIONS,
  );
  assert.strictEqual(
    runtimeSettingsManifest.RUNTIME_REPAIR_DEDUPE_RULE_OPTIONS,
    runtimeSettingsOptions.RUNTIME_REPAIR_DEDUPE_RULE_OPTIONS,
  );
  assert.strictEqual(
    runtimeSettingsManifest.RUNTIME_AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS,
    runtimeSettingsOptions.RUNTIME_AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS,
  );
  assert.strictEqual(runtimeSettingsManifest.RUNTIME_SETTING_DEFAULTS, runtimeSettingsDefaults.RUNTIME_SETTING_DEFAULTS);
});

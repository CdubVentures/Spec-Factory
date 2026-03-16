import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

test('runtime settings authority exports are sourced from dedicated helper and hook modules', async () => {
  const {
    runtimeSettingsAuthority,
    runtimeSettingsAuthorityHelpers,
    runtimeSettingsAuthorityHooks,
  } = await loadBundledModule(
    'test/fixtures/runtimeSettingsAuthorityModuleBoundary.entry.ts',
    { prefix: 'runtime-settings-authority-boundary-' },
  );

  assert.strictEqual(
    runtimeSettingsAuthority.RUNTIME_SETTINGS_QUERY_KEY,
    runtimeSettingsAuthorityHelpers.RUNTIME_SETTINGS_QUERY_KEY,
  );
  assert.strictEqual(
    runtimeSettingsAuthority.RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS,
    runtimeSettingsAuthorityHelpers.RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS,
  );
  assert.strictEqual(
    runtimeSettingsAuthority.readRuntimeSettingsNumericBaseline,
    runtimeSettingsAuthorityHelpers.readRuntimeSettingsNumericBaseline,
  );
  assert.strictEqual(
    runtimeSettingsAuthority.runtimeSettingsNumericBaselineEqual,
    runtimeSettingsAuthorityHelpers.runtimeSettingsNumericBaselineEqual,
  );
  assert.strictEqual(
    runtimeSettingsAuthority.readRuntimeSettingsSnapshot,
    runtimeSettingsAuthorityHelpers.readRuntimeSettingsSnapshot,
  );
  assert.strictEqual(
    runtimeSettingsAuthority.readRuntimeSettingsBootstrap,
    runtimeSettingsAuthorityHelpers.readRuntimeSettingsBootstrap,
  );
  assert.strictEqual(
    runtimeSettingsAuthority.useRuntimeSettingsReader,
    runtimeSettingsAuthorityHooks.useRuntimeSettingsReader,
  );
  assert.strictEqual(
    runtimeSettingsAuthority.useRuntimeSettingsBootstrap,
    runtimeSettingsAuthorityHooks.useRuntimeSettingsBootstrap,
  );
  assert.strictEqual(
    runtimeSettingsAuthority.useRuntimeSettingsAuthority,
    runtimeSettingsAuthorityHooks.useRuntimeSettingsAuthority,
  );
});

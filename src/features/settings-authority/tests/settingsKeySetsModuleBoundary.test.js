import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RUNTIME_SETTINGS_KEYS as settingsRuntimeKeys,
  CONVERGENCE_SETTINGS_KEYS as settingsConvergenceKeys,
  UI_SETTINGS_KEYS as settingsUiKeys,
} from '../settingsContract.js';
import {
  RUNTIME_SETTINGS_KEYS as keysetRuntimeKeys,
  CONVERGENCE_SETTINGS_KEYS as keysetConvergenceKeys,
  UI_SETTINGS_KEYS as keysetUiKeys,
} from '../settingsKeySets.js';

test('settings contract key arrays are sourced from the settings key-sets module', () => {
  assert.equal(settingsRuntimeKeys, keysetRuntimeKeys);
  assert.equal(settingsConvergenceKeys, keysetConvergenceKeys);
  assert.equal(settingsUiKeys, keysetUiKeys);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UI_SETTINGS_VALUE_TYPES as settingsUiValueTypes,
  STORAGE_SETTINGS_VALUE_TYPES as settingsStorageValueTypes,
} from '../src/features/settings-authority/settingsContract.js';
import {
  UI_SETTINGS_VALUE_TYPES as valueModuleUiValueTypes,
  STORAGE_SETTINGS_VALUE_TYPES as valueModuleStorageValueTypes,
} from '../src/features/settings-authority/settingsValueTypes.js';

test('settings contract UI/storage value-type maps are sourced from the settings value-types module', () => {
  assert.equal(settingsUiValueTypes, valueModuleUiValueTypes);
  assert.equal(settingsStorageValueTypes, valueModuleStorageValueTypes);
});

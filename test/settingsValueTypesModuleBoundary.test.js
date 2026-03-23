import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  UI_SETTINGS_VALUE_TYPES as settingsUiValueTypes,
  STORAGE_SETTINGS_VALUE_TYPES as settingsStorageValueTypes,
} from '../src/features/settings-authority/settingsContract.js';
import {
  UI_SETTINGS_VALUE_TYPES as valueModuleUiValueTypes,
  STORAGE_SETTINGS_VALUE_TYPES as valueModuleStorageValueTypes,
} from '../src/features/settings-authority/settingsValueTypes.js';

describe('settings value-type maps module boundary', () => {
  it('settings contract UI/storage value-type maps are sourced from the settings value-types module', () => {
    assert.equal(settingsUiValueTypes, valueModuleUiValueTypes);
    assert.equal(settingsStorageValueTypes, valueModuleStorageValueTypes);
  });

  it('UI_SETTINGS_VALUE_TYPES has exact golden-master shape', () => {
    assert.deepStrictEqual({ ...valueModuleUiValueTypes }, {
      studioAutoSaveAllEnabled: 'boolean',
      studioAutoSaveEnabled: 'boolean',
      studioAutoSaveMapEnabled: 'boolean',
      runtimeAutoSaveEnabled: 'boolean',
      storageAutoSaveEnabled: 'boolean',
    });
  });

  it('STORAGE_SETTINGS_VALUE_TYPES has exact golden-master shape', () => {
    assert.deepStrictEqual({ ...valueModuleStorageValueTypes }, {
      enabled: 'boolean',
      destinationType: 'string',
      localDirectory: 'string',
      awsRegion: 'string',
      s3Bucket: 'string',
      s3Prefix: 'string',
      s3AccessKeyId: 'string',
      s3SecretAccessKey: 'string',
      s3SessionToken: 'string',
      updatedAt: 'string_or_null',
    });
  });
});

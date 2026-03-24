// WHY: Golden-master characterization tests locking down current UI settings
// shape BEFORE migrating to registry-driven derivation.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SETTINGS_DEFAULTS } from '../settingsDefaults.js';

describe('UI settings characterization (golden master)', () => {
  it('SETTINGS_DEFAULTS.ui has exact shape', () => {
    assert.deepStrictEqual({ ...SETTINGS_DEFAULTS.ui }, {
      studioAutoSaveAllEnabled: false,
      studioAutoSaveEnabled: true,
      studioAutoSaveMapEnabled: true,
      runtimeAutoSaveEnabled: true,
      storageAutoSaveEnabled: false,
    });
  });

  it('all ui setting values are booleans', () => {
    for (const [key, value] of Object.entries(SETTINGS_DEFAULTS.ui)) {
      assert.equal(typeof value, 'boolean', `${key} should be boolean, got ${typeof value}`);
    }
  });

  it('has exactly 5 keys', () => {
    assert.equal(Object.keys(SETTINGS_DEFAULTS.ui).length, 5);
  });
});

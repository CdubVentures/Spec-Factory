import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SETTINGS_DEFAULTS } from '../settingsDefaults.js';

const REQUIRED_UI_KEYS = {
  studioAutoSaveAllEnabled: false,
  studioAutoSaveEnabled: true,
  studioAutoSaveMapEnabled: true,
  runtimeAutoSaveEnabled: true,
  storageAutoSaveEnabled: false,
};

describe('UI settings contract', () => {
  it('publishes the required UI settings with their current defaults', () => {
    for (const [key, expectedValue] of Object.entries(REQUIRED_UI_KEYS)) {
      assert.equal(SETTINGS_DEFAULTS.ui[key], expectedValue, `unexpected default for ${key}`);
    }
  });

  it('keeps all published UI setting values boolean', () => {
    for (const [key, value] of Object.entries(SETTINGS_DEFAULTS.ui)) {
      assert.equal(typeof value, 'boolean', `${key} should be boolean, got ${typeof value}`);
    }
  });
});

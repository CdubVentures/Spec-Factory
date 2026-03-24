// WHY: Contract tests for UI registry derivation functions.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { UI_SETTINGS_REGISTRY } from '../settingsRegistry.js';
import {
  deriveUiDefaults,
  deriveUiValueTypes,
  deriveUiMutableKeys,
} from '../settingsRegistryDerivations.js';

describe('UI registry derivations', () => {
  describe('deriveUiDefaults', () => {
    it('produces exact match with golden master', () => {
      assert.deepStrictEqual(
        deriveUiDefaults(UI_SETTINGS_REGISTRY),
        {
          studioAutoSaveAllEnabled: false,
          studioAutoSaveEnabled: true,
          studioAutoSaveMapEnabled: true,
          runtimeAutoSaveEnabled: true,
          storageAutoSaveEnabled: false,
        },
      );
    });

    it('returns empty object for empty registry', () => {
      assert.deepStrictEqual(deriveUiDefaults([]), {});
    });
  });

  describe('deriveUiValueTypes', () => {
    it('produces exact match with golden master', () => {
      assert.deepStrictEqual(
        deriveUiValueTypes(UI_SETTINGS_REGISTRY),
        {
          studioAutoSaveAllEnabled: 'boolean',
          studioAutoSaveEnabled: 'boolean',
          studioAutoSaveMapEnabled: 'boolean',
          runtimeAutoSaveEnabled: 'boolean',
          storageAutoSaveEnabled: 'boolean',
        },
      );
    });

    it('handles mixed types', () => {
      const mixed = [
        { key: 'a', type: 'bool', default: false },
        { key: 'b', type: 'int', default: 5 },
        { key: 'c', type: 'string', default: '' },
      ];
      assert.deepStrictEqual(deriveUiValueTypes(mixed), {
        a: 'boolean',
        b: 'integer',
        c: 'string',
      });
    });

    it('returns empty object for empty registry', () => {
      assert.deepStrictEqual(deriveUiValueTypes([]), {});
    });
  });

  describe('deriveUiMutableKeys', () => {
    it('produces exact match with golden master', () => {
      assert.deepStrictEqual(
        deriveUiMutableKeys(UI_SETTINGS_REGISTRY),
        [
          'studioAutoSaveAllEnabled',
          'studioAutoSaveEnabled',
          'studioAutoSaveMapEnabled',
          'runtimeAutoSaveEnabled',
          'storageAutoSaveEnabled',
        ],
      );
    });

    it('excludes non-mutable entries', () => {
      const mixed = [
        { key: 'a', type: 'bool', default: false, mutable: true },
        { key: 'b', type: 'bool', default: false },
        { key: 'c', type: 'bool', default: false, mutable: true },
      ];
      assert.deepStrictEqual(deriveUiMutableKeys(mixed), ['a', 'c']);
    });

    it('returns empty array for empty registry', () => {
      assert.deepStrictEqual(deriveUiMutableKeys([]), []);
    });
  });
});

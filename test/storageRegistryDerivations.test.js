// WHY: Contract tests for storage registry derivation functions.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { STORAGE_SETTINGS_REGISTRY } from '../src/shared/settingsRegistry.js';
import {
  deriveStorageDefaults,
  deriveStorageOptionValues,
  deriveStorageMutableKeys,
  deriveStorageValueTypes,
  deriveStorageCanonicalKeys,
  deriveStorageSecretPresenceMap,
  deriveStorageClearFlags,
} from '../src/shared/settingsRegistryDerivations.js';

describe('storage registry derivations', () => {
  describe('deriveStorageDefaults', () => {
    it('produces exact match with golden master (secrets excluded)', () => {
      assert.deepStrictEqual(
        deriveStorageDefaults(STORAGE_SETTINGS_REGISTRY),
        {
          enabled: false,
          destinationType: 'local',
          localDirectory: '',
          awsRegion: 'us-east-2',
          s3Bucket: '',
          s3Prefix: 'spec-factory-runs',
          s3AccessKeyId: '',
        },
      );
    });

    it('excludes secret fields from defaults', () => {
      const defaults = deriveStorageDefaults(STORAGE_SETTINGS_REGISTRY);
      assert.equal(Object.hasOwn(defaults, 's3SecretAccessKey'), false);
      assert.equal(Object.hasOwn(defaults, 's3SessionToken'), false);
    });

    it('excludes computed fields from defaults', () => {
      const defaults = deriveStorageDefaults(STORAGE_SETTINGS_REGISTRY);
      assert.equal(Object.hasOwn(defaults, 'updatedAt'), false);
    });

    it('returns empty object for empty registry', () => {
      assert.deepStrictEqual(deriveStorageDefaults([]), {});
    });
  });

  describe('deriveStorageOptionValues', () => {
    it('produces exact match with golden master', () => {
      const options = deriveStorageOptionValues(STORAGE_SETTINGS_REGISTRY);
      assert.deepStrictEqual(options, {
        destinationType: ['local', 's3'],
      });
    });

    it('returns empty object for empty registry', () => {
      assert.deepStrictEqual(deriveStorageOptionValues([]), {});
    });
  });

  describe('deriveStorageMutableKeys', () => {
    it('includes all mutable keys plus clear flags', () => {
      const keys = deriveStorageMutableKeys(STORAGE_SETTINGS_REGISTRY);
      assert.deepStrictEqual(keys, [
        'enabled',
        'destinationType',
        'localDirectory',
        'awsRegion',
        's3Bucket',
        's3Prefix',
        's3AccessKeyId',
        's3SecretAccessKey',
        's3SessionToken',
        'clearS3SecretAccessKey',
        'clearS3SessionToken',
      ]);
    });

    it('returns empty array for empty registry', () => {
      assert.deepStrictEqual(deriveStorageMutableKeys([]), []);
    });
  });

  describe('deriveStorageValueTypes', () => {
    it('produces exact match with golden master', () => {
      assert.deepStrictEqual(
        { ...deriveStorageValueTypes(STORAGE_SETTINGS_REGISTRY) },
        {
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
        },
      );
    });

    it('updatedAt appears in value types but not in defaults', () => {
      const types = deriveStorageValueTypes(STORAGE_SETTINGS_REGISTRY);
      const defaults = deriveStorageDefaults(STORAGE_SETTINGS_REGISTRY);
      assert.equal(Object.hasOwn(types, 'updatedAt'), true);
      assert.equal(Object.hasOwn(defaults, 'updatedAt'), false);
    });

    it('returns empty object for empty registry', () => {
      assert.deepStrictEqual(deriveStorageValueTypes([]), {});
    });
  });

  describe('deriveStorageCanonicalKeys', () => {
    it('produces all 10 registry keys in order', () => {
      assert.deepStrictEqual(
        deriveStorageCanonicalKeys(STORAGE_SETTINGS_REGISTRY),
        [
          'enabled', 'destinationType', 'localDirectory', 'awsRegion',
          's3Bucket', 's3Prefix', 's3AccessKeyId',
          's3SecretAccessKey', 's3SessionToken', 'updatedAt',
        ],
      );
    });

    it('returns empty array for empty registry', () => {
      assert.deepStrictEqual(deriveStorageCanonicalKeys([]), []);
    });
  });

  describe('deriveStorageSecretPresenceMap', () => {
    it('produces has* mapping for secret entries', () => {
      assert.deepStrictEqual(
        deriveStorageSecretPresenceMap(STORAGE_SETTINGS_REGISTRY),
        [
          { sourceKey: 's3SecretAccessKey', responseKey: 'hasS3SecretAccessKey' },
          { sourceKey: 's3SessionToken', responseKey: 'hasS3SessionToken' },
        ],
      );
    });

    it('returns empty array for registry with no secrets', () => {
      const noSecrets = [{ key: 'enabled', type: 'bool', default: false }];
      assert.deepStrictEqual(deriveStorageSecretPresenceMap(noSecrets), []);
    });

    it('returns empty array for empty registry', () => {
      assert.deepStrictEqual(deriveStorageSecretPresenceMap([]), []);
    });
  });

  describe('deriveStorageClearFlags', () => {
    it('produces clearFlag-to-key mapping for entries with clearFlag metadata', () => {
      assert.deepStrictEqual(
        deriveStorageClearFlags(STORAGE_SETTINGS_REGISTRY),
        [
          { clearFlag: 'clearS3SecretAccessKey', key: 's3SecretAccessKey' },
          { clearFlag: 'clearS3SessionToken', key: 's3SessionToken' },
        ],
      );
    });

    it('returns empty array for registry with no clearFlags', () => {
      const noClearFlags = [{ key: 'enabled', type: 'bool', default: false }];
      assert.deepStrictEqual(deriveStorageClearFlags(noClearFlags), []);
    });

    it('returns empty array for empty registry', () => {
      assert.deepStrictEqual(deriveStorageClearFlags([]), []);
    });
  });
});

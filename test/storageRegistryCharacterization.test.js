// WHY: Golden-master characterization tests locking down current storage
// settings shape BEFORE migrating to registry-driven derivation.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES } from '../src/shared/settingsDefaults.js';

describe('storage settings characterization (golden master)', () => {
  it('SETTINGS_DEFAULTS.storage has exact shape', () => {
    assert.deepStrictEqual({ ...SETTINGS_DEFAULTS.storage }, {
      enabled: false,
      destinationType: 'local',
      localDirectory: '',
      awsRegion: 'us-east-2',
      s3Bucket: '',
      s3Prefix: 'spec-factory-runs',
      s3AccessKeyId: '',
    });
  });

  it('SETTINGS_DEFAULTS.storage does NOT include secrets', () => {
    assert.equal(Object.hasOwn(SETTINGS_DEFAULTS.storage, 's3SecretAccessKey'), false);
    assert.equal(Object.hasOwn(SETTINGS_DEFAULTS.storage, 's3SessionToken'), false);
  });

  it('SETTINGS_OPTION_VALUES.storage has exact shape', () => {
    assert.deepStrictEqual(
      { destinationType: [...SETTINGS_OPTION_VALUES.storage.destinationType] },
      { destinationType: ['local', 's3'] },
    );
  });
});

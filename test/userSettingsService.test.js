import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSettingsArtifactsFromUserSettings,
  readStudioMapFromUserSettings,
  sanitizeUserSettingsSettings,
} from '../src/api/services/userSettingsService.js';

test('readStudioMapFromUserSettings returns null when category entry is missing', () => {
  const payload = {
    studio: {},
  };
  assert.equal(readStudioMapFromUserSettings(payload, 'mouse'), null);
});

test('readStudioMapFromUserSettings returns null for empty map entries', () => {
  const payload = {
    studio: {
      mouse: {
        map: {},
        file_path: '',
      },
    },
  };
  assert.equal(readStudioMapFromUserSettings(payload, 'mouse'), null);
});

test('readStudioMapFromUserSettings returns populated map for matching category', () => {
  const payload = {
    studio: {
      mouse: {
        map: {
          version: 2,
          component_sources: [{ component_type: 'sensor', roles: {} }],
        },
        file_path: 'helper_files/mouse/_control_plane/field_studio_map.json',
      },
    },
  };
  assert.deepEqual(readStudioMapFromUserSettings(payload, 'mouse'), {
    file_path: 'helper_files/mouse/_control_plane/field_studio_map.json',
    map: {
      version: 2,
      component_sources: [{ component_type: 'sensor', roles: {} }],
    },
  });
});

test('sanitizeUserSettingsSettings keeps mapping and key/workbench autosave independent when auto-save-all is off', () => {
  const normalized = sanitizeUserSettingsSettings({
    ui: {
      studioAutoSaveAllEnabled: false,
      studioAutoSaveEnabled: false,
      studioAutoSaveMapEnabled: true,
      runtimeAutoSaveEnabled: true,
      storageAutoSaveEnabled: false,
      llmSettingsAutoSaveEnabled: true,
    },
  });
  assert.equal(normalized.ui.studioAutoSaveMapEnabled, true);
  assert.equal(normalized.ui.studioAutoSaveEnabled, false);
});

test('deriveSettingsArtifactsFromUserSettings normalizes runtime dynamic fetch policy object into canonical json', () => {
  const artifacts = deriveSettingsArtifactsFromUserSettings({
    runtime: {
      dynamicFetchPolicyMap: {
        mouse: 'full',
      },
    },
  });
  assert.deepEqual(artifacts.snapshot.runtime.dynamicFetchPolicyMap, {
    mouse: 'full',
  });
  assert.equal(artifacts.snapshot.runtime.dynamicFetchPolicyMapJson, '{"mouse":"full"}');
  assert.equal(artifacts.sections.runtime.dynamicFetchPolicyMapJson, '{"mouse":"full"}');
});

test('deriveSettingsArtifactsFromUserSettings uses canonical runtime json and emits sanitized legacy storage snapshot', () => {
  const artifacts = deriveSettingsArtifactsFromUserSettings({
    runtime: {
      dynamicFetchPolicyMapJson: '{"mode":"json"}',
      dynamicFetchPolicyMap: {
        mode: 'object',
      },
    },
    storage: {
      enabled: true,
      destinationType: 's3',
      s3Region: 'us-east-2',
      s3Bucket: 'spec-bucket',
      s3Prefix: 'runs',
      s3AccessKeyId: 'AKIA123',
      s3SecretAccessKey: 'secret-token',
      s3SessionToken: 'session-token',
    },
  });

  assert.deepEqual(artifacts.snapshot.runtime.dynamicFetchPolicyMap, {
    mode: 'json',
  });
  assert.equal(artifacts.snapshot.runtime.dynamicFetchPolicyMapJson, '{"mode":"json"}');
  assert.equal(artifacts.legacy.storage.destinationType, 's3');
  assert.equal(artifacts.legacy.storage.hasS3SecretAccessKey, true);
  assert.equal(artifacts.legacy.storage.hasS3SessionToken, true);
  assert.equal(Object.hasOwn(artifacts.legacy.storage, 's3SecretAccessKey'), false);
  assert.equal(Object.hasOwn(artifacts.legacy.storage, 's3SessionToken'), false);
});

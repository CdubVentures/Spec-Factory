import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSettingsArtifactsFromUserSettings,
} from '../userSettingsService.js';

test('deriveSettingsArtifactsFromUserSettings keeps mapping and key/workbench autosave independent when auto-save-all is off', () => {
  const { snapshot } = deriveSettingsArtifactsFromUserSettings({
    ui: {
      studioAutoSaveAllEnabled: false,
      studioAutoSaveEnabled: false,
      studioAutoSaveMapEnabled: true,
      runtimeAutoSaveEnabled: true,
    },
  });
  assert.equal(snapshot.ui.studioAutoSaveMapEnabled, true);
  assert.equal(snapshot.ui.studioAutoSaveEnabled, false);
});

test('deriveSettingsArtifactsFromUserSettings emits empty storage section in legacy snapshot', () => {
  const artifacts = deriveSettingsArtifactsFromUserSettings({
    storage: {},
  });

  assert.deepStrictEqual(artifacts.legacy.storage, {});
});

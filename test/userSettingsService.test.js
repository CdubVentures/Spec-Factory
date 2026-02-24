import test from 'node:test';
import assert from 'node:assert/strict';
import { readStudioMapFromUserSettings } from '../src/api/services/userSettingsService.js';

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
        file_path: 'helper_files/mouse/_control_plane/workbook_map.json',
      },
    },
  };
  assert.deepEqual(readStudioMapFromUserSettings(payload, 'mouse'), {
    file_path: 'helper_files/mouse/_control_plane/workbook_map.json',
    map: {
      version: 2,
      component_sources: [{ component_type: 'sensor', roles: {} }],
    },
  });
});

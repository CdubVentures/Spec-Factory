import test from 'node:test';
import assert from 'node:assert/strict';

import { invokeStudioRoute } from './helpers/studioRoutesHarness.js';

test('studio known-values reads authoritative enum values from SpecDb when available', async () => {
  const result = await invokeStudioRoute({
    getSpecDbReady: async () => ({
      isSeeded: () => true,
      getAllEnumFields: () => ['connection', 'lighting'],
      getListValues: (fieldKey) => {
        if (fieldKey === 'connection') {
          return [
            { value: '2.4GHz', needs_review: 0 },
            { value: 'Wireless', needs_review: 1 },
            { value: '2.4GHz', needs_review: 0 },
            { value: null, needs_review: 1 },
          ];
        }
        if (fieldKey === 'lighting') {
          return [
            { value: '1 zone (RGB)', needs_review: 0 },
            { value: '7 zone (LED)', needs_review: 0 },
          ];
        }
        return [];
      },
    }),
    safeReadJson: async () => {
      throw new Error('known_values.json fallback should not be used when SpecDb authority is available');
    },
  }, ['studio', 'mouse', 'known-values'], 'GET');

  assert.equal(result.status, 200);
  assert.equal(result.body.category, 'mouse');
  assert.equal(result.body.source, 'specdb');
  assert.deepEqual(result.body.fields, {
    connection: ['2.4GHz', 'Wireless'],
    lighting: ['1 zone (RGB)', '7 zone (LED)'],
  });
  assert.deepEqual(result.body.enum_lists, [
    { field: 'connection', values: ['2.4GHz', 'Wireless'] },
    { field: 'lighting', values: ['1 zone (RGB)', '7 zone (LED)'] },
  ]);
});

test('studio known-values returns specdb_not_ready when authoritative SpecDb is unavailable', async () => {
  const result = await invokeStudioRoute({
    getSpecDbReady: async () => null,
    safeReadJson: async () => {
      throw new Error('known_values.json fallback should be disabled in strict authority mode');
    },
  }, ['studio', 'mouse', 'known-values'], 'GET');

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: 'specdb_not_ready',
    message: 'SpecDb not ready for mouse',
  });
});

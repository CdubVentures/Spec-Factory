import test from 'node:test';
import assert from 'node:assert/strict';

import { invokeStudioRoute } from './helpers/studioRoutesHarness.js';

test('studio component-db reads authoritative identities from SpecDb when available', async () => {
  const result = await invokeStudioRoute({
    getSpecDbReady: async () => ({
      getComponentTypeList: () => [
        { component_type: 'sensor', item_count: 2 },
        { component_type: 'switch', item_count: 1 },
      ],
      getAllComponentsForType: (componentType) => {
        if (componentType === 'sensor') {
          return [
            {
              identity: { canonical_name: 'PAW3395', maker: 'PixArt' },
              aliases: [{ alias: '3395' }, { alias: 'PAW-3395' }],
            },
            {
              identity: { canonical_name: 'HERO 25K', maker: 'Logitech' },
              aliases: [{ alias: 'hero' }],
            },
          ];
        }
        if (componentType === 'switch') {
          return [
            {
              identity: { canonical_name: 'Optical', maker: '' },
              aliases: [],
            },
          ];
        }
        return [];
      },
    }),
    listFiles: async () => {
      throw new Error('generated component_db should not be read when SpecDb is ready');
    },
  }, ['studio', 'mouse', 'component-db'], 'GET');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    sensor: [
      { name: 'PAW3395', maker: 'PixArt', aliases: ['3395', 'PAW-3395'] },
      { name: 'HERO 25K', maker: 'Logitech', aliases: ['hero'] },
    ],
    switch: [
      { name: 'Optical', maker: '', aliases: [] },
    ],
  });
});

test('studio component-db returns specdb_not_ready when authoritative SpecDb is unavailable', async () => {
  const result = await invokeStudioRoute({
    getSpecDbReady: async () => null,
    listFiles: async () => {
      throw new Error('generated component_db fallback should be disabled in strict authority mode');
    },
  }, ['studio', 'mouse', 'component-db'], 'GET');

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: 'specdb_not_ready',
    message: 'SpecDb not ready for mouse',
  });
});

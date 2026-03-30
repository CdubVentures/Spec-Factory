import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyEnumConsistencyToSuggestions,
  buildStudioComponentDbFromSpecDb,
} from '../studioRouteHelpers.js';

test('buildStudioComponentDbFromSpecDb normalizes authoritative component identities', () => {
  const result = buildStudioComponentDbFromSpecDb({
    getComponentTypeList: () => [
      { component_type: 'sensor' },
      { component_type: 'switch' },
    ],
    getAllComponentsForType: (componentType) => {
      if (componentType === 'sensor') {
        return [
          {
            identity: { canonical_name: 'PAW3395', maker: 'PixArt' },
            aliases: [{ alias: '3395' }, { alias: 'PAW-3395' }, { alias: '3395' }],
          },
        ];
      }
      return [
        {
          identity: { canonical_name: 'Optical', maker: '' },
          aliases: [],
        },
      ];
    },
  });

  assert.deepEqual(result, {
    sensor: [
      { name: 'PAW3395', maker: 'PixArt', aliases: ['3395', 'PAW-3395'] },
    ],
    switch: [
      { name: 'Optical', maker: '', aliases: [] },
    ],
  });
});

test('applyEnumConsistencyToSuggestions updates accepted suggestions and trims pending field values', async () => {
  const writes = [];
  const result = await applyEnumConsistencyToSuggestions({
    fs: {
      readFile: async () => JSON.stringify({
        suggestions: [
          { field_key: 'lighting', value: 'Rgb Led', status: 'pending' },
          { field_key: 'lighting', value: 'OLED', status: 'pending' },
        ],
        fields: {
          lighting: ['Rgb Led', 'OLED'],
        },
      }),
      mkdir: async () => {},
      writeFile: async (target, content) => {
        writes.push({ target, content: JSON.parse(content) });
      },
    },
    path: {
      join: (...parts) => parts.join('/'),
      dirname: (value) => value.split('/').slice(0, -1).join('/'),
    },
    helperRoot: 'category_authority',
    category: 'mouse',
    field: 'lighting',
    decisions: [
      { value: 'Rgb Led', decision: 'map_to_existing', target_value: 'RGB LED' },
      { value: 'OLED', decision: 'keep_new' },
    ],
  });

  // WHY: Phase E3 — counts from decisions directly (no file double-counting)
  assert.deepEqual(result, {
    mapped: 1,
    kept: 1,
    uncertain: 0,
    changed: 2,
  });
});

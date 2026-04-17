import test from 'node:test';
import assert from 'node:assert/strict';

import {
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


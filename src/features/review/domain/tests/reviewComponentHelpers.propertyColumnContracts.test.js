import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDeclaredComponentPropertyColumns,
  mergePropertyColumns,
} from '../componentReviewHelpers.js';

test('resolveDeclaredComponentPropertyColumns combines field-match keys with component-db property roles', () => {
  const fieldRules = {
    fields: {
      dpi: {
        component: {
          type: 'sensor',
          match: {
            property_keys: ['dpi', 'max_dpi', '__hidden'],
          },
        },
      },
      weight: {},
    },
    rules: {
      component_db_sources: {
        sensor: {
          roles: {
            properties: [
              { field_key: 'ips' },
              { property_key: '__shadow' },
              { key: 'tracking_speed' },
            ],
          },
        },
      },
    },
  };

  const cols = resolveDeclaredComponentPropertyColumns({ fieldRules, componentType: 'sensor' });

  assert.deepEqual(cols, ['dpi', 'hidden', 'ips', 'max_dpi', 'shadow', 'tracking_speed']);
});

test('resolveDeclaredComponentPropertyColumns returns empty when the component type is missing', () => {
  assert.deepEqual(resolveDeclaredComponentPropertyColumns({ fieldRules: {}, componentType: '' }), []);
  assert.deepEqual(resolveDeclaredComponentPropertyColumns(), []);
});

test('mergePropertyColumns normalizes, deduplicates, and hides private columns', () => {
  assert.deepEqual(
    mergePropertyColumns(['dpi', 'ips'], ['ips', 'acceleration']),
    ['acceleration', 'dpi', 'ips'],
  );
  assert.deepEqual(mergePropertyColumns([], []), []);
  assert.deepEqual(mergePropertyColumns(['__hidden'], ['visible']), ['hidden', 'visible']);
});

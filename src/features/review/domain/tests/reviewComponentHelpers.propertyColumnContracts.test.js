import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDeclaredComponentPropertyColumns,
  mergePropertyColumns,
} from '../componentReviewHelpers.js';

test('resolveDeclaredComponentPropertyColumns reads component-db property roles (Phase 2)', () => {
  // Phase 2: rule.component.match.property_keys retired; the SSOT for property
  // columns is `field_studio_map.component_sources` (passed through here as
  // `rules.component_db_sources`). The legacy field-rule walk was removed.
  const fieldRules = {
    fields: {
      // sensor parent — Phase 2 lock contract.
      sensor: {
        enum: { source: 'component_db.sensor', policy: 'open_prefer_known' },
      },
      weight: {},
    },
    rules: {
      component_db_sources: {
        sensor: {
          roles: {
            properties: [
              { key: 'tracking_speed' },
              { field_key: 'ips' },
              { property_key: '__shadow' },
            ],
          },
        },
      },
    },
  };

  const cols = resolveDeclaredComponentPropertyColumns({ fieldRules, componentType: 'sensor' });

  assert.deepEqual(cols, ['tracking_speed', 'ips', 'shadow']);
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

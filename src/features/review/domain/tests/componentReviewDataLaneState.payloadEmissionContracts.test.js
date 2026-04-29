// Boundary contract: API payloads MUST always emit `property_columns` and
// `fields` as arrays — never undefined. The frontend types declare both as
// required `string[]` / `EnumFieldReview[]`; runtime drift previously caused
// a "n is not iterable" crash on the Component Review tabs because
// `buildComponentReviewPayloadsSpecDb` skipped `property_columns` in its
// no-components early-return. These tests pin the contract so any future
// regression fails at the data-builder layer.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  createComponentRowHarness,
} from './helpers/componentReviewRowHarness.js';
import { buildEnumReviewPayloads } from '../../tests/helpers/componentReviewHarness.js';

test('component payload emits property_columns:[] when no components exist for the type', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
  });

  assert.ok(Array.isArray(payload.property_columns), 'property_columns must be an array');
  assert.deepEqual(payload.property_columns, []);
  assert.deepEqual(payload.items, []);
});

test('component payload emits property_columns:[] when specDb is null', async (t) => {
  const { config } = await createComponentRowHarness(t);

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb: null,
  });

  assert.ok(Array.isArray(payload.property_columns), 'property_columns must be an array');
  assert.deepEqual(payload.property_columns, []);
});

test('component layout emits types:[] (each entry has property_columns:[]) when specDb is null', async (t) => {
  const { config } = await createComponentRowHarness(t);

  const layout = await buildComponentReviewLayout({
    config,
    category: CATEGORY,
    specDb: null,
  });

  assert.ok(Array.isArray(layout.types), 'layout.types must be an array');
  for (const row of layout.types) {
    assert.ok(Array.isArray(row.property_columns), `layout type ${row.type} must have array property_columns`);
  }
});

test('enum payload emits fields:[] when no enum fields exist', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);

  const payload = await buildEnumReviewPayloads({
    config,
    category: CATEGORY,
    specDb,
  });

  assert.ok(Array.isArray(payload.fields), 'fields must be an array');
  assert.deepEqual(payload.fields, []);
});

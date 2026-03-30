import test from 'node:test';
import assert from 'node:assert/strict';

import { createExportOverridesCommand } from '../exportOverridesCommand.js';

function createMockSpecDb({
  approvedProductIds = [],
  reviewStates = {},
  overriddenFields = {},
} = {}) {
  return {
    listApprovedProductIds() { return approvedProductIds; },
    getProductReviewState(pid) { return reviewStates[pid] || null; },
    getOverriddenFieldsForProduct(pid) { return overriddenFields[pid] || []; },
    close() {},
  };
}

function createHarness(overrides = {}) {
  const mockSpecDb = overrides.specDb || createMockSpecDb(overrides);
  return createExportOverridesCommand({
    openSpecDbForCategory: async () => mockSpecDb,
    ...overrides,
  });
}

test('export-overrides requires --category', async () => {
  const cmd = createHarness();
  await assert.rejects(
    cmd({}, {}, { _: [] }),
    /category/i,
  );
});

test('export-overrides returns empty products array when no approved products exist', async () => {
  const cmd = createHarness({ approvedProductIds: [] });
  const result = await cmd({}, {}, { category: 'mouse', _: [] });
  assert.equal(result.command, 'export-overrides');
  assert.equal(result.category, 'mouse');
  assert.equal(result.products.length, 0);
});

test('export-overrides exports approved products with override fields', async () => {
  const cmd = createHarness({
    approvedProductIds: ['mouse-logitech-g502'],
    reviewStates: {
      'mouse-logitech-g502': {
        category: 'mouse',
        product_id: 'mouse-logitech-g502',
        review_status: 'approved',
        reviewed_by: 'tester',
        reviewed_at: '2026-03-29T00:00:00Z',
      },
    },
    overriddenFields: {
      'mouse-logitech-g502': [
        {
          field_key: 'sensor',
          value: 'HERO 25K',
          override_source: 'candidate_selection',
          override_value: 'HERO 25K',
          override_reason: 'verified',
          override_provenance: '{"url":"https://example.com","quote":"HERO 25K sensor"}',
          overridden_by: 'tester',
          overridden_at: '2026-03-29T00:00:00Z',
          accepted_candidate_id: 'cid-1',
          updated_at: '2026-03-29T00:00:00Z',
        },
      ],
    },
  });

  const result = await cmd({}, {}, { category: 'mouse', _: [] });

  assert.equal(result.products.length, 1);
  const product = result.products[0];
  assert.equal(product.product_id, 'mouse-logitech-g502');
  assert.equal(product.review_status, 'approved');
  assert.equal(product.version, 1);
  assert.ok(product.overrides.sensor, 'should have sensor override');
  assert.equal(product.overrides.sensor.override_value, 'HERO 25K');
  assert.equal(product.overrides.sensor.override_source, 'candidate_selection');
});

test('export-overrides includes multiple products', async () => {
  const cmd = createHarness({
    approvedProductIds: ['mouse-a', 'mouse-b'],
    reviewStates: {
      'mouse-a': { review_status: 'approved' },
      'mouse-b': { review_status: 'approved' },
    },
    overriddenFields: {
      'mouse-a': [{ field_key: 'weight', value: '80g', override_value: '80g' }],
      'mouse-b': [],
    },
  });

  const result = await cmd({}, {}, { category: 'mouse', _: [] });

  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].product_id, 'mouse-a');
  assert.ok(result.products[0].overrides.weight);
  assert.equal(result.products[1].product_id, 'mouse-b');
  assert.deepEqual(result.products[1].overrides, {});
});

test('export-overrides parses JSON override_provenance from SQL text', async () => {
  const cmd = createHarness({
    approvedProductIds: ['mouse-x'],
    reviewStates: { 'mouse-x': { review_status: 'approved' } },
    overriddenFields: {
      'mouse-x': [{
        field_key: 'dpi',
        value: '25600',
        override_value: '25600',
        override_provenance: '{"url":"https://example.com","quote":"max dpi 25600"}',
      }],
    },
  });

  const result = await cmd({}, {}, { category: 'mouse', _: [] });
  const prov = result.products[0].overrides.dpi.override_provenance;
  assert.equal(typeof prov, 'object');
  assert.equal(prov.url, 'https://example.com');
});

test('export-overrides handles null override_provenance gracefully', async () => {
  const cmd = createHarness({
    approvedProductIds: ['mouse-y'],
    reviewStates: { 'mouse-y': { review_status: 'approved' } },
    overriddenFields: {
      'mouse-y': [{
        field_key: 'weight',
        value: '85g',
        override_value: '85g',
        override_provenance: null,
      }],
    },
  });

  const result = await cmd({}, {}, { category: 'mouse', _: [] });
  assert.equal(result.products[0].overrides.weight.override_provenance, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyKeyOrderPatchDocument,
  expectedKeyOrderPatchFileName,
  parseKeyOrderPatchPayloadFiles,
  validateKeyOrderPatchDocument,
} from '../keyOrderPatch.js';

const currentOrder = [
  '__grp::Product & Variants',
  'sku',
  '__grp::Sensor Performance',
  'dpi',
  'ips',
];

function validDoc(overrides = {}) {
  return {
    schema_version: 'key-order-patch.v1',
    category: 'mouse',
    verdict: 'reorganize',
    groups: [
      {
        group_key: 'product_variants',
        display_name: 'Product & Variants',
        rationale: 'Identity and variant keys stay first.',
        keys: ['sku'],
      },
      {
        group_key: 'sensor_performance',
        display_name: 'Sensor Performance',
        rationale: 'Sensor metrics belong together.',
        keys: ['dpi', 'ips', 'lod_sync'],
      },
    ],
    add_keys: [
      {
        field_key: 'lod_sync',
        display_name: 'LOD Sync',
        group_key: 'sensor_performance',
        rationale: 'Modern mice expose lift-off distance sync behavior.',
      },
    ],
    rename_keys: [
      {
        from: 'lngth',
        to: 'length',
        rationale: 'Readable public key name; keep old key until migration exists.',
      },
    ],
    audit: {
      categories_compared: ['mouse'],
      products_checked: ['Example Mouse'],
      sources_checked: ['https://example.test/specs'],
      missing_key_rationale: 'Compared category depth against current mouse component/performance coverage.',
      organization_rationale: 'Keep identity, appearance, connectivity, component identity, and performance as separate groups.',
      open_questions: [],
    },
    ...overrides,
  };
}

test('expectedKeyOrderPatchFileName uses one category-level strict JSON file', () => {
  assert.equal(
    expectedKeyOrderPatchFileName({ category: 'mouse' }),
    'mouse-keys-order.key-order-patch.v1.json',
  );
});

test('validateKeyOrderPatchDocument accepts additive reorder patches', () => {
  const doc = validateKeyOrderPatchDocument(validDoc(), {
    category: 'mouse',
    fileName: 'mouse-keys-order.key-order-patch.v1.json',
    currentOrder,
    existingFieldKeys: ['sku', 'dpi', 'ips'],
  });

  assert.equal(doc.category, 'mouse');
  assert.equal(doc.add_keys[0].field_key, 'lod_sync');
});

test('validateKeyOrderPatchDocument rejects proposals that delete current keys', () => {
  assert.throws(
    () => validateKeyOrderPatchDocument(validDoc({
      groups: [
        {
          group_key: 'sensor_performance',
          display_name: 'Sensor Performance',
          rationale: 'bad',
          keys: ['dpi'],
        },
      ],
    }), {
      category: 'mouse',
      currentOrder,
      existingFieldKeys: ['sku', 'dpi', 'ips'],
    }),
    /missing current key "sku"/i,
  );
});

test('validateKeyOrderPatchDocument requires unknown ordered keys to be declared in add_keys', () => {
  assert.throws(
    () => validateKeyOrderPatchDocument(validDoc({ add_keys: [] }), {
      category: 'mouse',
      currentOrder,
      existingFieldKeys: ['sku', 'dpi', 'ips'],
    }),
    /unknown ordered key "lod_sync"/i,
  );
});

test('applyKeyOrderPatchDocument builds grouped field_key_order without deleting rename sources', () => {
  const result = applyKeyOrderPatchDocument(validDoc(), {
    category: 'mouse',
    currentOrder,
    existingFieldKeys: ['sku', 'dpi', 'ips'],
  });

  assert.deepEqual(result.order, [
    '__grp::Product & Variants',
    'sku',
    '__grp::Sensor Performance',
    'dpi',
    'ips',
    'lod_sync',
  ]);
  assert.ok(result.changes.some((change) => change.kind === 'key_added' && change.key === 'lod_sync'));
  assert.ok(result.changes.some((change) => change.kind === 'rename_proposed' && change.from === 'lngth'));
});

test('parseKeyOrderPatchPayloadFiles validates uploaded JSON payloads', () => {
  const docs = parseKeyOrderPatchPayloadFiles({
    category: 'mouse',
    currentOrder,
    existingFieldKeys: ['sku', 'dpi', 'ips'],
    files: [
      {
        fileName: 'mouse-keys-order.key-order-patch.v1.json',
        content: JSON.stringify(validDoc()),
      },
    ],
  });

  assert.equal(docs.length, 1);
  assert.equal(docs[0].source_file, 'mouse-keys-order.key-order-patch.v1.json');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { createExplainUnkCommand } from '../explainUnkCommand.js';

function createDeps(overrides = {}) {
  return {
    slug: (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '-'),
    ...overrides,
  };
}

test('explain-unk derives product id and returns unknown field breakdown from latest artifacts', async () => {
  const outputCalls = [];
  const storage = {
    resolveOutputKey(category, productId, label) {
      outputCalls.push({ category, productId, label });
      return `out/${category}/${productId}/${label}`;
    },
    async readJsonOrNull(key) {
      if (key.endsWith('/summary.json')) {
        return {
          runId: 'run-001',
          validated: true,
          field_reasoning: {
            dpi: {
              unknown_reason: 'no_datasheet',
              reasons: ['vendor page missing spec table'],
              contradictions: [],
            },
          },
          searches_attempted: ['mx master 3s dpi'],
          urls_fetched: ['https://example.com/specs'],
          top_evidence_references: ['https://example.com/specs#dpi'],
        };
      }
      if (key.endsWith('/normalized.json')) {
        return {
          fields: {
            dpi: 'unk',
            sensor: 'UNK',
            weight_g: '141',
          },
        };
      }
      return null;
    },
  };

  const commandExplainUnk = createExplainUnkCommand(createDeps());
  const result = await commandExplainUnk({}, storage, {
    category: 'mouse',
    brand: 'Logitech',
    model: 'MX Master',
    variant: '3S',
  });

  assert.equal(outputCalls.length, 1);
  assert.deepEqual(outputCalls[0], {
    category: 'mouse',
    productId: 'mouse-logitech-mx-master-3s',
    label: 'latest',
  });

  assert.equal(result.command, 'explain-unk');
  assert.equal(result.category, 'mouse');
  assert.equal(result.productId, 'mouse-logitech-mx-master-3s');
  assert.equal(result.run_id, 'run-001');
  assert.equal(result.validated, true);
  assert.equal(result.unknown_field_count, 2);
  assert.equal(result.unknown_fields[0].field, 'dpi');
  assert.equal(result.unknown_fields[0].unknown_reason, 'no_datasheet');
  assert.equal(result.unknown_fields[1].field, 'sensor');
  assert.equal(result.unknown_fields[1].unknown_reason, 'not_found_after_search');
  assert.equal(result.urls_fetched_count, 1);
});

test('explain-unk throws when product id cannot be resolved', async () => {
  const commandExplainUnk = createExplainUnkCommand(createDeps({
    slug: () => '',
  }));

  await assert.rejects(
    commandExplainUnk({}, {
      resolveOutputKey: () => 'unused',
      readJsonOrNull: async () => null,
    }, {
      category: '   ',
      brand: '',
      model: '',
      variant: '',
    }),
    /explain-unk requires --product-id or --category\/--brand\/--model/
  );
});

test('explain-unk throws when latest artifacts are missing for resolved product id', async () => {
  const commandExplainUnk = createExplainUnkCommand(createDeps());

  await assert.rejects(
    commandExplainUnk({}, {
      resolveOutputKey: (category, productId) => `out/${category}/${productId}/latest`,
      readJsonOrNull: async () => null,
    }, {
      category: 'mouse',
      'product-id': 'mouse-missing',
    }),
    /No latest run found for productId 'mouse-missing' in category 'mouse'/
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { createExplainUnkCommand } from '../explainUnkCommand.js';

test('explain-unk returns unknown field breakdown for given product-id', async () => {
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

  const commandExplainUnk = createExplainUnkCommand();
  const result = await commandExplainUnk({}, storage, {
    category: 'mouse',
    'product-id': 'mouse-a1b2c3d4',
  });

  assert.equal(outputCalls.length, 1);
  assert.deepEqual(outputCalls[0], {
    category: 'mouse',
    productId: 'mouse-a1b2c3d4',
    label: 'latest',
  });

  assert.equal(result.command, 'explain-unk');
  assert.equal(result.category, 'mouse');
  assert.equal(result.productId, 'mouse-a1b2c3d4');
  assert.equal(result.run_id, 'run-001');
  assert.equal(result.validated, true);
  assert.equal(result.unknown_field_count, 2);
  assert.equal(result.unknown_fields[0].field, 'dpi');
  assert.equal(result.unknown_fields[0].unknown_reason, 'no_datasheet');
  assert.equal(result.unknown_fields[1].field, 'sensor');
  assert.equal(result.unknown_fields[1].unknown_reason, 'not_found_after_search');
  assert.equal(result.urls_fetched_count, 1);
});

test('explain-unk throws when --product-id is not provided', async () => {
  const commandExplainUnk = createExplainUnkCommand();

  await assert.rejects(
    commandExplainUnk({}, {
      resolveOutputKey: () => 'unused',
      readJsonOrNull: async () => null,
    }, {
      category: 'mouse',
      brand: 'Logitech',
      model: 'MX Master',
    }),
    /explain-unk requires --product-id/
  );
});

test('explain-unk throws when latest artifacts are missing for resolved product id', async () => {
  const commandExplainUnk = createExplainUnkCommand();

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

test('explain-unk falls back to legacy run_id and empty unknown output when normalized fields are absent', async () => {
  const commandExplainUnk = createExplainUnkCommand();

  const result = await commandExplainUnk({}, {
    resolveOutputKey: (category, productId) => `out/${category}/${productId}/latest`,
    async readJsonOrNull(key) {
      if (key.endsWith('/summary.json')) {
        return {
          run_id: 'run-legacy-002',
          validated: false,
        };
      }
      return null;
    },
  }, {
    category: 'mouse',
    'product-id': 'mouse-legacy',
  });

  assert.deepEqual(result, {
    command: 'explain-unk',
    category: 'mouse',
    productId: 'mouse-legacy',
    run_id: 'run-legacy-002',
    validated: false,
    unknown_field_count: 0,
    unknown_fields: [],
    searches_attempted: [],
    urls_fetched_count: 0,
    top_evidence_references: [],
  });
});

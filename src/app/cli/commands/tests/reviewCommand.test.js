import test from 'node:test';
import assert from 'node:assert/strict';

import { createReviewCommand } from '../reviewCommand.js';

function createDeps(overrides = {}) {
  return {
    asBool: (value, fallback = false) => {
      if (value === undefined || value === null || value === '') return fallback;
      return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
    },
    parseJsonArg: (_name, _value, fallback) => fallback,
    withSpecDb: async (_config, _category, fn) => {
      const specDb = { close() {} };
      try { return await fn(specDb); } finally { try { specDb?.close(); } catch { /* */ } }
    },
    buildReviewLayout: async () => ({ columns: [] }),
    buildProductReviewPayload: async () => ({ product_id: 'mouse-1', fields: {} }),
    writeProductReviewArtifacts: async () => ({ product_id: 'mouse-1' }),
    setOverrideFromCandidate: async () => ({ updated: true }),
    approveGreenOverrides: async () => ({ approved_count: 0, approved_fields: [] }),
    setManualOverride: async () => ({ updated: true }),
    finalizeOverrides: async () => ({ finalized: true }),
    buildReviewMetrics: async () => ({ reviewed_products: 0, products_per_hour: 0 }),
    ...overrides,
  };
}

function createReviewHarness(overrides = {}) {
  return createReviewCommand(createDeps(overrides));
}

test('review command requires a subcommand', async () => {
  const commandReview = createReviewHarness();
  await assert.rejects(
    commandReview({}, {}, { category: 'mouse', _: [] }),
    /review requires a subcommand: layout\|product\|build\|override\|approve-greens\|manual-override\|finalize\|metrics/,
  );
});

test('review layout returns the layout payload', async () => {
  const commandReview = createReviewHarness({
    buildReviewLayout: async () => ({ columns: ['identity', 'confidence'] }),
  });

  const result = await commandReview({ name: 'config' }, { name: 'storage' }, { category: 'mouse', _: ['layout'] });

  assert.deepEqual(result, {
    command: 'review',
    action: 'layout',
    columns: ['identity', 'confidence'],
  });
});

test('review product requires --product-id', async () => {
  const commandReview = createReviewHarness();
  await assert.rejects(
    commandReview({}, {}, { category: 'mouse', _: ['product'] }),
    /review product requires --product-id <id>/,
  );
});

test('review product reflects without-candidates in the returned payload', async () => {
  const commandReview = createReviewHarness({
    buildProductReviewPayload: async ({ productId, includeCandidates }) => ({
      product_id: productId,
      include_candidates: includeCandidates,
      fields: {
        weight: {
          candidates: [],
          candidate_count: 2,
        },
      },
    }),
  });

  const result = await commandReview({}, {}, {
    category: 'mouse',
    _: ['product'],
    'product-id': 'mouse-1',
    'without-candidates': 'true',
  });

  assert.deepEqual(result, {
    command: 'review',
    action: 'product',
    category: 'mouse',
    product_id: 'mouse-1',
    include_candidates: false,
    fields: {
      weight: {
        candidates: [],
        candidate_count: 2,
      },
    },
  });
});

test('review build requires --product-id and returns product artifact payload', async () => {
  const commandReview = createReviewHarness({
    writeProductReviewArtifacts: async ({ productId }) => ({
      product_id: productId,
      candidate_count: 5,
    }),
  });

  const result = await commandReview({}, {}, {
    category: 'mouse',
    _: ['build'],
    'product-id': 'mouse-2',
  });

  assert.deepEqual(result, {
    command: 'review',
    action: 'build',
    category: 'mouse',
    product: {
      product_id: 'mouse-2',
      candidate_count: 5,
    },
  });
});

test('review build requires --product-id', async () => {
  const commandReview = createReviewHarness();
  await assert.rejects(
    commandReview({}, {}, { category: 'mouse', _: ['build'] }),
    /review build requires --product-id <id>/,
  );
});

test('review manual-override requires --product-id --field --value', async () => {
  const commandReview = createReviewHarness();
  await assert.rejects(
    commandReview({}, {}, {
      category: 'mouse',
      _: ['manual-override'],
      'product-id': 'mouse-1',
      field: 'weight',
    }),
    /review manual-override requires --product-id --field --value/,
  );
});

test('review manual-override returns the normalized evidence payload', async () => {
  const commandReview = createReviewHarness({
    parseJsonArg: (name, value, fallback) => {
      if (name === 'evidence-quote-span') {
        return JSON.parse(String(value));
      }
      return fallback;
    },
    setManualOverride: async ({ field, value, evidence }) => ({
      updated: true,
      field,
      value,
      evidence,
    }),
  });

  const result = await commandReview({}, {}, {
    category: 'mouse',
    _: ['manual-override'],
    'product-id': 'mouse-1',
    field: 'weight',
    value: '59',
    'evidence-url': 'https://manufacturer.example/spec',
    'evidence-quote': 'Weight: 59 g',
    'evidence-quote-span': '{"start":1,"end":7}',
    'evidence-snippet-id': 'snp_001',
    'evidence-snippet-hash': 'hash_abc',
    'evidence-source-id': 'manufacturer_example',
    'evidence-retrieved-at': '2026-03-04T00:00:00.000Z',
  });

  assert.deepEqual(result, {
    command: 'review',
    action: 'manual-override',
    category: 'mouse',
    updated: true,
    field: 'weight',
    value: '59',
    evidence: {
      url: 'https://manufacturer.example/spec',
      quote: 'Weight: 59 g',
      quote_span: { start: 1, end: 7 },
      snippet_id: 'snp_001',
      snippet_hash: 'hash_abc',
      source_id: 'manufacturer_example',
      retrieved_at: '2026-03-04T00:00:00.000Z',
    },
  });
});

test('review metrics returns the metrics payload for the requested window', async () => {
  const commandReview = createReviewHarness({
    buildReviewMetrics: async ({ windowHours }) => ({
      reviewed_products: 4,
      products_per_hour: 2,
      window_hours: windowHours,
    }),
  });

  const result = await commandReview({}, {}, {
    category: 'mouse',
    _: ['metrics'],
    'window-hours': '12',
  });

  assert.deepEqual(result, {
    command: 'review',
    action: 'metrics',
    reviewed_products: 4,
    products_per_hour: 2,
    window_hours: 12,
  });
});

test('review command rejects unknown subcommand', async () => {
  const commandReview = createReviewHarness();
  await assert.rejects(
    commandReview({}, {}, { category: 'mouse', _: ['wat'] }),
    /Unknown review subcommand: wat/,
  );
});

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
    openSpecDbForCategory: async () => ({ close() {} }),
    buildReviewLayout: async () => ({ columns: [] }),
    buildReviewQueue: async () => [],
    buildProductReviewPayload: async () => ({ product_id: 'mouse-1', fields: {} }),
    writeProductReviewArtifacts: async () => ({ product_id: 'mouse-1' }),
    writeCategoryReviewArtifacts: async () => ({ queue_path: 'review/queue.json' }),
    startReviewQueueWebSocket: async () => ({
      port: 8789,
      poll_seconds: 5,
      ws_url: 'ws://127.0.0.1:8789/review/queue',
      health_url: 'http://127.0.0.1:8789/health',
      stop: async () => {},
    }),
    setOverrideFromCandidate: async () => ({ updated: true }),
    approveGreenOverrides: async () => ({ approved_count: 0, approved_fields: [] }),
    setManualOverride: async () => ({ updated: true }),
    finalizeOverrides: async () => ({ finalized: true }),
    buildReviewMetrics: async () => ({ reviewed_products: 0, products_per_hour: 0 }),
    appendReviewSuggestion: async () => ({ appended: true }),
    ...overrides,
  };
}

function createReviewHarness(overrides = {}) {
  return createReviewCommand(createDeps(overrides));
}

async function withImmediateTimeout(run) {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback, _delay, ...args) => {
    callback(...args);
    return 0;
  };
  try {
    return await run();
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

test('review command requires a subcommand', async () => {
  const commandReview = createReviewHarness();
  await assert.rejects(
    commandReview({}, {}, { category: 'mouse', _: [] }),
    /review requires a subcommand: layout\|queue\|product\|build\|ws-queue\|override\|approve-greens\|manual-override\|finalize\|metrics\|suggest/,
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

test('review queue defaults status and limit in the returned payload', async () => {
  const commandReview = createReviewHarness({
    buildReviewQueue: async () => [{ product_id: 'mouse-review-1' }],
  });

  const result = await commandReview({}, {}, { _: ['queue'] });

  assert.deepEqual(result, {
    command: 'review',
    action: 'queue',
    category: 'mouse',
    status: 'needs_review',
    count: 1,
    items: [{ product_id: 'mouse-review-1' }],
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

test('review build returns product and queue artifact payloads', async () => {
  const commandReview = createReviewHarness({
    writeProductReviewArtifacts: async ({ productId }) => ({
      product_id: productId,
      review_field_count: 3,
    }),
    writeCategoryReviewArtifacts: async ({ status, limit }) => ({
      queue_path: 'review/queue.json',
      queue_count: 12,
      status,
      limit,
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
      review_field_count: 3,
    },
    queue: {
      queue_path: 'review/queue.json',
      queue_count: 12,
      status: 'needs_review',
      limit: 500,
    },
  });
});

test('review ws-queue returns websocket metadata', async () => {
  const commandReview = createReviewHarness({
    startReviewQueueWebSocket: async ({ pollSeconds }) => ({
      port: 9099,
      poll_seconds: pollSeconds,
      ws_url: 'ws://127.0.0.1:9099/review/queue',
      health_url: 'http://127.0.0.1:9099/health',
      stop: async () => {},
    }),
  });

  const result = await withImmediateTimeout(() => commandReview({}, {}, {
    category: 'mouse',
    _: ['ws-queue'],
    status: 'queued',
    limit: '50',
    host: '0.0.0.0',
    port: '9090',
    'poll-seconds': '3',
    'duration-seconds': '1',
  }));

  assert.deepEqual(result, {
    command: 'review',
    action: 'ws-queue',
    category: 'mouse',
    status: 'queued',
    limit: 50,
    host: '0.0.0.0',
    port: 9099,
    poll_seconds: 3,
    ws_url: 'ws://127.0.0.1:9099/review/queue',
    health_url: 'http://127.0.0.1:9099/health',
    stop_reason: 'duration_elapsed',
  });
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

test('review suggest requires --type --field --value', async () => {
  const commandReview = createReviewHarness();
  await assert.rejects(
    commandReview({}, {}, {
      category: 'mouse',
      _: ['suggest'],
      type: 'enum',
      field: 'switch_type',
    }),
    /review suggest requires --type --field --value/,
  );
});

test('review suggest returns the normalized suggestion payload', async () => {
  const commandReview = createReviewHarness({
    parseJsonArg: (name, value, fallback) => {
      if (name === 'evidence-quote-span') {
        return JSON.parse(String(value));
      }
      return fallback;
    },
    appendReviewSuggestion: async ({ type, payload }) => ({
      appended: true,
      type,
      suggestion: payload,
    }),
  });

  const result = await commandReview({}, {}, {
    category: 'mouse',
    _: ['suggest'],
    type: 'enum',
    field: 'switch_type',
    value: 'optical-v2',
    canonical: 'optical_v2',
    'product-id': 'mouse-1',
    'evidence-url': 'https://manufacturer.example/spec',
    'evidence-quote': 'Switch Type: Optical V2',
    'evidence-quote-span': '{"start":0,"end":12}',
  });

  assert.deepEqual(result, {
    command: 'review',
    action: 'suggest',
    category: 'mouse',
    appended: true,
    type: 'enum',
    suggestion: {
      product_id: 'mouse-1',
      field: 'switch_type',
      value: 'optical-v2',
      canonical: 'optical_v2',
      reason: '',
      reviewer: '',
      evidence: {
        url: 'https://manufacturer.example/spec',
        quote: 'Switch Type: Optical V2',
        quote_span: { start: 0, end: 12 },
        snippet_id: '',
        snippet_hash: '',
      },
    },
  });
});

test('review command rejects unknown subcommand', async () => {
  const commandReview = createReviewHarness();
  await assert.rejects(
    commandReview({}, {}, { category: 'mouse', _: ['wat'] }),
    /Unknown review subcommand: wat/,
  );
});

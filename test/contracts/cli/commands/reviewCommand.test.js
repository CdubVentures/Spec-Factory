import test from 'node:test';
import assert from 'node:assert/strict';

import { createReviewCommand } from '../../../../src/app/cli/commands/reviewCommand.js';

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
      stop: async () => {}
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

test('review command requires a subcommand', async () => {
  const commandReview = createReviewCommand(createDeps());
  await assert.rejects(
    commandReview({}, {}, { category: 'mouse', _: [] }),
    /review requires a subcommand: layout\|queue\|product\|build\|ws-queue\|override\|approve-greens\|manual-override\|finalize\|metrics\|suggest/
  );
});

test('review layout delegates to buildReviewLayout', async () => {
  const calls = [];
  const commandReview = createReviewCommand(createDeps({
    buildReviewLayout: async (payload) => {
      calls.push(payload);
      return { columns: ['identity', 'confidence'] };
    }
  }));

  const config = { name: 'config' };
  const storage = { name: 'storage' };
  const result = await commandReview(config, storage, { category: 'mouse', _: ['layout'] });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].config, config);
  assert.equal(calls[0].storage, storage);
  assert.equal(calls[0].category, 'mouse');
  assert.equal(result.command, 'review');
  assert.equal(result.action, 'layout');
  assert.deepEqual(result.columns, ['identity', 'confidence']);
});

test('review queue defaults status/limit and closes specDb', async () => {
  const queueCalls = [];
  const closeCalls = [];
  const specDb = { close: () => closeCalls.push('closed') };
  const commandReview = createReviewCommand(createDeps({
    openSpecDbForCategory: async () => specDb,
    buildReviewQueue: async (payload) => {
      queueCalls.push(payload);
      return [{ product_id: 'mouse-review-1' }];
    }
  }));

  const result = await commandReview({}, {}, { _: ['queue'] });

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].category, 'mouse');
  assert.equal(queueCalls[0].status, 'needs_review');
  assert.equal(queueCalls[0].limit, 100);
  assert.equal(queueCalls[0].specDb, specDb);
  assert.equal(closeCalls.length, 1);
  assert.equal(result.command, 'review');
  assert.equal(result.action, 'queue');
  assert.equal(result.category, 'mouse');
  assert.equal(result.status, 'needs_review');
  assert.equal(result.count, 1);
  assert.deepEqual(result.items, [{ product_id: 'mouse-review-1' }]);
});

test('review product requires --product-id', async () => {
  const commandReview = createReviewCommand(createDeps());
  await assert.rejects(
    commandReview({}, {}, { category: 'mouse', _: ['product'] }),
    /review product requires --product-id <id>/
  );
});

test('review product honors without-candidates and closes specDb', async () => {
  const productCalls = [];
  const closeCalls = [];
  const specDb = { close: () => closeCalls.push('closed') };
  const commandReview = createReviewCommand(createDeps({
    openSpecDbForCategory: async () => specDb,
    buildProductReviewPayload: async (payload) => {
      productCalls.push(payload);
      return {
        product_id: payload.productId,
        fields: {
          weight: {
            candidates: [],
            candidate_count: 2
          }
        }
      };
    }
  }));

  const result = await commandReview({}, {}, {
    category: 'mouse',
    _: ['product'],
    'product-id': 'mouse-1',
    'without-candidates': 'true'
  });

  assert.equal(productCalls.length, 1);
  assert.equal(productCalls[0].productId, 'mouse-1');
  assert.equal(productCalls[0].includeCandidates, false);
  assert.equal(productCalls[0].specDb, specDb);
  assert.equal(closeCalls.length, 1);
  assert.equal(result.command, 'review');
  assert.equal(result.action, 'product');
  assert.equal(result.category, 'mouse');
  assert.equal(result.product_id, 'mouse-1');
  assert.deepEqual(result.fields.weight.candidates, []);
});

test('review build writes product and category artifacts', async () => {
  const productCalls = [];
  const queueCalls = [];
  const commandReview = createReviewCommand(createDeps({
    writeProductReviewArtifacts: async (payload) => {
      productCalls.push(payload);
      return { product_id: payload.productId, review_field_count: 3 };
    },
    writeCategoryReviewArtifacts: async (payload) => {
      queueCalls.push(payload);
      return { queue_path: 'review/queue.json', queue_count: 12 };
    }
  }));

  const result = await commandReview({}, {}, {
    category: 'mouse',
    _: ['build'],
    'product-id': 'mouse-2'
  });

  assert.equal(productCalls.length, 1);
  assert.equal(productCalls[0].productId, 'mouse-2');
  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].status, 'needs_review');
  assert.equal(queueCalls[0].limit, 500);
  assert.equal(result.command, 'review');
  assert.equal(result.action, 'build');
  assert.equal(result.category, 'mouse');
  assert.deepEqual(result.product, { product_id: 'mouse-2', review_field_count: 3 });
  assert.deepEqual(result.queue, { queue_path: 'review/queue.json', queue_count: 12 });
});

test('review ws-queue returns websocket metadata and stops server', async () => {
  const wsCalls = [];
  const stopCalls = [];
  const originalSetTimeout = global.setTimeout;
  const commandReview = createReviewCommand(createDeps({
    startReviewQueueWebSocket: async (payload) => {
      wsCalls.push(payload);
      return {
        port: 9099,
        poll_seconds: payload.pollSeconds,
        ws_url: 'ws://127.0.0.1:9099/review/queue',
        health_url: 'http://127.0.0.1:9099/health',
        stop: async () => {
          stopCalls.push('stopped');
        }
      };
    }
  }));

  global.setTimeout = (callback, _delay, ...args) => {
    callback(...args);
    return 0;
  };

  try {
    const result = await commandReview({}, {}, {
      category: 'mouse',
      _: ['ws-queue'],
      status: 'queued',
      limit: '50',
      host: '0.0.0.0',
      port: '9090',
      'poll-seconds': '3',
      'duration-seconds': '1'
    });

    assert.equal(wsCalls.length, 1);
    assert.equal(wsCalls[0].status, 'queued');
    assert.equal(wsCalls[0].limit, 50);
    assert.equal(wsCalls[0].host, '0.0.0.0');
    assert.equal(wsCalls[0].port, 9090);
    assert.equal(wsCalls[0].pollSeconds, 3);
    assert.equal(stopCalls.length, 1);
    assert.equal(result.command, 'review');
    assert.equal(result.action, 'ws-queue');
    assert.equal(result.port, 9099);
    assert.equal(result.poll_seconds, 3);
    assert.equal(result.stop_reason, 'duration_elapsed');
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test('review manual-override requires --product-id --field --value', async () => {
  const commandReview = createReviewCommand(createDeps());
  await assert.rejects(
    commandReview({}, {}, {
      category: 'mouse',
      _: ['manual-override'],
      'product-id': 'mouse-1',
      field: 'weight'
    }),
    /review manual-override requires --product-id --field --value/
  );
});

test('review manual-override forwards evidence and closes specDb', async () => {
  const calls = [];
  const closeCalls = [];
  const specDb = { close: () => closeCalls.push('closed') };
  const commandReview = createReviewCommand(createDeps({
    parseJsonArg: (name, value, fallback) => {
      if (name === 'evidence-quote-span') {
        return JSON.parse(String(value));
      }
      return fallback;
    },
    openSpecDbForCategory: async () => specDb,
    setManualOverride: async (payload) => {
      calls.push(payload);
      return { updated: true, field: payload.field, value: payload.value };
    }
  }));

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
    'evidence-retrieved-at': '2026-03-04T00:00:00.000Z'
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].productId, 'mouse-1');
  assert.equal(calls[0].field, 'weight');
  assert.equal(calls[0].value, '59');
  assert.equal(calls[0].specDb, specDb);
  assert.deepEqual(calls[0].evidence.quote_span, { start: 1, end: 7 });
  assert.equal(calls[0].evidence.source_id, 'manufacturer_example');
  assert.equal(closeCalls.length, 1);
  assert.equal(result.command, 'review');
  assert.equal(result.action, 'manual-override');
  assert.equal(result.category, 'mouse');
  assert.equal(result.updated, true);
});

test('review metrics delegates window-hours and returns metrics payload', async () => {
  const calls = [];
  const commandReview = createReviewCommand(createDeps({
    buildReviewMetrics: async (payload) => {
      calls.push(payload);
      return {
        reviewed_products: 4,
        products_per_hour: 2,
        window_hours: payload.windowHours
      };
    }
  }));

  const result = await commandReview({}, {}, {
    category: 'mouse',
    _: ['metrics'],
    'window-hours': '12'
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].category, 'mouse');
  assert.equal(calls[0].windowHours, 12);
  assert.equal(result.command, 'review');
  assert.equal(result.action, 'metrics');
  assert.equal(result.reviewed_products, 4);
  assert.equal(result.window_hours, 12);
});

test('review suggest requires --type --field --value', async () => {
  const commandReview = createReviewCommand(createDeps());
  await assert.rejects(
    commandReview({}, {}, {
      category: 'mouse',
      _: ['suggest'],
      type: 'enum',
      field: 'switch_type'
    }),
    /review suggest requires --type --field --value/
  );
});

test('review suggest forwards payload and evidence defaults', async () => {
  const calls = [];
  const commandReview = createReviewCommand(createDeps({
    parseJsonArg: (name, value, fallback) => {
      if (name === 'evidence-quote-span') {
        return JSON.parse(String(value));
      }
      return fallback;
    },
    appendReviewSuggestion: async (payload) => {
      calls.push(payload);
      return { appended: true, type: payload.type };
    }
  }));

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
    'evidence-quote-span': '{"start":0,"end":12}'
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].category, 'mouse');
  assert.equal(calls[0].type, 'enum');
  assert.equal(calls[0].payload.product_id, 'mouse-1');
  assert.equal(calls[0].payload.field, 'switch_type');
  assert.equal(calls[0].payload.value, 'optical-v2');
  assert.equal(calls[0].payload.canonical, 'optical_v2');
  assert.deepEqual(calls[0].payload.evidence.quote_span, { start: 0, end: 12 });
  assert.equal(result.command, 'review');
  assert.equal(result.action, 'suggest');
  assert.equal(result.category, 'mouse');
  assert.equal(result.appended, true);
});

test('review command rejects unknown subcommand', async () => {
  const commandReview = createReviewCommand(createDeps());
  await assert.rejects(
    commandReview({}, {}, { category: 'mouse', _: ['wat'] }),
    /Unknown review subcommand: wat/
  );
});

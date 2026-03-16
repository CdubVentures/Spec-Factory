import test from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapRunEventIndexing } from '../src/features/indexing/orchestration/bootstrap/bootstrapRunEventIndexing.js';

test('bootstrapRunEventIndexing captures knob snapshot and records source/query index events through logger.onEvent', () => {
  const previousEvents = [];
  const mkdirCalls = [];
  const knobSnapshots = [];
  const urlVisits = [];
  const queryResults = [];
  const logger = {
    onEvent(row) {
      previousEvents.push(row);
    },
  };

  bootstrapRunEventIndexing({
    logger,
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run-123',
    env: { INDEXLAB_TEST: '1' },
    manifestDefaults: { runtime: true },
    defaultIndexLabRootFn: () => 'C:/idx-root',
    joinPathFn: (...parts) => parts.join('/'),
    mkdirSyncFn: (dirPath, options) => {
      mkdirCalls.push({ dirPath, options });
    },
    captureKnobSnapshotFn: (env, defaults) => ({ env, defaults, captured: true }),
    recordKnobSnapshotFn: (snapshot, filePath) => {
      knobSnapshots.push({ snapshot, filePath });
    },
    recordUrlVisitFn: (payload, filePath) => {
      urlVisits.push({ payload, filePath });
    },
    recordQueryResultFn: (payload, filePath) => {
      queryResults.push({ payload, filePath });
    },
  });

  logger.onEvent({
    event: 'source_processed',
    url: 'https://example.com/spec',
    host: 'example.com',
    tier: 'tier1',
    content_type: 'text/html',
    candidates: [
      { field: 'weight_g' },
      { field: 'weight_g' },
      { field: 'shape' },
      { field: '' },
    ],
    outcome: 'ok',
  });
  logger.onEvent({
    event: 'discovery_query_completed',
    query: 'example mouse weight',
    provider: 'serpapi',
    result_count: 7,
  });

  assert.deepEqual(knobSnapshots, [
    {
      snapshot: {
        env: { INDEXLAB_TEST: '1' },
        defaults: { runtime: true },
        captured: true,
      },
      filePath: 'C:/idx-root/mouse/knob-snapshots.ndjson',
    },
  ]);
  assert.deepEqual(urlVisits, [
    {
      payload: {
        url: 'https://example.com/spec',
        host: 'example.com',
        tier: 'tier1',
        doc_kind: 'text/html',
        fields_filled: ['weight_g', 'shape'],
        fetch_success: true,
        run_id: 'run-123',
      },
      filePath: 'C:/idx-root/mouse/url-index.ndjson',
    },
  ]);
  assert.deepEqual(queryResults, [
    {
      payload: {
        query: 'example mouse weight',
        provider: 'serpapi',
        result_count: 7,
        field_yield: null,
        run_id: 'run-123',
        category: 'mouse',
        product_id: 'mouse-product',
      },
      filePath: 'C:/idx-root/mouse/query-index.ndjson',
    },
  ]);
  assert.deepEqual(previousEvents, [
    {
      event: 'source_processed',
      url: 'https://example.com/spec',
      host: 'example.com',
      tier: 'tier1',
      content_type: 'text/html',
      candidates: [
        { field: 'weight_g' },
        { field: 'weight_g' },
        { field: 'shape' },
        { field: '' },
      ],
      outcome: 'ok',
    },
    {
      event: 'discovery_query_completed',
      query: 'example mouse weight',
      provider: 'serpapi',
      result_count: 7,
    },
  ]);
  assert.deepEqual(mkdirCalls, [
    { dirPath: 'C:/idx-root/mouse', options: { recursive: true } },
    { dirPath: 'C:/idx-root/mouse', options: { recursive: true } },
    { dirPath: 'C:/idx-root/mouse', options: { recursive: true } },
  ]);
});

test('bootstrapRunEventIndexing swallows knob and event index failures', () => {
  const logger = {
    onEvent() {
      throw new Error('previous handler failed');
    },
  };

  assert.doesNotThrow(() => {
    bootstrapRunEventIndexing({
      logger,
      category: 'mouse',
      productId: 'mouse-product',
      runId: 'run-123',
      defaultIndexLabRootFn: () => 'C:/idx-root',
      joinPathFn: (...parts) => parts.join('/'),
      mkdirSyncFn: () => {
        throw new Error('mkdir failed');
      },
      captureKnobSnapshotFn: () => {
        throw new Error('snapshot failed');
      },
      recordKnobSnapshotFn: () => {
        throw new Error('record snapshot failed');
      },
      recordUrlVisitFn: () => {
        throw new Error('record url failed');
      },
      recordQueryResultFn: () => {
        throw new Error('record query failed');
      },
    });

    logger.onEvent({
      event: 'source_processed',
      url: 'https://example.com/spec',
    });
    logger.onEvent({
      event: 'discovery_query_completed',
      query: 'example mouse weight',
    });
  });
});

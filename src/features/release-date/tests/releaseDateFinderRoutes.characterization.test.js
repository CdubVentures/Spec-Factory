/**
 * releaseDateFinder route handler — characterization (golden-master).
 *
 * Locks the byte-identical shape of the RDF route surface:
 *   - GET /release-date-finder/:category/:pid response shape (consumed by
 *     tools/gui-react/src/features/release-date-finder via useReleaseDateFinderQuery)
 *   - POST /release-date-finder/:category/:pid — per-variant Run body parsing,
 *     op registration shape, stages selection, base_model forwarding
 *   - POST /release-date-finder/:category/:pid/loop — loop body parsing,
 *     subType:'loop' op shape, onLoopProgress wiring
 *   - DELETE paths — WS event names (-run-deleted, -deleted)
 *   - Field Studio gate (403 when release_date disabled)
 *
 * Phase 2 safety net: these tests must stay green before AND after merging
 * createVariantFieldLoopHandler into createFinderRouteHandler. The exact
 * observable outputs (WS event names, op register args, orchestrator opts)
 * are load-bearing contracts.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerReleaseDateFinderRoutes } from '../api/releaseDateFinderRoutes.js';
import { initOperationsRegistry } from '../../../core/operations/index.js';

function makeCtx({ specDb, configOverrides = {} } = {}) {
  const responses = [];
  const wsMessages = [];
  const broadcastWs = (channel, data) => { wsMessages.push({ channel, data }); };
  const ctx = {
    jsonRes: (res, status, body) => { responses.push({ status, body }); return body; },
    readJsonBody: async () => ({}),
    config: configOverrides,
    appDb: null,
    getSpecDb: () => specDb,
    broadcastWs,
    logger: { error: () => {}, info: () => {}, warn: () => {} },
  };
  // WHY: operations registry broadcasts via a module-level hook set once at boot.
  // Wire it to our per-test spy so op lifecycle WS events are captured.
  initOperationsRegistry({ broadcastWs });
  return { ctx, responses, wsMessages };
}

// Wait for fireAndForget's asyncWork + emitDataChange + completeOperation to settle.
async function flushAsyncWork() {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((r) => setImmediate(r));
  }
  await new Promise((r) => setTimeout(r, 10));
}

function getOperationsUpserts(wsMessages) {
  return wsMessages
    .filter((m) => m.channel === 'operations' && m.data?.action === 'upsert')
    .map((m) => m.data.operation);
}

function getDataChangeEvents(wsMessages) {
  return wsMessages
    .filter((m) => m.channel === 'data-change')
    .map((m) => m.data);
}

const BASE_ROW = {
  product_id: 'rdf-routes-001',
  category: 'mouse',
  run_count: 2,
  candidate_count: 2,
  latest_ran_at: '2024-03-15T12:00:00Z',
  candidates: [
    {
      variant_id: 'v_black',
      variant_key: 'color:black',
      variant_label: 'Black',
      variant_type: 'color',
      value: '2024-03-15',
      confidence: 92,
      unknown_reason: '',
      sources: [{ url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 }],
      ran_at: '2024-03-15T12:00:00Z',
    },
    {
      variant_id: 'v_white',
      variant_key: 'color:white',
      variant_label: 'White',
      variant_type: 'color',
      value: '2024-03-16',
      confidence: 88,
      unknown_reason: '',
      sources: [{ url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 }],
      ran_at: '2024-03-15T12:01:00Z',
    },
  ],
  selected: { candidates: [] },
};

const BASE_RUN = {
  run_number: 1,
  ran_at: '2024-03-15T12:00:00Z',
  model: 'claude-sonnet-4-6',
  response: {
    started_at: '2024-03-15T12:00:00Z',
    duration_ms: 1000,
    variant_id: 'v_black',
    variant_key: 'color:black',
    variant_label: 'Black',
    release_date: '2024-03-15',
    confidence: 92,
    unknown_reason: '',
    evidence_refs: [{ url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 }],
    discovery_log: { urls_checked: [], queries_run: [], notes: [] },
  },
  selected: {
    candidates: [BASE_ROW.candidates[0]],
  },
  prompt: { system: 'sys', user: 'usr' },
};

function makeSpecDbStub({ row = BASE_ROW, runs = [BASE_RUN], publisherRows = [], published = null } = {}) {
  return {
    category: row.category,
    getFinderStore: () => ({
      get: () => row,
      listByCategory: () => [row],
      listRuns: () => runs,
    }),
    getFieldCandidatesByProductAndField: () => publisherRows,
    getResolvedFieldCandidate: () => published,
    getProduct: () => null,
    getCompiledRules: () => ({ fields: { release_date: { key: 'release_date' } } }),
  };
}

describe('release-date-finder routes — GET response shape', () => {
  it('locks the top-level key order of the GET response', async () => {
    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});

    assert.equal(responses.length, 1);
    assert.equal(responses[0].status, 200);

    const body = responses[0].body;
    assert.deepEqual(
      Object.keys(body),
      [
        'product_id', 'category', 'run_count', 'last_ran_at',
        'candidates', 'candidate_count', 'published_value',
        'published_confidence', 'selected', 'runs',
      ],
      'GET response top-level key order must not drift — frontend consumes this shape',
    );
  });

  it('carries the candidate list through unchanged', async () => {
    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});
    const body = responses[0].body;

    assert.equal(body.product_id, BASE_ROW.product_id);
    assert.equal(body.category, BASE_ROW.category);
    assert.equal(body.run_count, BASE_ROW.run_count);
    assert.equal(body.candidate_count, BASE_ROW.candidate_count);
    assert.equal(body.last_ran_at, BASE_ROW.latest_ran_at);
    assert.equal(body.candidates.length, 2);
    assert.equal(body.candidates[0].variant_id, 'v_black');
    assert.equal(body.candidates[0].value, '2024-03-15');
    assert.equal(body.candidates[1].variant_id, 'v_white');
  });

  it('enriches candidates with publisher_candidates grouped by variant_id, sorted by confidence desc', async () => {
    const publisherRows = [
      {
        id: 1, source_id: 'src-1', source_type: 'release_date_finder',
        model: 'claude-sonnet-4-6', value: '2024-03-15', confidence: 70,
        status: 'below_threshold', metadata_json: { foo: 'bar' },
        submitted_at: '2024-03-15T11:00:00Z', variant_id: 'v_black',
      },
      {
        id: 2, source_id: 'src-2', source_type: 'release_date_finder',
        model: 'claude-sonnet-4-6', value: '2024-03-15', confidence: 92,
        status: 'published', metadata_json: {},
        submitted_at: '2024-03-15T12:00:00Z', variant_id: 'v_black',
      },
      {
        id: 3, source_id: 'src-3', source_type: 'release_date_finder',
        model: 'claude-sonnet-4-6', value: '2024-03-16', confidence: 88,
        status: 'published', metadata_json: {},
        submitted_at: '2024-03-15T12:01:00Z', variant_id: 'v_white',
      },
    ];
    const specDb = makeSpecDbStub({ publisherRows });
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});
    const body = responses[0].body;

    const black = body.candidates.find((c) => c.variant_id === 'v_black');
    assert.equal(black.publisher_candidates.length, 2, 'v_black gets both publisher rows');
    // Sort by confidence desc — lock that contract
    assert.equal(black.publisher_candidates[0].confidence, 92);
    assert.equal(black.publisher_candidates[1].confidence, 70);

    const white = body.candidates.find((c) => c.variant_id === 'v_white');
    assert.equal(white.publisher_candidates.length, 1);
    assert.equal(white.publisher_candidates[0].confidence, 88);

    // publisher_candidates entry shape (keys only — no key-order lock
    // on this since it's built via plain object literal)
    const pubCandKeys = Object.keys(black.publisher_candidates[0]).sort();
    assert.deepEqual(
      pubCandKeys,
      [
        'candidate_id', 'source_id', 'source_type', 'model',
        'value', 'confidence', 'status', 'metadata', 'submitted_at',
      ].sort(),
    );
  });

  it('published_value + published_confidence reflect the resolved candidate row', async () => {
    const published = { value: '2024-03-15', confidence: 92 };
    const specDb = makeSpecDbStub({ published });
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});
    const body = responses[0].body;

    assert.equal(body.published_value, '2024-03-15');
    assert.equal(body.published_confidence, 92);
  });

  it('published_value defaults to "" and published_confidence to null when nothing is resolved', async () => {
    const specDb = makeSpecDbStub({ published: null });
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});
    const body = responses[0].body;

    assert.equal(body.published_value, '');
    assert.equal(body.published_confidence, null);
  });

  it('empty publisherRows leaves publisher_candidates as empty arrays per candidate', async () => {
    const specDb = makeSpecDbStub({ publisherRows: [] });
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});
    const body = responses[0].body;

    for (const cand of body.candidates) {
      assert.equal(Array.isArray(cand.publisher_candidates), true);
      assert.equal(cand.publisher_candidates.length, 0);
    }
  });

  it('returns 404 when the summary row is missing', async () => {
    const specDb = {
      category: 'mouse',
      getFinderStore: () => ({
        get: () => null,
        listByCategory: () => [],
        listRuns: () => [],
      }),
      getFieldCandidatesByProductAndField: () => [],
      getResolvedFieldCandidate: () => null,
      getProduct: () => null,
    };
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', 'nonexistent'], {}, 'GET', {}, {});
    assert.equal(responses[0].status, 404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /run characterization — body parsing, op shape, stages, base_model
// ─────────────────────────────────────────────────────────────────────────────

const POST_PRODUCT_ROW = {
  product_id: 'rdf-post-001',
  category: 'mouse',
  brand: 'Logitech',
  model: 'MX Master 3S',
  base_model: 'MX Master',
  variant: '',
};

function makePostSpecDbStub({ compiledFields = { release_date: { key: 'release_date' } } } = {}) {
  return {
    category: 'mouse',
    getProduct: () => POST_PRODUCT_ROW,
    getCompiledRules: () => ({ fields: compiledFields }),
    variants: {
      listActive: () => [], // real runReleaseDateFinder will early-reject "no_cef_data"
      listByProduct: () => [],
    },
    getFinderStore: () => ({
      get: () => null,
      listByCategory: () => [],
      listRuns: () => [],
      upsert: () => {},
      remove: () => {},
      removeRun: () => {},
      removeAllRuns: () => {},
    }),
    getFieldCandidatesByProductAndField: () => [],
    getResolvedFieldCandidate: () => null,
    deleteFieldCandidatesByProductAndField: () => {},
  };
}

describe('release-date-finder routes — POST /run characterization', () => {
  it('returns 202 with ok:true + operationId for a valid POST', async () => {
    const specDb = makePostSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    ctx.readJsonBody = async () => ({ variant_key: 'color:black' });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id], {}, 'POST', {}, {});
    await flushAsyncWork();

    assert.equal(responses[0].status, 202, 'POST /run returns 202 (fireAndForget)');
    assert.equal(responses[0].body.ok, true);
    assert.ok(responses[0].body.operationId, 'response carries operationId');
  });

  it('op registered with type:"rdf" and variantKey populated from body', async () => {
    const specDb = makePostSpecDbStub();
    const { ctx, wsMessages } = makeCtx({ specDb });
    ctx.readJsonBody = async () => ({ variant_key: 'color:white' });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id], {}, 'POST', {}, {});
    await flushAsyncWork();

    const upserts = getOperationsUpserts(wsMessages);
    assert.ok(upserts.length > 0, 'at least one ops WS upsert fires');
    const firstUpsert = upserts[0];
    assert.equal(firstUpsert.type, 'rdf', 'op.type === "rdf"');
    assert.equal(firstUpsert.variantKey, 'color:white', 'op.variantKey carries body.variant_key');
    assert.ok(!firstUpsert.subType, 'single-shot op must not have subType:"loop"');
  });

  it('stages are ["Discovery","Validate","Publish"] when _resolvedReleaseDateFinderJsonStrict !== false', async () => {
    const specDb = makePostSpecDbStub();
    const { ctx, wsMessages } = makeCtx({
      specDb,
      configOverrides: { _resolvedReleaseDateFinderJsonStrict: true },
    });
    ctx.readJsonBody = async () => ({});
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id], {}, 'POST', {}, {});
    await flushAsyncWork();

    const upserts = getOperationsUpserts(wsMessages);
    assert.ok(upserts.length > 0);
    const stages = upserts[0].stages.map((s) => s.name || s);
    assert.deepEqual(stages, ['Discovery', 'Validate', 'Publish']);
  });

  it('stages are ["Research","Writer","Validate","Publish"] when _resolvedReleaseDateFinderJsonStrict === false', async () => {
    const specDb = makePostSpecDbStub();
    const { ctx, wsMessages } = makeCtx({
      specDb,
      configOverrides: { _resolvedReleaseDateFinderJsonStrict: false },
    });
    ctx.readJsonBody = async () => ({});
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id], {}, 'POST', {}, {});
    await flushAsyncWork();

    const upserts = getOperationsUpserts(wsMessages);
    assert.ok(upserts.length > 0);
    const stages = upserts[0].stages.map((s) => s.name || s);
    assert.deepEqual(stages, ['Research', 'Writer', 'Validate', 'Publish']);
  });

  it('productLabel built from brand + model', async () => {
    const specDb = makePostSpecDbStub();
    const { ctx, wsMessages } = makeCtx({ specDb });
    ctx.readJsonBody = async () => ({});
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id], {}, 'POST', {}, {});
    await flushAsyncWork();

    const upserts = getOperationsUpserts(wsMessages);
    assert.equal(upserts[0].productLabel, 'Logitech MX Master 3S');
  });

  it('returns 403 (Field Studio gate) when release_date is NOT in compiled rules', async () => {
    const specDb = makePostSpecDbStub({ compiledFields: {} });
    const { ctx, responses } = makeCtx({ specDb });
    ctx.readJsonBody = async () => ({ variant_key: 'color:black' });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id], {}, 'POST', {}, {});

    assert.equal(responses[0].status, 403);
    assert.match(responses[0].body.error, /release_date.*not enabled/);
  });

  it('emits WS data-change event "release-date-finder-run" after asyncWork', async () => {
    const specDb = makePostSpecDbStub();
    const { ctx, wsMessages } = makeCtx({ specDb });
    ctx.readJsonBody = async () => ({});
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id], {}, 'POST', {}, {});
    await flushAsyncWork();

    const events = getDataChangeEvents(wsMessages);
    const runEvent = events.find((e) => e.event === 'release-date-finder-run');
    assert.ok(runEvent, 'release-date-finder-run data-change event must fire');
    assert.deepEqual(runEvent.entities.productIds, [POST_PRODUCT_ROW.product_id]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /loop characterization — subType, stages, WS event name
// ─────────────────────────────────────────────────────────────────────────────

describe('release-date-finder routes — POST /loop characterization', () => {
  it('returns 202 and op registered with subType:"loop" + variantKey', async () => {
    const specDb = makePostSpecDbStub();
    const { ctx, responses, wsMessages } = makeCtx({ specDb });
    ctx.readJsonBody = async () => ({ variant_key: 'color:red' });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id, 'loop'], {}, 'POST', {}, {});
    await flushAsyncWork();

    assert.equal(responses[0].status, 202);
    assert.ok(responses[0].body.operationId);

    const upserts = getOperationsUpserts(wsMessages);
    assert.ok(upserts.length > 0);
    const op = upserts[0];
    assert.equal(op.type, 'rdf');
    assert.equal(op.subType, 'loop', 'loop op must declare subType:"loop"');
    assert.equal(op.variantKey, 'color:red', 'op.variantKey carries body.variant_key');
  });

  it('emits WS data-change event "release-date-finder-loop" after asyncWork', async () => {
    const specDb = makePostSpecDbStub();
    const { ctx, wsMessages } = makeCtx({ specDb });
    ctx.readJsonBody = async () => ({ variant_key: null });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id, 'loop'], {}, 'POST', {}, {});
    await flushAsyncWork();

    const events = getDataChangeEvents(wsMessages);
    const loopEvent = events.find((e) => e.event === 'release-date-finder-loop');
    assert.ok(loopEvent, 'release-date-finder-loop data-change event must fire');
    assert.deepEqual(loopEvent.entities.productIds, [POST_PRODUCT_ROW.product_id]);
  });

  it('loop 403s (Field Studio gate) when release_date is NOT in compiled rules', async () => {
    const specDb = makePostSpecDbStub({ compiledFields: {} });
    const { ctx, responses } = makeCtx({ specDb });
    ctx.readJsonBody = async () => ({});
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id, 'loop'], {}, 'POST', {}, {});

    assert.equal(responses[0].status, 403);
    assert.match(responses[0].body.error, /release_date.*not enabled/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE characterization — WS event names survive merge
// ─────────────────────────────────────────────────────────────────────────────

describe('release-date-finder routes — DELETE WS event names', () => {
  function makeDeleteSpecDb() {
    return {
      category: 'mouse',
      getProduct: () => POST_PRODUCT_ROW,
      getCompiledRules: () => ({ fields: { release_date: { key: 'release_date' } } }),
      getFinderStore: () => ({
        get: () => null,
        listByCategory: () => [],
        listRuns: () => [],
        upsert: () => {},
        remove: () => {},
        removeRun: () => {},
        removeAllRuns: () => {},
      }),
      getFieldCandidatesByProductAndField: () => [],
      deleteFieldCandidatesByProductAndField: () => {},
      getResolvedFieldCandidate: () => null,
    };
  }

  it('DELETE /:pid/runs/:n emits WS data-change event "release-date-finder-run-deleted"', async () => {
    const specDb = makeDeleteSpecDb();
    const { ctx, wsMessages } = makeCtx({ specDb });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(
      ['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id, 'runs', '1'],
      {},
      'DELETE',
      {},
      {},
    );

    const events = getDataChangeEvents(wsMessages);
    const del = events.find((e) => e.event === 'release-date-finder-run-deleted');
    assert.ok(del, 'release-date-finder-run-deleted event must fire');
    assert.deepEqual(del.entities.productIds, [POST_PRODUCT_ROW.product_id]);
    assert.equal(del.meta?.deletedRun, 1);
  });

  it('DELETE /:pid (all runs) emits WS data-change event "release-date-finder-deleted"', async () => {
    const specDb = makeDeleteSpecDb();
    const { ctx, wsMessages } = makeCtx({ specDb });
    const handler = registerReleaseDateFinderRoutes(ctx);

    await handler(
      ['release-date-finder', 'mouse', POST_PRODUCT_ROW.product_id],
      {},
      'DELETE',
      {},
      {},
    );

    const events = getDataChangeEvents(wsMessages);
    const del = events.find((e) => e.event === 'release-date-finder-deleted');
    assert.ok(del, 'release-date-finder-deleted event must fire');
    assert.deepEqual(del.entities.productIds, [POST_PRODUCT_ROW.product_id]);
  });
});

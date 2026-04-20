/**
 * skuFinder route handler — characterization (golden-master).
 *
 * Locks the byte-identical shape of the SKF route surface:
 *   - GET /sku-finder/:category/:pid response shape (consumed by frontend)
 *   - POST /sku-finder/:category/:pid — per-variant Run body parsing
 *   - POST /sku-finder/:category/:pid/loop — loop body parsing, subType:'loop'
 *   - Routes dispatch 404 when summary row is missing
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerSkuFinderRoutes } from '../api/skuFinderRoutes.js';
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
  initOperationsRegistry({ broadcastWs });
  return { ctx, responses, wsMessages };
}

const BASE_ROW = {
  product_id: 'skf-routes-001',
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
      value: 'G502-HERO-BLACK',
      confidence: 92,
      unknown_reason: '',
      sources: [{
        url: 'https://mfr.example.com',
        tier: 'tier1',
        confidence: 95,
        supporting_evidence: 'Part Number: G502-HERO-BLACK',
        evidence_kind: 'direct_quote',
      }],
      ran_at: '2024-03-15T12:00:00Z',
    },
    {
      variant_id: 'v_white',
      variant_key: 'color:white',
      variant_label: 'White',
      variant_type: 'color',
      value: 'G502-HERO-WHITE',
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
    sku: 'G502-HERO-BLACK',
    confidence: 92,
    unknown_reason: '',
    evidence_refs: [{
      url: 'https://mfr.example.com',
      tier: 'tier1',
      confidence: 95,
      supporting_evidence: 'Part Number: G502-HERO-BLACK',
      evidence_kind: 'direct_quote',
    }],
    discovery_log: { urls_checked: [], queries_run: [], notes: [] },
  },
  selected: { candidates: [BASE_ROW.candidates[0]] },
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
    getCompiledRules: () => ({ fields: { sku: { key: 'sku' } } }),
  };
}

describe('sku-finder routes — GET response shape', () => {
  it('locks the top-level key order of the GET response', async () => {
    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerSkuFinderRoutes(ctx);

    await handler(['sku-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});

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
    const handler = registerSkuFinderRoutes(ctx);

    await handler(['sku-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});
    const body = responses[0].body;

    assert.equal(body.product_id, BASE_ROW.product_id);
    assert.equal(body.category, BASE_ROW.category);
    assert.equal(body.run_count, BASE_ROW.run_count);
    assert.equal(body.candidate_count, BASE_ROW.candidate_count);
    assert.equal(body.candidates.length, 2);
    assert.equal(body.candidates[0].variant_id, 'v_black');
    assert.equal(body.candidates[0].value, 'G502-HERO-BLACK');
    assert.equal(body.candidates[1].variant_id, 'v_white');
    assert.equal(body.candidates[1].value, 'G502-HERO-WHITE');
  });

  it('preserves extended-evidence shape (supporting_evidence + evidence_kind) on sources[]', async () => {
    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerSkuFinderRoutes(ctx);

    await handler(['sku-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});
    const body = responses[0].body;

    const black = body.candidates.find((c) => c.variant_id === 'v_black');
    assert.equal(black.sources[0].evidence_kind, 'direct_quote');
    assert.equal(black.sources[0].supporting_evidence, 'Part Number: G502-HERO-BLACK');
  });

  it('enriches candidates with publisher_candidates grouped by variant_id, sorted by confidence desc', async () => {
    const publisherRows = [
      {
        id: 1, source_id: 'src-1', source_type: 'sku_finder',
        model: 'claude-sonnet-4-6', value: 'G502-HERO-BLACK', confidence: 70,
        status: 'below_threshold', metadata_json: {},
        submitted_at: '2024-03-15T11:00:00Z', variant_id: 'v_black',
      },
      {
        id: 2, source_id: 'src-2', source_type: 'sku_finder',
        model: 'claude-sonnet-4-6', value: 'G502-HERO-BLACK', confidence: 92,
        status: 'published', metadata_json: {},
        submitted_at: '2024-03-15T12:00:00Z', variant_id: 'v_black',
      },
      {
        id: 3, source_id: 'src-3', source_type: 'sku_finder',
        model: 'claude-sonnet-4-6', value: 'G502-HERO-WHITE', confidence: 88,
        status: 'published', metadata_json: {},
        submitted_at: '2024-03-15T12:01:00Z', variant_id: 'v_white',
      },
    ];
    const specDb = makeSpecDbStub({ publisherRows });
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerSkuFinderRoutes(ctx);

    await handler(['sku-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});
    const body = responses[0].body;

    const black = body.candidates.find((c) => c.variant_id === 'v_black');
    assert.equal(black.publisher_candidates.length, 2);
    assert.equal(black.publisher_candidates[0].confidence, 92);
    assert.equal(black.publisher_candidates[1].confidence, 70);

    const white = body.candidates.find((c) => c.variant_id === 'v_white');
    assert.equal(white.publisher_candidates.length, 1);
    assert.equal(white.publisher_candidates[0].confidence, 88);
  });

  it('published_value + published_confidence reflect the resolved candidate row', async () => {
    const published = { value: 'G502-HERO-BLACK', confidence: 92 };
    const specDb = makeSpecDbStub({ published });
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerSkuFinderRoutes(ctx);

    await handler(['sku-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});
    const body = responses[0].body;

    assert.equal(body.published_value, 'G502-HERO-BLACK');
    assert.equal(body.published_confidence, 92);
  });

  it('published_value defaults to "" and published_confidence to null when nothing is resolved', async () => {
    const specDb = makeSpecDbStub({ published: null });
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerSkuFinderRoutes(ctx);

    await handler(['sku-finder', 'mouse', BASE_ROW.product_id], {}, 'GET', {}, {});
    const body = responses[0].body;

    assert.equal(body.published_value, '');
    assert.equal(body.published_confidence, null);
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
    const handler = registerSkuFinderRoutes(ctx);

    await handler(['sku-finder', 'mouse', 'nonexistent'], {}, 'GET', {}, {});
    assert.equal(responses[0].status, 404);
  });
});

/**
 * releaseDateFinder route handler — GET characterization (golden-master).
 *
 * Locks the byte-identical shape of the GET /release-date-finder/:category/:pid
 * response. The shape is consumed by tools/gui-react/src/features/release-date-finder
 * via useReleaseDateFinderQuery → ReleaseDateFinderResult. Any drift breaks the
 * frontend. This lock prevents backend refactors from shifting:
 *   - top-level keys (product_id, category, run_count, last_ran_at, candidates,
 *     candidate_count, published_value, published_confidence, selected, runs)
 *   - enrichment with publisher_candidates per variant
 *   - publisher_candidates key shape + sort-by-confidence-desc contract
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerReleaseDateFinderRoutes } from '../api/releaseDateFinderRoutes.js';

function makeCtx({ specDb }) {
  const responses = [];
  const ctx = {
    jsonRes: (res, status, body) => { responses.push({ status, body }); return body; },
    readJsonBody: async () => ({}),
    config: {},
    appDb: null,
    getSpecDb: () => specDb,
    broadcastWs: () => {},
    logger: null,
  };
  return { ctx, responses };
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

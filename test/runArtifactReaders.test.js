import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNeedSetFromEvents,
  pickSearchQueryFromUrl,
  pickSearchQueryFromEvent,
  buildSearchProfileFromEvents,
  createRunArtifactReaders,
} from '../src/features/indexing/api/builders/runArtifactReaders.js';

// ---------------------------------------------------------------------------
// Pure helper: buildNeedSetFromEvents
// ---------------------------------------------------------------------------

test('buildNeedSetFromEvents: empty events → empty fallback', () => {
  const result = buildNeedSetFromEvents({}, []);
  assert.deepStrictEqual(result.fields, []);
  assert.equal(result.total_fields, 0);
  assert.equal(result.field_count, 0);
  assert.equal(result.source, 'empty_fallback');
});

test('buildNeedSetFromEvents: picks needset_computed event', () => {
  const events = [
    { event: 'fetch_started', payload: {} },
    {
      event: 'needset_computed',
      ts: '2026-01-01T00:00:00Z',
      payload: {
        fields: [
          { field_key: 'weight', state: 'missing' },
          { field_key: 'sensor', state: 'weak' },
        ],
        total_fields: 40,
        pending_fields: 5,
        unresolved_fields: 3,
      },
    },
  ];
  const result = buildNeedSetFromEvents({}, events);
  assert.equal(result.fields.length, 2);
  assert.equal(result.fields[0].field_key, 'weight');
  assert.equal(result.total_fields, 40);
  assert.equal(result.field_count, 40);
  assert.equal(result.pending_fields, 5);
  assert.equal(result.unresolved_fields, 3);
  assert.equal(result.source, 'events_fallback');
  assert.equal(result.generated_at, '2026-01-01T00:00:00Z');
});

test('buildNeedSetFromEvents: missing payload → graceful fallback', () => {
  const events = [{ event: 'needset_computed' }];
  const result = buildNeedSetFromEvents({}, events);
  assert.deepStrictEqual(result.fields, []);
  assert.equal(result.total_fields, 0);
  assert.equal(result.source, 'events_fallback');
});

test('buildNeedSetFromEvents: multiple needset_computed → picks last', () => {
  const events = [
    {
      event: 'needset_computed',
      ts: '2026-01-01T00:00:00Z',
      payload: { fields: [{ field_key: 'a', state: 'missing' }], total_fields: 10 },
    },
    {
      event: 'needset_computed',
      ts: '2026-01-01T00:01:00Z',
      payload: { fields: [{ field_key: 'b', state: 'missing' }, { field_key: 'c', state: 'weak' }], total_fields: 20 },
    },
  ];
  const result = buildNeedSetFromEvents({}, events);
  assert.equal(result.fields.length, 2);
  assert.equal(result.fields[0].field_key, 'b');
  assert.equal(result.total_fields, 20);
});

test('buildNeedSetFromEvents: uses meta timestamps when event ts is missing', () => {
  const events = [
    { event: 'needset_computed', payload: { needs: [] } },
  ];
  const result = buildNeedSetFromEvents({ ended_at: '2026-02-01T00:00:00Z' }, events);
  assert.equal(result.generated_at, '2026-02-01T00:00:00Z');
});

// ---------------------------------------------------------------------------
// Pure helper: pickSearchQueryFromUrl
// ---------------------------------------------------------------------------

test('pickSearchQueryFromUrl: empty → empty string', () => {
  assert.equal(pickSearchQueryFromUrl(''), '');
  assert.equal(pickSearchQueryFromUrl(null), '');
  assert.equal(pickSearchQueryFromUrl(undefined), '');
});

test('pickSearchQueryFromUrl: valid URL with q param', () => {
  assert.equal(
    pickSearchQueryFromUrl('https://google.com/search?q=razer+viper'),
    'razer viper'
  );
});

test('pickSearchQueryFromUrl: query param', () => {
  assert.equal(
    pickSearchQueryFromUrl('https://example.com/search?query=logitech+g+pro'),
    'logitech g pro'
  );
});

test('pickSearchQueryFromUrl: k/wd/ntt params', () => {
  assert.equal(
    pickSearchQueryFromUrl('https://example.com/search?k=mouse+pad'),
    'mouse pad'
  );
  assert.equal(
    pickSearchQueryFromUrl('https://example.com/search?wd=keyboard'),
    'keyboard'
  );
  assert.equal(
    pickSearchQueryFromUrl('https://example.com/search?ntt=monitor'),
    'monitor'
  );
});

test('pickSearchQueryFromUrl: invalid URL → empty string', () => {
  assert.equal(pickSearchQueryFromUrl('not a url'), '');
});

test('pickSearchQueryFromUrl: no matching param → empty string', () => {
  assert.equal(pickSearchQueryFromUrl('https://example.com/page?foo=bar'), '');
});

// ---------------------------------------------------------------------------
// Pure helper: pickSearchQueryFromEvent
// ---------------------------------------------------------------------------

test('pickSearchQueryFromEvent: direct query field', () => {
  assert.equal(pickSearchQueryFromEvent({ query: 'direct query' }), 'direct query');
});

test('pickSearchQueryFromEvent: payload.query', () => {
  assert.equal(
    pickSearchQueryFromEvent({ payload: { query: 'payload query' } }),
    'payload query'
  );
});

test('pickSearchQueryFromEvent: payload.search_query', () => {
  assert.equal(
    pickSearchQueryFromEvent({ payload: { search_query: 'search query' } }),
    'search query'
  );
});

test('pickSearchQueryFromEvent: falls back to URL extraction', () => {
  assert.equal(
    pickSearchQueryFromEvent({ payload: { url: 'https://google.com/search?q=url+fallback' } }),
    'url fallback'
  );
});

test('pickSearchQueryFromEvent: empty → empty string', () => {
  assert.equal(pickSearchQueryFromEvent({}), '');
  assert.equal(pickSearchQueryFromEvent(), '');
});

// ---------------------------------------------------------------------------
// Pure helper: buildSearchProfileFromEvents
// ---------------------------------------------------------------------------

test('buildSearchProfileFromEvents: empty events → null', () => {
  assert.equal(buildSearchProfileFromEvents({}, []), null);
});

test('buildSearchProfileFromEvents: search events → query map', () => {
  const events = [
    { event: 'search_started', payload: { query: 'mouse review' } },
    { event: 'search_finished', payload: { query: 'mouse review', result_count: 10 } },
  ];
  const result = buildSearchProfileFromEvents(
    { ended_at: '2026-01-01T00:00:00Z' },
    events
  );
  assert.ok(result);
  assert.equal(result.query_count, 1);
  assert.equal(result.queries.length, 1);
  assert.equal(result.queries[0].query, 'mouse review');
  assert.equal(result.queries[0].result_count, 10);
  assert.equal(result.queries[0].attempts, 1);
  assert.equal(result.source, 'events_fallback');
});

test('buildSearchProfileFromEvents: caps at 80 queries', () => {
  const events = [];
  for (let i = 0; i < 100; i++) {
    events.push({ event: 'search_started', payload: { query: `query-${i}` } });
  }
  const result = buildSearchProfileFromEvents({}, events);
  assert.ok(result);
  assert.equal(result.queries.length, 80);
  assert.equal(result.query_count, 80);
});

test('buildSearchProfileFromEvents: aggregates providers', () => {
  const events = [
    { event: 'search_started', payload: { query: 'test', provider: 'google' } },
    { event: 'search_finished', payload: { query: 'test', provider: 'bing', result_count: 5 } },
  ];
  const result = buildSearchProfileFromEvents({}, events);
  assert.ok(result);
  assert.equal(result.queries[0].providers.length, 2);
  assert.ok(result.queries[0].providers.includes('google'));
  assert.ok(result.queries[0].providers.includes('bing'));
});

test('buildSearchProfileFromEvents: counts attempts and results', () => {
  const events = [
    { event: 'search_started', payload: { query: 'test' } },
    { event: 'search_started', payload: { query: 'test' } },
    { event: 'search_finished', payload: { query: 'test', result_count: 5 } },
    { event: 'search_finished', payload: { query: 'test', result_count: 3 } },
  ];
  const result = buildSearchProfileFromEvents({}, events);
  assert.ok(result);
  assert.equal(result.queries[0].attempts, 2);
  assert.equal(result.queries[0].result_count, 8);
});

// ---------------------------------------------------------------------------
// Factory: createRunArtifactReaders — stubs
// ---------------------------------------------------------------------------

function makeReaders(overrides = {}) {
  return createRunArtifactReaders({
    resolveRunDir: async () => '/fake/run',
    readMeta: async () => ({ run_id: 'run-1', category: 'mouse' }),
    readEvents: async () => [],
    resolveProductId: () => 'mouse-test',
    resolveContext: async () => ({
      token: 'run-1',
      runDir: '/fake',
      meta: { run_id: 'run-1', category: 'mouse' },
      category: 'mouse',
      resolvedRunId: 'run-1',
      productId: 'mouse-test',
    }),
    getStorage: () => ({
      resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
      resolveInputKey: (...parts) => parts.filter(Boolean).join('/'),
      readJsonOrNull: async () => null,
    }),
    readOutputRootJson: async () => null,
    getOutputRoot: () => '/fake/output',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Factory: readIndexLabRunNeedSet
// ---------------------------------------------------------------------------

test('readIndexLabRunNeedSet: empty runId → null', async () => {
  const readers = makeReaders();
  assert.equal(await readers.readIndexLabRunNeedSet(''), null);
  assert.equal(await readers.readIndexLabRunNeedSet(null), null);
});

test('readIndexLabRunNeedSet: no run dir → null', async () => {
  const readers = makeReaders({ resolveRunDir: async () => '' });
  assert.equal(await readers.readIndexLabRunNeedSet('run-1'), null);
});

test('readIndexLabRunNeedSet: falls back to events when no artifacts', async () => {
  const readers = makeReaders({
    readEvents: async () => [
      {
        event: 'needset_computed',
        ts: '2026-01-01T00:00:00Z',
        payload: { fields: [{ field_key: 'weight', state: 'missing' }], total_fields: 30 },
      },
    ],
  });
  const result = await readers.readIndexLabRunNeedSet('run-1');
  assert.ok(result);
  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].field_key, 'weight');
  assert.equal(result.total_fields, 30);
  assert.equal(result.source, 'events_fallback');
});

// ---------------------------------------------------------------------------
// Factory: readIndexLabRunSearchProfile
// ---------------------------------------------------------------------------

test('readIndexLabRunSearchProfile: empty runId → null', async () => {
  const readers = makeReaders();
  assert.equal(await readers.readIndexLabRunSearchProfile(''), null);
});

test('readIndexLabRunSearchProfile: no run dir → null', async () => {
  const readers = makeReaders({ resolveRunDir: async () => '' });
  assert.equal(await readers.readIndexLabRunSearchProfile('run-1'), null);
});

test('readIndexLabRunSearchProfile: returns storage artifact when available', async () => {
  const storedProfile = { query_count: 5, source: 'stored' };
  const readers = makeReaders({
    getStorage: () => ({
      resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
      resolveInputKey: (...parts) => parts.filter(Boolean).join('/'),
      readJsonOrNull: async () => storedProfile,
    }),
  });
  const result = await readers.readIndexLabRunSearchProfile('run-1');
  assert.ok(result);
  assert.equal(result.source, 'stored');
});

test('readIndexLabRunSearchProfile: falls back to events when no artifacts', async () => {
  const readers = makeReaders({
    readEvents: async () => [
      { event: 'search_started', payload: { query: 'test query' } },
      { event: 'search_finished', payload: { query: 'test query', result_count: 5 } },
    ],
  });
  const result = await readers.readIndexLabRunSearchProfile('run-1');
  assert.ok(result);
  assert.equal(result.source, 'events_fallback');
  assert.equal(result.queries.length, 1);
  assert.equal(result.queries[0].query, 'test query');
});

// ---------------------------------------------------------------------------
// Factory: readIndexLabRunItemIndexingPacket
// ---------------------------------------------------------------------------

test('readIndexLabRunItemIndexingPacket: empty runId → null', async () => {
  const readers = makeReaders();
  assert.equal(await readers.readIndexLabRunItemIndexingPacket(''), null);
});

test('readIndexLabRunItemIndexingPacket: returns storage artifact when available', async () => {
  const packet = { extraction_type: 'item' };
  let callCount = 0;
  const readers = makeReaders({
    getStorage: () => ({
      resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
      readJsonOrNull: async () => {
        callCount++;
        return callCount === 1 ? packet : null;
      },
    }),
  });
  const result = await readers.readIndexLabRunItemIndexingPacket('run-1');
  assert.ok(result);
  assert.equal(result.extraction_type, 'item');
});

test('readIndexLabRunItemIndexingPacket: returns null when no artifact found', async () => {
  const readers = makeReaders();
  const result = await readers.readIndexLabRunItemIndexingPacket('run-1');
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Factory: readIndexLabRunRunMetaPacket
// ---------------------------------------------------------------------------

test('readIndexLabRunRunMetaPacket: empty runId → null', async () => {
  const readers = makeReaders();
  assert.equal(await readers.readIndexLabRunRunMetaPacket(''), null);
});

test('readIndexLabRunRunMetaPacket: returns storage artifact when available', async () => {
  const packet = { meta_type: 'run' };
  let callCount = 0;
  const readers = makeReaders({
    getStorage: () => ({
      resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
      readJsonOrNull: async () => {
        callCount++;
        return callCount === 1 ? packet : null;
      },
    }),
  });
  const result = await readers.readIndexLabRunRunMetaPacket('run-1');
  assert.ok(result);
  assert.equal(result.meta_type, 'run');
});

test('readIndexLabRunRunMetaPacket: returns null when no artifact found', async () => {
  const readers = makeReaders();
  const result = await readers.readIndexLabRunRunMetaPacket('run-1');
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Factory: readIndexLabRunSerpExplorer
// ---------------------------------------------------------------------------

test('readIndexLabRunSerpExplorer: empty runId → null', async () => {
  const readers = makeReaders();
  assert.equal(await readers.readIndexLabRunSerpExplorer(''), null);
});

test('readIndexLabRunSerpExplorer: returns search_profile.serp_explorer when available', async () => {
  const serpData = { urls_selected: 5, selected_urls: [] };
  const readers = makeReaders({
    getStorage: () => ({
      resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
      resolveInputKey: (...parts) => parts.filter(Boolean).join('/'),
      readJsonOrNull: async (key) => {
        if (key.includes('search_profile')) {
          return { serp_explorer: serpData };
        }
        return null;
      },
    }),
  });
  const result = await readers.readIndexLabRunSerpExplorer('run-1');
  assert.ok(result);
  assert.equal(result.urls_selected, 5);
});

test('readIndexLabRunSerpExplorer: builds from run summary fallback', async () => {
  const readers = makeReaders({
    getStorage: () => ({
      resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
      resolveInputKey: (...parts) => parts.filter(Boolean).join('/'),
      readJsonOrNull: async (key) => {
        if (key.includes('logs/summary.json')) {
          return {
            generated_at: '2026-01-01T00:00:00Z',
            searches_attempted: [
              { query: 'test query', result_count: 10, provider: 'google' },
            ],
            urls_fetched: ['https://example.com/page1'],
          };
        }
        return null;
      },
    }),
  });
  const result = await readers.readIndexLabRunSerpExplorer('run-1');
  assert.ok(result);
  assert.equal(result.summary_only, true);
  assert.equal(result.urls_selected, 1);
  assert.equal(result.selected_urls[0].url, 'https://example.com/page1');
  assert.equal(result.queries.length, 1);
  assert.equal(result.queries[0].query, 'test query');
});

// ---------------------------------------------------------------------------
// Factory: readIndexLabRunLlmTraces
// ---------------------------------------------------------------------------

test('readIndexLabRunLlmTraces: null context → null', async () => {
  const readers = makeReaders({ resolveContext: async () => null });
  assert.equal(await readers.readIndexLabRunLlmTraces('run-1'), null);
});

test('readIndexLabRunLlmTraces: empty trace dir → empty traces array', async () => {
  const readers = makeReaders();
  const result = await readers.readIndexLabRunLlmTraces('run-1');
  assert.ok(result);
  assert.equal(result.count, 0);
  assert.deepStrictEqual(result.traces, []);
  assert.equal(result.run_id, 'run-1');
  assert.equal(result.category, 'mouse');
  assert.equal(result.product_id, 'mouse-test');
});

// ---------------------------------------------------------------------------
// Characterization: alias fallback behavior (lock before extraction)
// ---------------------------------------------------------------------------

test('buildNeedSetFromEvents: reads total_fields from payload', () => {
  const events = [{ event: 'needset_computed', ts: 'T1', payload: { total_fields: 10, fields: [] } }];
  const result = buildNeedSetFromEvents({}, events);
  assert.equal(result.total_fields, 10);
});

test('buildNeedSetFromEvents: falls back to field_count when total_fields missing', () => {
  const events = [{ event: 'needset_computed', ts: 'T1', payload: { field_count: 7, fields: [] } }];
  const result = buildNeedSetFromEvents({}, events);
  assert.equal(result.total_fields, 7);
});

test('buildNeedSetFromEvents: falls back to needset_size when both missing', () => {
  const events = [{ event: 'needset_computed', ts: 'T1', payload: { needset_size: 5, fields: [] } }];
  const result = buildNeedSetFromEvents({}, events);
  assert.equal(result.total_fields, 5);
});

test('buildNeedSetFromEvents: falls back to fields.length when all missing', () => {
  const fields = [{ state: 'missing' }, { state: 'accepted' }];
  const events = [{ event: 'needset_computed', ts: 'T1', payload: { fields } }];
  const result = buildNeedSetFromEvents({}, events);
  assert.equal(result.total_fields, 2);
});

test('pickSearchQueryFromEvent: prefers row.query', () => {
  assert.equal(pickSearchQueryFromEvent({ query: 'row-q', payload: { query: 'p-q' } }), 'row-q');
});

test('pickSearchQueryFromEvent: falls back to payload.query', () => {
  assert.equal(pickSearchQueryFromEvent({ payload: { query: 'p-q' } }), 'p-q');
});

test('pickSearchQueryFromEvent: falls back to payload.search_query', () => {
  assert.equal(pickSearchQueryFromEvent({ payload: { search_query: 'sq' } }), 'sq');
});

test('pickSearchQueryFromEvent: falls back to payload.searchQuery', () => {
  assert.equal(pickSearchQueryFromEvent({ payload: { searchQuery: 'cq' } }), 'cq');
});

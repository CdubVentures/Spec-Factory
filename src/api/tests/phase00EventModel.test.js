import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAuditHarness,
  makeRunStartedEvent,
  makeRunContextEvent,
  makeSearchEvent,
  makeFetchEvent,
  makeSourceProcessedEvent,
  makeFieldsFilledEvent,
  makeLlmEvent,
  makeNeedsetComputedEvent,
  makeRunCompletedEvent,
  makeEvidenceIndexEvent,
} from '../../../test/helpers/phase00AuditHarness.js';
import { buildRoundSummaryFromEvents } from '../roundSummary.js';
import { buildEvidenceSearchPayload } from '../evidenceSearch.js';

const RUN_ID = 'r_phase00_test_001';

describe('Phase 00 — Event Model Audit', () => {
  const harness = createAuditHarness();
  let bridge;

  after(async () => {
    await harness.cleanup();
  });

  describe('NDJSON envelope shape', () => {
    it('every emitted event has required envelope keys: run_id, ts, stage, event, payload', async () => {
      bridge = await harness.setup();
      await harness.feedEvents([
        makeRunStartedEvent(RUN_ID),
        makeRunContextEvent(RUN_ID),
        makeSearchEvent(RUN_ID, 'query_started'),
        makeSearchEvent(RUN_ID, 'query_completed'),
        makeFetchEvent(RUN_ID, 'started'),
        makeSourceProcessedEvent(RUN_ID),
        makeFieldsFilledEvent(RUN_ID),
        makeLlmEvent(RUN_ID, 'started'),
        makeLlmEvent(RUN_ID, 'completed'),
        makeNeedsetComputedEvent(RUN_ID),
        makeRunCompletedEvent(RUN_ID)
      ]);

      const events = await harness.getEmittedEvents();
      harness.printAuditTrail(events);

      console.log(`[AUDIT] Verifying ${events.length} events have correct envelope shape...`);
      for (const evt of events) {
        harness.assertEnvelopeShape(evt, 'envelope');
      }
      console.log(`[AUDIT] All ${events.length} events pass envelope shape check`);
      assert.ok(events.length >= 10, `Expected at least 10 events, got ${events.length}`);
    });
  });

  describe('spec-required events exist', () => {
    it('search_started is emitted for discovery_query_started (scope=query)', async () => {
      const events = await harness.getEmittedEvents();
      const evt = harness.assertEventExists(events, 'search_started', 'SPEC', { scope: 'query' });
      harness.assertPayloadHasKeys(evt, ['query', 'provider'], 'search_started');
      console.log(`[SPEC] search_started(query) ✓ — query="${evt.payload.query}" provider="${evt.payload.provider}"`);
    });

    it('search_finished is emitted for discovery_query_completed (scope=query)', async () => {
      const events = await harness.getEmittedEvents();
      const evt = harness.assertEventExists(events, 'search_finished', 'SPEC', { scope: 'query' });
      harness.assertPayloadHasKeys(evt, ['query', 'provider', 'result_count', 'duration_ms'], 'search_finished');
      console.log(`[SPEC] search_finished(query) ✓ — results=${evt.payload.result_count} duration=${evt.payload.duration_ms}ms`);
    });

    it('fetch_started is emitted for source_fetch_started (scope=url)', async () => {
      const events = await harness.getEmittedEvents();
      const evt = harness.assertEventExists(events, 'fetch_started', 'SPEC', { scope: 'url' });
      harness.assertPayloadHasKeys(evt, ['url', 'host', 'tier', 'fetcher_kind'], 'fetch_started');
      console.log(`[SPEC] fetch_started(url) ✓ — url="${evt.payload.url}" tier=${evt.payload.tier}`);
    });

    it('fetch_finished is emitted for source_processed', async () => {
      const events = await harness.getEmittedEvents();
      const evt = harness.assertEventExists(events, 'fetch_finished', 'SPEC');
      harness.assertPayloadHasKeys(evt, ['url', 'status', 'ms', 'bytes'], 'fetch_finished');
      console.log(`[SPEC] fetch_finished ✓ — status=${evt.payload.status} ms=${evt.payload.ms} bytes=${evt.payload.bytes}`);
    });

    it('parse_finished is emitted for source_processed', async () => {
      const events = await harness.getEmittedEvents();
      const evt = harness.assertEventExists(events, 'parse_finished', 'SPEC');
      harness.assertPayloadHasKeys(evt, ['url', 'status', 'candidate_count'], 'parse_finished');
      console.log(`[SPEC] parse_finished ✓ — candidates=${evt.payload.candidate_count}`);
    });

    it('index_finished is emitted for fields_filled_from_source', async () => {
      const events = await harness.getEmittedEvents();
      const evt = harness.assertEventExists(events, 'index_finished', 'SPEC');
      harness.assertPayloadHasKeys(evt, ['url', 'count', 'filled_fields'], 'index_finished');
      console.log(`[SPEC] index_finished ✓ — count=${evt.payload.count} fields=${evt.payload.filled_fields.length}`);
    });

    it('llm_started is emitted for llm_call_started', async () => {
      const events = await harness.getEmittedEvents();
      const evt = harness.assertEventExists(events, 'llm_started', 'SPEC');
      harness.assertPayloadHasKeys(evt, ['reason', 'route_role', 'model', 'provider', 'max_tokens_applied'], 'llm_started');
      console.log(`[SPEC] llm_started ✓ — reason="${evt.payload.reason}" model="${evt.payload.model}"`);
    });

    it('llm_finished is emitted for llm_call_completed', async () => {
      const events = await harness.getEmittedEvents();
      const evt = harness.assertEventExists(events, 'llm_finished', 'SPEC');
      harness.assertPayloadHasKeys(evt, ['reason', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens'], 'llm_finished');
      console.log(`[SPEC] llm_finished ✓ — tokens=${evt.payload.total_tokens}`);
    });

    it('needset_computed is emitted', async () => {
      const events = await harness.getEmittedEvents();
      const evt = harness.assertEventExists(events, 'needset_computed', 'SPEC');
      harness.assertPayloadHasKeys(evt, ['needset_size', 'total_fields', 'fields'], 'needset_computed');
      console.log(`[SPEC] needset_computed ✓ — size=${evt.payload.needset_size} total=${evt.payload.total_fields}`);
    });

    it('run_context is emitted with metadata fields', async () => {
      const events = await harness.getEmittedEvents();
      const evt = harness.assertEventExists(events, 'run_context', 'SPEC');
      harness.assertPayloadHasKeys(evt, ['identity_fingerprint', 'identity_lock_status', 'dedupe_mode', 'phase_cursor'], 'run_context');
      console.log(`[SPEC] run_context ✓ — fp="${evt.payload.identity_fingerprint}" lock="${evt.payload.identity_lock_status}" dedupe="${evt.payload.dedupe_mode}"`);
    });
  });

  describe('run.json persistence', () => {
    it('run.json contains all required metadata fields', async () => {
      const meta = await harness.getRunMeta();
      assert.ok(meta, 'run.json should exist');
      const requiredKeys = [
        'run_id', 'started_at', 'ended_at', 'status', 'category', 'product_id',
        'counters', 'stages', 'identity_fingerprint', 'identity_lock_status',
        'dedupe_mode', 'phase_cursor', 'startup_ms'
      ];
      const missing = requiredKeys.filter((k) => !(k in meta));
      console.log(`[META] run.json keys present: ${Object.keys(meta).join(', ')}`);
      assert.deepStrictEqual(missing, [], `run.json missing keys: ${missing.join(', ')}`);
      assert.equal(meta.run_id, RUN_ID);
      assert.equal(meta.status, 'completed');
      assert.equal(meta.identity_fingerprint, 'fp_abc123');
      assert.equal(meta.identity_lock_status, 'locked');
      assert.equal(meta.dedupe_mode, 'content_hash');
      console.log(`[META] run.json ✓ — status="${meta.status}" fp="${meta.identity_fingerprint}"`);
    });

    it('run.json startup_ms tracks stage timings', async () => {
      const meta = await harness.getRunMeta();
      assert.ok(meta.startup_ms, 'startup_ms should exist');
      console.log(`[META] startup_ms: ${JSON.stringify(meta.startup_ms)}`);
      assert.ok('first_event' in meta.startup_ms, 'startup_ms.first_event should exist');
      assert.ok('search_started' in meta.startup_ms, 'startup_ms.search_started should exist');
      assert.ok('fetch_started' in meta.startup_ms, 'startup_ms.fetch_started should exist');
    });

    it('run.json counters track fetch/parse/index counts', async () => {
      const meta = await harness.getRunMeta();
      assert.ok(meta.counters, 'counters should exist');
      console.log(`[META] counters: ${JSON.stringify(meta.counters)}`);
      assert.ok(meta.counters.pages_checked >= 1, `pages_checked should be >= 1, got ${meta.counters.pages_checked}`);
      assert.ok(meta.counters.fetched_ok >= 1, `fetched_ok should be >= 1, got ${meta.counters.fetched_ok}`);
      assert.ok(meta.counters.parse_completed >= 1, `parse_completed should be >= 1, got ${meta.counters.parse_completed}`);
      assert.ok(meta.counters.fields_filled >= 1, `fields_filled should be >= 1, got ${meta.counters.fields_filled}`);
    });

    it('run.json stages track started_at and ended_at', async () => {
      const meta = await harness.getRunMeta();
      assert.ok(meta.stages, 'stages should exist');
      for (const stage of ['search', 'fetch', 'parse', 'index']) {
        const s = meta.stages[stage];
        assert.ok(s, `stages.${stage} should exist`);
        assert.ok(s.started_at, `stages.${stage}.started_at should be set`);
        assert.ok(s.ended_at, `stages.${stage}.ended_at should be set`);
        console.log(`[META] stage ${stage}: started=${s.started_at} ended=${s.ended_at}`);
      }
    });
  });

  describe('needset.json persistence', () => {
    it('needset.json is written with full snapshot', async () => {
      const needset = await harness.getNeedSet();
      assert.ok(needset, 'needset.json should exist');
      assert.equal(needset.run_id, RUN_ID);
      assert.equal(needset.total_fields, 60);
      assert.equal(needset.needset_size, 25);
      assert.ok(needset.identity, 'identity should exist');
      assert.equal(needset.identity.state, 'locked');
      assert.ok(Array.isArray(needset.fields), 'fields should be an array');
      console.log(`[NEEDSET] ✓ — size=${needset.needset_size} total=${needset.total_fields} identity=${needset.identity.state}`);
    });
  });

  describe('WS event broadcast', () => {
    it('onEvent callback receives events matching NDJSON', async () => {
      const wsEvents = harness.getWsEvents();
      assert.ok(wsEvents.length >= 10, `Expected at least 10 WS events, got ${wsEvents.length}`);
      console.log(`[WS] Received ${wsEvents.length} WS events`);
      for (const evt of wsEvents) {
        assert.ok(evt.run_id, `WS event should have run_id`);
        assert.ok(evt.event, `WS event should have event name`);
        assert.ok(evt.ts, `WS event should have ts`);
      }
    });
  });

  describe('timing gaps between events', () => {
    it('logs full timing waterfall', async () => {
      const events = await harness.getEmittedEvents();
      harness.printTimingGaps(events);
      assert.ok(events.length > 0, 'Should have events for timing analysis');
    });
  });

  describe('evidence_index_result transformation', () => {
    it('transforms evidence_index_result with outcome=new into indexed_new', async () => {
      const h2 = createAuditHarness();
      const b2 = await h2.setup();
      const runId = 'r_dedupe_test_001';
      await h2.feedEvents([
        makeRunStartedEvent(runId),
        makeEvidenceIndexEvent(runId, { dedupe_outcome: 'new' })
      ]);
      const events = await h2.getEmittedEvents();
      h2.assertEventExists(events, 'indexed_new', 'dedupe-new');
      console.log('[DEDUPE] evidence_index_result(new) → indexed_new ✓');
      await h2.cleanup();
    });

    it('transforms evidence_index_result with outcome=reused into dedupe_hit', async () => {
      const h2 = createAuditHarness();
      await h2.setup();
      const runId = 'r_dedupe_test_002';
      await h2.feedEvents([
        makeRunStartedEvent(runId),
        makeEvidenceIndexEvent(runId, { dedupe_outcome: 'reused' })
      ]);
      const events = await h2.getEmittedEvents();
      h2.assertEventExists(events, 'dedupe_hit', 'dedupe-reused');
      console.log('[DEDUPE] evidence_index_result(reused) → dedupe_hit ✓');
      await h2.cleanup();
    });

    it('transforms evidence_index_result with outcome=updated into dedupe_updated', async () => {
      const h2 = createAuditHarness();
      await h2.setup();
      const runId = 'r_dedupe_test_003';
      await h2.feedEvents([
        makeRunStartedEvent(runId),
        makeEvidenceIndexEvent(runId, { dedupe_outcome: 'updated' })
      ]);
      const events = await h2.getEmittedEvents();
      h2.assertEventExists(events, 'dedupe_updated', 'dedupe-updated');
      console.log('[DEDUPE] evidence_index_result(updated) → dedupe_updated ✓');
      await h2.cleanup();
    });
  });

});

describe('Phase 00 — BUG: roundSummary.js payload nesting (CSV Item 1)', () => {
  it('single-pass reads NDJSON-format run_completed with payload wrapper', () => {
    const ndjsonEvents = [
      {
        run_id: 'r_test', ts: '2026-02-20T00:00:00Z', stage: 'index',
        event: 'needset_computed',
        payload: { needset_size: 25, total_fields: 60 }
      },
      {
        run_id: 'r_test', ts: '2026-02-20T00:01:00Z', stage: 'runtime',
        event: 'run_completed',
        payload: {
          confidence: 0.82, validated: true,
          missing_required_fields: ['weight', 'sensor'],
          critical_fields_below_pass_target: ['dpi']
        }
      }
    ];

    const result = buildRoundSummaryFromEvents(ndjsonEvents);
    console.log(`[BUG-CSV1-FALLBACK] result: ${JSON.stringify(result, null, 2)}`);
    console.log(`[BUG-CSV1-FALLBACK] round[0].needset_size = ${result.rounds[0]?.needset_size} (expected: 25)`);
    console.log(`[BUG-CSV1-FALLBACK] round[0].confidence = ${result.rounds[0]?.confidence} (expected: 0.82)`);
    console.log(`[BUG-CSV1-FALLBACK] round[0].missing_required_count = ${result.rounds[0]?.missing_required_count} (expected: 2)`);

    assert.equal(result.rounds[0].needset_size, 25, 'needset_size should be 25 from needset_computed payload');
    assert.equal(result.rounds[0].confidence, 0.82, 'confidence should be 0.82 from run_completed payload');
    assert.equal(result.rounds[0].missing_required_count, 2, 'missing_required_count should be 2');
    assert.equal(result.rounds[0].critical_count, 1, 'critical_count should be 1');
  });
});

describe('Phase 00 — BUG: guiServer evidence-index dedupe filter (CSV Item 2)', () => {
  it('buildEvidenceSearchPayload reads NDJSON-format events with payload wrapper', () => {
    const ndjsonDedupeEvents = [
      {
        run_id: 'r_test', ts: '2026-02-20T00:00:00Z', stage: 'index',
        event: 'indexed_new',
        payload: { dedupe_outcome: 'new', chunks_indexed: 8, url: 'https://example.com' }
      },
      {
        run_id: 'r_test', ts: '2026-02-20T00:00:01Z', stage: 'index',
        event: 'dedupe_hit',
        payload: { dedupe_outcome: 'reused', chunks_indexed: 0, url: 'https://example.com/2' }
      },
      {
        run_id: 'r_test', ts: '2026-02-20T00:00:02Z', stage: 'index',
        event: 'dedupe_updated',
        payload: { dedupe_outcome: 'updated', chunks_indexed: 3, url: 'https://example.com/3' }
      }
    ];

    const result = buildEvidenceSearchPayload({ dedupeEvents: ndjsonDedupeEvents, query: '' });
    console.log(`[BUG-CSV2] dedupe_stream: ${JSON.stringify(result.dedupe_stream)}`);
    console.log(`[BUG-CSV2] new_count = ${result.dedupe_stream.new_count} (expected: 1)`);
    console.log(`[BUG-CSV2] reused_count = ${result.dedupe_stream.reused_count} (expected: 1)`);
    console.log(`[BUG-CSV2] updated_count = ${result.dedupe_stream.updated_count} (expected: 1)`);
    console.log(`[BUG-CSV2] total_chunks_indexed = ${result.dedupe_stream.total_chunks_indexed} (expected: 11)`);

    assert.equal(result.dedupe_stream.new_count, 1, 'new_count should be 1 — reads evt.payload.dedupe_outcome not evt.dedupe_outcome');
    assert.equal(result.dedupe_stream.reused_count, 1, 'reused_count should be 1');
    assert.equal(result.dedupe_stream.updated_count, 1, 'updated_count should be 1');
    assert.equal(result.dedupe_stream.total_chunks_indexed, 11, 'total_chunks_indexed should be 11');
  });
});

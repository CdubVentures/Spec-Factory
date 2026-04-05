import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAuditHarness,
  makeFetchEvent,
  makeFieldsFilledEvent,
  makeLlmEvent,
  makeNeedsetComputedEvent,
  makeRunCompletedEvent,
  makeRunContextEvent,
  makeRunStartedEvent,
  makeSearchEvent,
  makeSourceProcessedEvent,
} from '../../../indexlab/tests/helpers/auditHarness.js';
import { buildRoundSummaryFromEvents } from '../../../features/indexing/domain/roundSummary.js';
const RUN_ID = 'r_phase00_test_001';

function createStandardAuditEvents(runId = RUN_ID) {
  return [
    makeRunStartedEvent(runId),
    makeRunContextEvent(runId),
    makeSearchEvent(runId, 'query_started'),
    makeSearchEvent(runId, 'query_completed'),
    makeFetchEvent(runId, 'started'),
    makeSourceProcessedEvent(runId),
    makeFieldsFilledEvent(runId),
    makeLlmEvent(runId, 'started'),
    makeLlmEvent(runId, 'completed'),
    makeNeedsetComputedEvent(runId),
    makeRunCompletedEvent(runId),
  ];
}

async function createCompletedAuditHarness(runId = RUN_ID) {
  const harness = createAuditHarness();
  await harness.setup();
  await harness.feedEvents(createStandardAuditEvents(runId));
  // WHY: Step 10 — mid-run writeRunMeta calls are SQL-only. Finalize
  // triggers the final run.json write so getRunMeta() can read it from disk.
  await harness.getBridge().finalize({ status: 'completed' });
  return harness;
}

async function createCompletedAuditSnapshot(runId = RUN_ID) {
  const harness = await createCompletedAuditHarness(runId);
  return {
    harness,
    events: await harness.getEmittedEvents(),
    meta: await harness.getRunMeta(),
    needset: await harness.getNeedSet(),
    wsEvents: harness.getWsEvents(),
  };
}

describe('Phase 00 event model contract', () => {
  it('emits NDJSON rows with the required event envelope', async (t) => {
    const { harness, events } = await createCompletedAuditSnapshot();
    t.after(() => harness.cleanup());

    assert.ok(events.length >= 10);
    for (const event of events) {
      harness.assertEnvelopeShape(event, 'envelope');
    }
  });

  it('projects the required public events with their contract fields', async (t) => {
    const { harness, events } = await createCompletedAuditSnapshot();
    t.after(() => harness.cleanup());

    const cases = [
      {
        eventName: 'search_started',
        filter: { scope: 'query' },
        keys: ['query', 'provider'],
      },
      {
        eventName: 'search_finished',
        filter: { scope: 'query' },
        keys: ['query', 'provider', 'result_count', 'duration_ms'],
      },
      {
        eventName: 'fetch_started',
        filter: { scope: 'url' },
        keys: ['url', 'host', 'tier', 'fetcher_kind'],
      },
      {
        eventName: 'fetch_finished',
        filter: {},
        keys: ['url', 'status', 'ms', 'bytes'],
      },
      {
        eventName: 'parse_finished',
        filter: {},
        keys: ['url', 'status', 'candidate_count'],
      },
      {
        eventName: 'index_finished',
        filter: {},
        keys: ['url', 'count', 'filled_fields'],
      },
      {
        eventName: 'llm_started',
        filter: {},
        keys: ['reason', 'route_role', 'model', 'provider', 'max_tokens_applied'],
      },
      {
        eventName: 'llm_finished',
        filter: {},
        keys: ['reason', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens'],
      },
      {
        eventName: 'needset_computed',
        filter: {},
        keys: ['needset_size', 'total_fields', 'fields'],
      },
      {
        eventName: 'run_context',
        filter: {},
        keys: ['identity_fingerprint', 'identity_lock_status', 'dedupe_mode', 'stage_cursor'],
      },
    ];

    for (const testCase of cases) {
      const event = harness.assertEventExists(events, testCase.eventName, 'contract', testCase.filter);
      harness.assertPayloadHasKeys(event, testCase.keys, testCase.eventName);
    }
  });

  it('persists run metadata with counters, startup timings, and stage timestamps', async (t) => {
    const { harness, meta } = await createCompletedAuditSnapshot();
    t.after(() => harness.cleanup());

    const requiredKeys = [
      'run_id',
      'started_at',
      'ended_at',
      'status',
      'category',
      'product_id',
      'counters',
      'stages',
      'identity_fingerprint',
      'identity_lock_status',
      'dedupe_mode',
      'stage_cursor',
      'startup_ms',
    ];

    assert.ok(meta);
    assert.deepEqual(requiredKeys.filter((key) => !(key in meta)), []);
    assert.equal(meta.run_id, RUN_ID);
    assert.equal(meta.status, 'completed');
    assert.equal(meta.identity_fingerprint, 'fp_abc123');
    assert.equal(meta.identity_lock_status, 'locked');
    assert.equal(meta.dedupe_mode, 'content_hash');
    assert.ok(meta.counters.pages_checked >= 1);
    assert.ok(meta.counters.fetched_ok >= 1);
    assert.ok(meta.counters.parse_completed >= 1);
    assert.ok(meta.counters.fields_filled >= 1);
    assert.ok('first_event' in meta.startup_ms);
    assert.ok('search_started' in meta.startup_ms);
    assert.ok('fetch_started' in meta.startup_ms);

    for (const stage of ['search', 'fetch', 'parse', 'index']) {
      assert.ok(meta.stages[stage]);
      assert.ok(meta.stages[stage].started_at);
      assert.ok(meta.stages[stage].ended_at);
    }
  });

  it('persists needset snapshots and mirrors runtime events to the websocket callback', async (t) => {
    const { harness, needset, wsEvents } = await createCompletedAuditSnapshot();
    t.after(() => harness.cleanup());

    assert.ok(needset);
    assert.equal(needset.run_id, RUN_ID);
    assert.equal(needset.total_fields, 60);
    assert.equal(needset.needset_size, 25);
    assert.equal(needset.identity.state, 'locked');
    assert.ok(Array.isArray(needset.fields));

    assert.ok(wsEvents.length >= 10);
    for (const event of wsEvents) {
      assert.ok(event.run_id);
      assert.ok(event.event);
      assert.ok(event.ts);
    }
  });

});

describe('Phase 00 payload unwrap contracts', () => {
  it('buildRoundSummaryFromEvents reads run_completed values from wrapped payload rows', () => {
    const result = buildRoundSummaryFromEvents([
      {
        run_id: 'r_test',
        ts: '2026-02-20T00:00:00Z',
        stage: 'index',
        event: 'needset_computed',
        payload: { needset_size: 25, total_fields: 60 },
      },
      {
        run_id: 'r_test',
        ts: '2026-02-20T00:01:00Z',
        stage: 'runtime',
        event: 'run_completed',
        payload: {
          confidence: 0.82,
          validated: true,
          missing_required_fields: ['weight', 'sensor'],
          critical_fields_below_pass_target: ['dpi'],
        },
      },
    ]);

    assert.equal(result.rounds[0].needset_size, 25);
    assert.equal(result.rounds[0].confidence, 0.82);
    assert.equal(result.rounds[0].missing_required_count, 2);
    assert.equal(result.rounds[0].critical_count, 1);
  });

});

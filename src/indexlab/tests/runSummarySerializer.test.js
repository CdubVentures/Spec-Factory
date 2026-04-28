import { describe, it } from 'node:test';
import { deepStrictEqual, ok, strictEqual } from 'node:assert';

import {
  serializeRunSummary,
  extractEventsFromRunSummary,
  extractMetaFromRunSummary,
} from '../runSummarySerializer.js';

import {
  RUN_SUMMARY_SCHEMA_VERSION,
  RUN_SUMMARY_TOP_KEYS,
  RUN_SUMMARY_TELEMETRY_KEYS,
  RUN_SUMMARY_META_KEYS,
  RUN_SUMMARY_EVENTS_LIMIT,
  RUN_SUMMARY_LLM_AGG_KEYS,
  RUN_SUMMARY_OBSERVABILITY_KEYS,
} from '../../features/indexing/api/contracts/runSummaryContract.js';

const sorted = (arr) => [...arr].sort();

function makeMockBridge({ events = [], llmAgg = null, observability = null } = {}) {
  return {
    runId: 'run-001',
    context: { category: 'mouse', productId: 'prod-001', s3Key: '' },
    status: 'completed',
    startedAt: '2026-03-27T10:00:00Z',
    endedAt: '2026-03-27T10:05:00Z',
    stageCursor: 'completed',
    bootStep: '',
    bootProgress: 100,
    identityFingerprint: 'fp-abc',
    identityLockStatus: 'locked',
    dedupeMode: 'content_hash',
    outRoot: '/out/mouse/prod-001',
    counters: { pages_checked: 10, fetched_ok: 8, fetched_404: 1, fetched_blocked: 0, fetched_error: 1, parse_completed: 7, indexed_docs: 6, fields_filled: 42 },
    stageState: {
      search: { started_at: '2026-03-27T10:00:01Z', ended_at: '2026-03-27T10:01:00Z' },
      fetch: { started_at: '2026-03-27T10:01:01Z', ended_at: '2026-03-27T10:03:00Z' },
      parse: { started_at: '2026-03-27T10:03:01Z', ended_at: '2026-03-27T10:04:00Z' },
      index: { started_at: '2026-03-27T10:04:01Z', ended_at: '2026-03-27T10:04:30Z' },
    },
    startupMs: { first_event: 50, search_started: 100, fetch_started: 1000, parse_started: 2000, index_started: 3000 },
    browserPool: null,
    needSet: { total_fields: 73, generated_at: '2026-03-27T10:00:30Z', summary: { total: 73 }, rows: new Array(73) },
    searchProfile: { status: 'executed', query_count: 15, generated_at: '2026-03-27T10:00:45Z' },
    needSetPath: '/out/mouse/prod-001/needset.json',
    searchProfilePath: '/out/mouse/prod-001/search_profile.json',
    brandResolutionPath: '/out/mouse/prod-001/brand_resolution.json',
    get _llmAgg() {
      return llmAgg || {
        total_calls: 5, completed_calls: 5, failed_calls: 0, active_calls: 0,
        total_prompt_tokens: 8000, total_completion_tokens: 2000, total_cost: 0.12,
        calls_by_type: { evidence_index: 3, serp_selector: 2 },
        calls_by_model: { 'claude-haiku-4': 5 },
      };
    },
    getObservability() {
      return observability || {
        search_finish_without_start: 0, search_slot_reuse: 0, search_unique_slots: 3,
        llm_missing_telemetry: 0, llm_orphan_finish: 0,
        bridge_event_errors: 0, bridge_finalize_errors: 0,
      };
    },
    specDb: {
      getBridgeEventsByRunId(runId, limit) {
        return events.slice(0, limit);
      },
    },
  };
}

function makeMockEvents(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    run_id: 'run-001',
    category: 'mouse',
    product_id: 'prod-001',
    ts: `2026-03-27T10:0${i}:00Z`,
    stage: 'fetch',
    event: 'fetch_finished',
    payload: { url: `https://example.com/page${i}`, status: 200 },
  }));
}

// ── Happy path ──

describe('serializeRunSummary — happy path', () => {
  it('produces correct top-level keys', async () => {
    const bridge = makeMockBridge({ events: makeMockEvents() });
    const result = await serializeRunSummary(bridge);
    deepStrictEqual(sorted(Object.keys(result)), sorted(RUN_SUMMARY_TOP_KEYS));
  });

  it('schema_version matches contract', async () => {
    const bridge = makeMockBridge();
    const result = await serializeRunSummary(bridge);
    strictEqual(result.schema_version, RUN_SUMMARY_SCHEMA_VERSION);
  });

  it('telemetry has correct sections', async () => {
    const bridge = makeMockBridge();
    const result = await serializeRunSummary(bridge);
    deepStrictEqual(sorted(Object.keys(result.telemetry)), sorted(RUN_SUMMARY_TELEMETRY_KEYS));
  });

  it('meta contains all contract keys', async () => {
    const bridge = makeMockBridge();
    const result = await serializeRunSummary(bridge);
    const metaKeys = Object.keys(result.telemetry.meta);
    for (const key of RUN_SUMMARY_META_KEYS) {
      ok(metaKeys.includes(key), `meta must include ${key}`);
    }
  });

  it('meta values match bridge state', async () => {
    const bridge = makeMockBridge();
    const result = await serializeRunSummary(bridge);
    const meta = result.telemetry.meta;
    strictEqual(meta.run_id, 'run-001');
    strictEqual(meta.category, 'mouse');
    strictEqual(meta.status, 'completed');
    strictEqual(meta.stage_cursor, 'completed');
    strictEqual(meta.identity_fingerprint, 'fp-abc');
    deepStrictEqual(meta.counters, bridge.counters);
    deepStrictEqual(meta.stages, bridge.stageState);
    deepStrictEqual(meta.startup_ms, bridge.startupMs);
  });

  it('events array matches mock events', async () => {
    const mockEvents = makeMockEvents(5);
    const bridge = makeMockBridge({ events: mockEvents });
    const result = await serializeRunSummary(bridge);
    strictEqual(result.telemetry.events.length, 5);
    deepStrictEqual(result.telemetry.events, mockEvents);
  });

  it('event_limit marks untruncated event capture', async () => {
    const mockEvents = makeMockEvents(5);
    const bridge = makeMockBridge({ events: mockEvents });
    const result = await serializeRunSummary(bridge);
    deepStrictEqual(result.telemetry.event_limit, {
      limit: RUN_SUMMARY_EVENTS_LIMIT,
      captured: 5,
      truncated: false,
    });
  });

  it('event_limit marks truncation when SQL has more events than the summary limit', async () => {
    const mockEvents = makeMockEvents(RUN_SUMMARY_EVENTS_LIMIT + 1);
    const bridge = makeMockBridge({ events: mockEvents });
    const result = await serializeRunSummary(bridge);
    strictEqual(result.telemetry.events.length, RUN_SUMMARY_EVENTS_LIMIT);
    strictEqual(result.telemetry.events[0].event, mockEvents[1].event);
    strictEqual(result.telemetry.events.at(-1).event, mockEvents.at(-1).event);
    deepStrictEqual(result.telemetry.event_limit, {
      limit: RUN_SUMMARY_EVENTS_LIMIT,
      captured: RUN_SUMMARY_EVENTS_LIMIT,
      truncated: true,
    });
  });

  it('llm_agg contains all contract keys', async () => {
    const bridge = makeMockBridge();
    const result = await serializeRunSummary(bridge);
    for (const key of RUN_SUMMARY_LLM_AGG_KEYS) {
      ok(key in result.telemetry.llm_agg, `llm_agg must include ${key}`);
    }
  });

  it('llm_agg values match bridge tracker', async () => {
    const bridge = makeMockBridge();
    const result = await serializeRunSummary(bridge);
    strictEqual(result.telemetry.llm_agg.total_calls, 5);
    strictEqual(result.telemetry.llm_agg.total_cost, 0.12);
  });

  it('observability contains all contract keys', async () => {
    const bridge = makeMockBridge();
    const result = await serializeRunSummary(bridge);
    for (const key of RUN_SUMMARY_OBSERVABILITY_KEYS) {
      ok(key in result.telemetry.observability, `observability must include ${key}`);
    }
  });
});

// ── No specDb (null) ──

describe('serializeRunSummary — no specDb', () => {
  it('events array is empty when specDb is null', async () => {
    const bridge = makeMockBridge();
    bridge.specDb = null;
    const result = await serializeRunSummary(bridge);
    deepStrictEqual(result.telemetry.events, []);
  });

  it('meta is still populated from in-memory state', async () => {
    const bridge = makeMockBridge();
    bridge.specDb = null;
    const result = await serializeRunSummary(bridge);
    strictEqual(result.telemetry.meta.run_id, 'run-001');
    strictEqual(result.telemetry.meta.status, 'completed');
    deepStrictEqual(result.telemetry.meta.counters, bridge.counters);
  });

  it('llm_agg is still populated', async () => {
    const bridge = makeMockBridge();
    bridge.specDb = null;
    const result = await serializeRunSummary(bridge);
    strictEqual(result.telemetry.llm_agg.total_calls, 5);
  });
});

// ── No needSet / searchProfile ──

describe('serializeRunSummary — no needset or search_profile', () => {
  it('needset_summary is null when needSet is absent', async () => {
    const bridge = makeMockBridge();
    bridge.needSet = null;
    const result = await serializeRunSummary(bridge);
    strictEqual(result.telemetry.meta.needset_summary, null);
    strictEqual(result.telemetry.meta.artifacts.has_needset, false);
  });

  it('search_profile_summary is null when searchProfile is absent', async () => {
    const bridge = makeMockBridge();
    bridge.searchProfile = null;
    const result = await serializeRunSummary(bridge);
    strictEqual(result.telemetry.meta.search_profile_summary, null);
    strictEqual(result.telemetry.meta.artifacts.has_search_profile, false);
  });
});

// ── Roundtrip: serialize → extract ──

describe('extractEventsFromRunSummary — roundtrip', () => {
  it('extracts same events that were serialized', async () => {
    const mockEvents = makeMockEvents(10);
    const bridge = makeMockBridge({ events: mockEvents });
    const summary = await serializeRunSummary(bridge);
    const extracted = extractEventsFromRunSummary(summary);
    deepStrictEqual(extracted, mockEvents);
  });

  it('returns empty array for null input', () => {
    deepStrictEqual(extractEventsFromRunSummary(null), []);
  });

  it('returns empty array for malformed input', () => {
    deepStrictEqual(extractEventsFromRunSummary({ telemetry: {} }), []);
  });
});

describe('extractMetaFromRunSummary — roundtrip', () => {
  it('extracts meta that was serialized', async () => {
    const bridge = makeMockBridge();
    const summary = await serializeRunSummary(bridge);
    const meta = extractMetaFromRunSummary(summary);
    strictEqual(meta.run_id, 'run-001');
    strictEqual(meta.status, 'completed');
  });

  it('returns null for null input', () => {
    strictEqual(extractMetaFromRunSummary(null), null);
  });

  it('returns null for malformed input', () => {
    strictEqual(extractMetaFromRunSummary({ telemetry: {} }), null);
  });
});

// ── SQL error resilience ──

describe('serializeRunSummary — SQL error resilience', () => {
  it('produces empty events when specDb throws', async () => {
    const bridge = makeMockBridge();
    bridge.specDb = {
      getBridgeEventsByRunId() { throw new Error('DB locked'); },
    };
    const result = await serializeRunSummary(bridge);
    deepStrictEqual(result.telemetry.events, []);
    strictEqual(result.telemetry.meta.run_id, 'run-001');
  });
});

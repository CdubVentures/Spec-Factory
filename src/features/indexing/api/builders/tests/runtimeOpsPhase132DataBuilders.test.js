import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExtractionFields,
  buildFallbackEvents,
  buildQueueState,
} from '../runtimeOpsDataBuilders.js';

function makeEvent(event, payload = {}, ts = '2026-02-23T12:00:00.000Z') {
  return { event, ts, payload };
}

// ── buildExtractionFields ───────────────────────────────────────

test('buildExtractionFields: returns empty array for no events', () => {
  const result = buildExtractionFields([], {});
  assert.ok(result && typeof result === 'object');
  assert.ok(Array.isArray(result.fields));
  assert.equal(result.fields.length, 0);
});

test('buildExtractionFields: aggregates llm_finished candidates into field rows', () => {
  const events = [
    makeEvent('llm_finished', {
      batch_id: 'b1',
      worker_id: 'w1',
      round: 1,
      candidates: [
        { field: 'weight', value: '58g', confidence: 0.92, method: 'llm_extract', source_url: 'https://mfr.com/mouse', source_tier: 1, snippet_id: 's1', quote: 'weighs 58g' },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  assert.ok(result.fields.length >= 1);
  const row = result.fields.find((f) => f.field === 'weight');
  assert.ok(row);
  assert.equal(row.value, '58g');
  assert.equal(row.confidence, 0.92);
  assert.equal(row.method, 'llm_extract');
  assert.equal(row.source_tier, 1);
  assert.equal(row.batch_id, 'b1');
  assert.equal(row.round, 1);
});

test('buildExtractionFields: aggregates source_processed candidates', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://mfr.com/specs',
      parse_method: 'html_spec_table',
      round: 1,
      candidates: [
        { field: 'sensor', value: 'PAW3950', confidence: 0.85, method: 'html_spec_table', source_url: 'https://mfr.com/specs', source_tier: 1 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  assert.ok(result.fields.length >= 1);
  const row = result.fields.find((f) => f.field === 'sensor');
  assert.ok(row);
  assert.equal(row.value, 'PAW3950');
  assert.equal(row.method, 'html_spec_table');
});

test('buildExtractionFields: deduplicates fields keeping highest confidence', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://a.com',
      round: 1,
      candidates: [
        { field: 'dpi', value: '30000', confidence: 0.7, method: 'html_table', source_url: 'https://a.com', source_tier: 2 },
      ],
    }),
    makeEvent('llm_finished', {
      batch_id: 'b1',
      round: 1,
      candidates: [
        { field: 'dpi', value: '30000', confidence: 0.95, method: 'llm_extract', source_url: 'https://b.com', source_tier: 1 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const dpiRows = result.fields.filter((f) => f.field === 'dpi');
  assert.equal(dpiRows.length, 1);
  assert.equal(dpiRows[0].confidence, 0.95);
});

test('buildExtractionFields: marks accepted when fields_filled_from_source present', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://mfr.com',
      round: 1,
      candidates: [
        { field: 'weight', value: '58g', confidence: 0.9, method: 'html_spec_table', source_url: 'https://mfr.com', source_tier: 1 },
      ],
    }),
    makeEvent('fields_filled_from_source', {
      url: 'https://mfr.com',
      fields: ['weight'],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'weight');
  assert.ok(row);
  assert.equal(row.status, 'accepted');
});

test('buildExtractionFields: marks conflict when multiple different values exist', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://a.com',
      round: 1,
      candidates: [
        { field: 'weight', value: '58g', confidence: 0.85, method: 'html_table', source_url: 'https://a.com', source_tier: 1 },
      ],
    }),
    makeEvent('source_processed', {
      url: 'https://b.com',
      round: 1,
      candidates: [
        { field: 'weight', value: '62g', confidence: 0.9, method: 'html_table', source_url: 'https://b.com', source_tier: 2 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'weight');
  assert.ok(row);
  assert.equal(row.status, 'conflict');
});

test('buildExtractionFields: marks unknown when value is unk', () => {
  const events = [
    makeEvent('llm_finished', {
      batch_id: 'b1',
      round: 1,
      candidates: [
        { field: 'weight', value: 'unk', confidence: 0.1, method: 'llm_extract', source_url: 'https://x.com', source_tier: 3 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'weight');
  assert.ok(row);
  assert.equal(row.status, 'unknown');
});

test('buildExtractionFields: populates refs_count from candidates array length', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://a.com',
      round: 1,
      candidates: [
        { field: 'sensor', value: 'PAW3950', confidence: 0.8, method: 'html_table', source_url: 'https://a.com', source_tier: 1 },
      ],
    }),
    makeEvent('source_processed', {
      url: 'https://b.com',
      round: 1,
      candidates: [
        { field: 'sensor', value: 'PAW3950', confidence: 0.85, method: 'html_table', source_url: 'https://b.com', source_tier: 2 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'sensor');
  assert.ok(row);
  assert.equal(row.refs_count, 2);
});

test('buildExtractionFields: includes batch_id and worker_id from payload', () => {
  const events = [
    makeEvent('llm_finished', {
      batch_id: 'batch-42',
      worker_id: 'w7',
      round: 2,
      candidates: [
        { field: 'buttons', value: '5', confidence: 0.88, method: 'llm_extract', source_url: 'https://x.com', source_tier: 2 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'buttons');
  assert.ok(row);
  assert.equal(row.batch_id, 'batch-42');
});

test('buildExtractionFields: filters by round when option provided', () => {
  const events = [
    makeEvent('llm_finished', {
      batch_id: 'b1',
      round: 1,
      candidates: [
        { field: 'weight', value: '58g', confidence: 0.9, method: 'llm_extract', source_url: 'https://x.com', source_tier: 1 },
      ],
    }),
    makeEvent('llm_finished', {
      batch_id: 'b2',
      round: 2,
      candidates: [
        { field: 'dpi', value: '30000', confidence: 0.95, method: 'llm_extract', source_url: 'https://x.com', source_tier: 1 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, { round: 2 });
  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].field, 'dpi');
});

test('buildExtractionFields: sorts conflicts first then by confidence desc then alphabetical', () => {
  const events = [
    makeEvent('source_processed', {
      round: 1,
      candidates: [
        { field: 'dpi', value: '30000', confidence: 0.95, method: 'html_table', source_url: 'https://a.com', source_tier: 1 },
      ],
    }),
    makeEvent('source_processed', {
      round: 1,
      candidates: [
        { field: 'weight', value: '58g', confidence: 0.9, method: 'html_table', source_url: 'https://a.com', source_tier: 1 },
        { field: 'weight', value: '60g', confidence: 0.85, method: 'html_table', source_url: 'https://b.com', source_tier: 2 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  assert.ok(result.fields.length >= 2);
  assert.equal(result.fields[0].field, 'weight');
  assert.equal(result.fields[0].status, 'conflict');
});

test('buildExtractionFields: candidates array contains all raw candidates for a field', () => {
  const events = [
    makeEvent('llm_finished', {
      batch_id: 'b1',
      round: 1,
      candidates: [
        { field: 'sensor', value: 'PAW3950', confidence: 0.9, method: 'llm_extract', source_url: 'https://a.com', source_tier: 1, snippet_id: 's1', quote: 'sensor is PAW3950' },
        { field: 'sensor', value: 'PAW3950', confidence: 0.8, method: 'llm_extract', source_url: 'https://b.com', source_tier: 2, snippet_id: 's2', quote: 'uses PAW3950' },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'sensor');
  assert.ok(row);
  assert.ok(Array.isArray(row.candidates));
  assert.equal(row.candidates.length, 2);
  assert.equal(row.candidates[0].snippet_id, 's1');
});

test('buildExtractionFields: fills from sourcePackets when events lack candidates', () => {
  // Events with no candidates (mimics real source_processed events that have stripped payload)
  const events = [
    makeEvent('fields_filled_from_source', { url: 'https://mfr.com', fields: ['sensor'] }),
  ];
  const sourcePackets = [
    {
      canonical_url: 'https://mfr.com/product',
      source_key: 'https://mfr.com/product',
      source_metadata: { source_url: 'https://mfr.com/product' },
      field_key_map: {
        sensor: {
          contexts: [{
            assertions: [{
              field_key: 'sensor',
              value_raw: 'PAW3950',
              value_normalized: 'PAW3950',
              confidence: 0.92,
              extraction_method: 'spec_table_match',
              parser_phase: 'phase_04_html_spec_table',
            }],
          }],
        },
        dpi: {
          contexts: [{
            assertions: [{
              field_key: 'dpi',
              value_raw: '30000',
              value_normalized: '30000',
              confidence: 0.88,
              extraction_method: 'dom',
              parser_phase: 'phase_01_static_html',
            }],
          }],
        },
      },
    },
  ];
  const result = buildExtractionFields(events, { sourcePackets });
  assert.ok(result.fields.length >= 2, `expected >= 2 fields, got ${result.fields.length}`);

  const sensor = result.fields.find((f) => f.field === 'sensor');
  assert.ok(sensor, 'sensor field should exist');
  assert.equal(sensor.value, 'PAW3950');
  assert.equal(sensor.method, 'spec_table_match');
  assert.equal(sensor.status, 'accepted'); // because fields_filled_from_source has 'sensor'

  const dpi = result.fields.find((f) => f.field === 'dpi');
  assert.ok(dpi, 'dpi field should exist');
  assert.equal(dpi.value, '30000');
  assert.equal(dpi.method, 'dom');
});

test('buildExtractionFields: prefers event candidates over sourcePacket data for same field', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://mfr.com',
      round: 1,
      candidates: [
        { field: 'weight', value: '55g', confidence: 0.95, method: 'html_spec_table', source_url: 'https://mfr.com' },
      ],
    }),
  ];
  const sourcePackets = [
    {
      canonical_url: 'https://mfr.com',
      source_key: 'https://mfr.com',
      source_metadata: { source_url: 'https://mfr.com' },
      field_key_map: {
        weight: {
          contexts: [{
            assertions: [{
              field_key: 'weight',
              value_raw: '58g',
              confidence: 0.88,
              extraction_method: 'dom',
            }],
          }],
        },
      },
    },
  ];
  const result = buildExtractionFields(events, { sourcePackets });
  const row = result.fields.find((f) => f.field === 'weight');
  assert.ok(row, 'weight field should exist');
  // Event candidate has higher confidence and same host, so it wins
  assert.equal(row.value, '55g');
  assert.equal(row.confidence, 0.95);
});

// ── buildFallbackEvents ─────────────────────────────────────────

test('buildFallbackEvents: returns empty arrays for no events', () => {
  const result = buildFallbackEvents([], {});
  assert.ok(result && typeof result === 'object');
  assert.ok(Array.isArray(result.events));
  assert.ok(Array.isArray(result.host_profiles));
  assert.equal(result.events.length, 0);
  assert.equal(result.host_profiles.length, 0);
});

test('buildFallbackEvents: maps scheduler_fallback_started events', () => {
  const events = [
    makeEvent('scheduler_fallback_started', {
      url: 'https://a.com/page',
      from_mode: 'http',
      to_mode: 'playwright',
      reason: '403 Forbidden',
      attempt: 1,
    }),
  ];
  const result = buildFallbackEvents(events, {});
  assert.equal(result.events.length, 1);
  const row = result.events[0];
  assert.equal(row.url, 'https://a.com/page');
  assert.equal(row.host, 'a.com');
  assert.equal(row.from_mode, 'http');
  assert.equal(row.to_mode, 'playwright');
  assert.equal(row.reason, '403 Forbidden');
  assert.equal(row.attempt, 1);
  assert.equal(row.result, 'pending');
});

test('buildFallbackEvents: maps scheduler_fallback_succeeded events', () => {
  const events = [
    makeEvent('scheduler_fallback_started', {
      url: 'https://a.com/page',
      from_mode: 'http',
      to_mode: 'playwright',
      reason: '403',
      attempt: 1,
    }, '2026-02-23T12:00:00.000Z'),
    makeEvent('scheduler_fallback_succeeded', {
      url: 'https://a.com/page',
      from_mode: 'http',
      to_mode: 'playwright',
      elapsed_ms: 1200,
    }, '2026-02-23T12:00:02.000Z'),
  ];
  const result = buildFallbackEvents(events, {});
  const succeeded = result.events.find((e) => e.result === 'succeeded');
  assert.ok(succeeded);
  assert.equal(succeeded.elapsed_ms, 1200);
});

test('buildFallbackEvents: maps scheduler_fallback_exhausted events', () => {
  const events = [
    makeEvent('scheduler_fallback_exhausted', {
      url: 'https://a.com/page',
      from_mode: 'http',
      to_mode: 'playwright',
      reason: 'all modes failed',
      attempt: 3,
    }),
  ];
  const result = buildFallbackEvents(events, {});
  assert.ok(result.events.length >= 1);
  const row = result.events.find((e) => e.result === 'exhausted');
  assert.ok(row);
});

test('buildFallbackEvents: builds host profiles with success rate', () => {
  const events = [
    makeEvent('scheduler_fallback_started', {
      url: 'https://a.com/1',
      from_mode: 'http',
      to_mode: 'playwright',
      reason: '403',
      attempt: 1,
    }, '2026-02-23T12:00:00.000Z'),
    makeEvent('scheduler_fallback_succeeded', {
      url: 'https://a.com/1',
      from_mode: 'http',
      to_mode: 'playwright',
      elapsed_ms: 500,
    }, '2026-02-23T12:00:01.000Z'),
    makeEvent('scheduler_fallback_started', {
      url: 'https://a.com/2',
      from_mode: 'http',
      to_mode: 'crawlee',
      reason: '403',
      attempt: 1,
    }, '2026-02-23T12:00:02.000Z'),
    makeEvent('scheduler_fallback_exhausted', {
      url: 'https://a.com/2',
      from_mode: 'http',
      to_mode: 'crawlee',
      reason: 'all failed',
      attempt: 3,
    }, '2026-02-23T12:00:03.000Z'),
  ];
  const result = buildFallbackEvents(events, {});
  assert.ok(result.host_profiles.length >= 1);
  const profile = result.host_profiles.find((p) => p.host === 'a.com');
  assert.ok(profile);
  assert.equal(profile.fallback_total, 2);
  assert.equal(profile.success_count, 1);
  assert.equal(profile.exhaustion_count, 1);
  assert.ok(profile.success_rate >= 0 && profile.success_rate <= 1);
  assert.ok(Array.isArray(profile.modes_used));
});

test('buildFallbackEvents: sorts events newest-first', () => {
  const events = [
    makeEvent('scheduler_fallback_started', {
      url: 'https://a.com/1',
      from_mode: 'http',
      to_mode: 'playwright',
      reason: '403',
      attempt: 1,
    }, '2026-02-23T12:00:00.000Z'),
    makeEvent('scheduler_fallback_started', {
      url: 'https://b.com/2',
      from_mode: 'http',
      to_mode: 'crawlee',
      reason: '403',
      attempt: 1,
    }, '2026-02-23T13:00:00.000Z'),
  ];
  const result = buildFallbackEvents(events, {});
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].host, 'b.com');
  assert.equal(result.events[1].host, 'a.com');
});

test('buildFallbackEvents: respects limit option', () => {
  const events = [
    makeEvent('scheduler_fallback_started', { url: 'https://a.com/1', from_mode: 'http', to_mode: 'playwright', reason: '403', attempt: 1 }, '2026-02-23T12:00:00.000Z'),
    makeEvent('scheduler_fallback_started', { url: 'https://b.com/2', from_mode: 'http', to_mode: 'crawlee', reason: '403', attempt: 1 }, '2026-02-23T12:01:00.000Z'),
    makeEvent('scheduler_fallback_started', { url: 'https://c.com/3', from_mode: 'http', to_mode: 'playwright', reason: '403', attempt: 1 }, '2026-02-23T12:02:00.000Z'),
  ];
  const result = buildFallbackEvents(events, { limit: 2 });
  assert.equal(result.events.length, 2);
});

test('buildFallbackEvents: handles missing payload fields gracefully', () => {
  const events = [
    makeEvent('scheduler_fallback_started', {}),
  ];
  const result = buildFallbackEvents(events, {});
  assert.equal(result.events.length, 1);
  const row = result.events[0];
  assert.equal(row.url, '');
  assert.equal(row.from_mode, '');
  assert.equal(row.to_mode, '');
  assert.equal(row.attempt, 0);
});

test('buildFallbackEvents: host profile modes_used collects distinct modes', () => {
  const events = [
    makeEvent('scheduler_fallback_started', { url: 'https://a.com/1', from_mode: 'http', to_mode: 'playwright', reason: '403', attempt: 1 }),
    makeEvent('scheduler_fallback_started', { url: 'https://a.com/2', from_mode: 'http', to_mode: 'crawlee', reason: '403', attempt: 1 }),
    makeEvent('scheduler_fallback_started', { url: 'https://a.com/3', from_mode: 'http', to_mode: 'playwright', reason: '403', attempt: 1 }),
  ];
  const result = buildFallbackEvents(events, {});
  const profile = result.host_profiles.find((p) => p.host === 'a.com');
  assert.ok(profile);
  assert.ok(profile.modes_used.includes('playwright'));
  assert.ok(profile.modes_used.includes('crawlee'));
  assert.ok(profile.modes_used.includes('http'));
});

test('buildFallbackEvents: fetch_finished with fallback flag creates event', () => {
  const events = [
    makeEvent('fetch_finished', {
      url: 'https://a.com/page',
      status_code: 200,
      fallback: true,
      fallback_from: 'http',
      fallback_to: 'playwright',
      fallback_reason: 'timeout',
      elapsed_ms: 800,
    }),
  ];
  const result = buildFallbackEvents(events, {});
  assert.ok(result.events.length >= 1);
  const row = result.events[0];
  assert.equal(row.url, 'https://a.com/page');
  assert.equal(row.result, 'succeeded');
});

// ── buildQueueState ─────────────────────────────────────────────

test('buildQueueState: returns empty structure for no events', () => {
  const result = buildQueueState([], {});
  assert.ok(result && typeof result === 'object');
  assert.ok(Array.isArray(result.jobs));
  assert.ok(Array.isArray(result.lane_summary));
  assert.ok(Array.isArray(result.blocked_hosts));
  assert.equal(result.jobs.length, 0);
});

test('buildQueueState: aggregates repair_query_enqueued events into job rows', () => {
  const events = [
    makeEvent('repair_query_enqueued', {
      dedupe_key: 'repair-1',
      url: 'https://a.com/page',
      query: 'razer viper specs',
      reason: '404 not found',
      field_targets: ['weight', 'sensor'],
      lane: 'repair_search',
    }),
  ];
  const result = buildQueueState(events, {});
  assert.ok(result.jobs.length >= 1);
  const job = result.jobs[0];
  assert.equal(job.id, 'repair-1');
  assert.equal(job.lane, 'repair_search');
  assert.equal(job.status, 'queued');
  assert.equal(job.url, 'https://a.com/page');
  assert.equal(job.query, 'razer viper specs');
  assert.equal(job.reason, '404 not found');
  assert.ok(Array.isArray(job.field_targets));
  assert.equal(job.field_targets.length, 2);
});

test('buildQueueState: tracks job status from url_cooldown_applied events', () => {
  const events = [
    makeEvent('repair_query_enqueued', {
      dedupe_key: 'repair-1',
      url: 'https://a.com/page',
      lane: 'repair_search',
      reason: '404',
    }, '2026-02-23T12:00:00.000Z'),
    makeEvent('url_cooldown_applied', {
      dedupe_key: 'repair-1',
      url: 'https://a.com/page',
      status: 'cooldown',
      cooldown_until: '2026-02-23T12:30:00.000Z',
      reason: '403 cooldown',
    }, '2026-02-23T12:01:00.000Z'),
  ];
  const result = buildQueueState(events, {});
  const job = result.jobs.find((j) => j.id === 'repair-1');
  assert.ok(job);
  assert.equal(job.status, 'cooldown');
  assert.equal(job.cooldown_until, '2026-02-23T12:30:00.000Z');
});

test('buildQueueState: tracks blocked_domain_cooldown_applied as blocked hosts', () => {
  const events = [
    makeEvent('blocked_domain_cooldown_applied', {
      host: 'blocked.com',
      blocked_count: 5,
      threshold: 2,
      removed_count: 3,
    }),
  ];
  const result = buildQueueState(events, {});
  assert.ok(result.blocked_hosts.length >= 1);
  const entry = result.blocked_hosts.find((b) => b.host === 'blocked.com');
  assert.ok(entry);
  assert.equal(entry.blocked_count, 5);
  assert.equal(entry.threshold, 2);
  assert.equal(entry.removed_count, 3);
});

test('buildQueueState: groups jobs by lane in lane_summary', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: '404' }),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r2', url: 'https://b.com/2', lane: 'repair_search', reason: '410' }),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r3', url: 'https://c.com/3', lane: 'refetch', reason: 'stale' }),
  ];
  const result = buildQueueState(events, {});
  assert.ok(result.lane_summary.length >= 2);
  const repairLane = result.lane_summary.find((l) => l.lane === 'repair_search');
  assert.ok(repairLane);
  assert.equal(repairLane.queued, 2);
  const refetchLane = result.lane_summary.find((l) => l.lane === 'refetch');
  assert.ok(refetchLane);
  assert.equal(refetchLane.queued, 1);
});

test('buildQueueState: computes lane counts with mixed statuses', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: '404' }, '2026-02-23T12:00:00.000Z'),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r2', url: 'https://b.com/2', lane: 'repair_search', reason: '410' }, '2026-02-23T12:00:01.000Z'),
    makeEvent('url_cooldown_applied', { dedupe_key: 'r1', status: 'done', reason: 'repaired' }, '2026-02-23T12:01:00.000Z'),
    makeEvent('url_cooldown_applied', { dedupe_key: 'r2', status: 'failed', reason: 'still 404' }, '2026-02-23T12:01:01.000Z'),
  ];
  const result = buildQueueState(events, {});
  const repairLane = result.lane_summary.find((l) => l.lane === 'repair_search');
  assert.ok(repairLane);
  assert.equal(repairLane.done, 1);
  assert.equal(repairLane.failed, 1);
});

test('buildQueueState: includes transition history per job', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: '404' }, '2026-02-23T12:00:00.000Z'),
    makeEvent('url_cooldown_applied', { dedupe_key: 'r1', status: 'running', reason: 'started' }, '2026-02-23T12:01:00.000Z'),
    makeEvent('url_cooldown_applied', { dedupe_key: 'r1', status: 'done', reason: 'completed' }, '2026-02-23T12:02:00.000Z'),
  ];
  const result = buildQueueState(events, {});
  const job = result.jobs.find((j) => j.id === 'r1');
  assert.ok(job);
  assert.ok(Array.isArray(job.transitions));
  assert.equal(job.transitions.length, 2);
  assert.equal(job.transitions[0].to_status, 'running');
  assert.equal(job.transitions[1].to_status, 'done');
});

test('buildQueueState: respects limit option', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: '1' }),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r2', url: 'https://b.com/2', lane: 'repair_search', reason: '2' }),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r3', url: 'https://c.com/3', lane: 'repair_search', reason: '3' }),
  ];
  const result = buildQueueState(events, { limit: 2 });
  assert.ok(result.jobs.length <= 2);
});

test('buildQueueState: handles duplicate dedupe_keys with latest event winning', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: 'first' }, '2026-02-23T12:00:00.000Z'),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: 'second' }, '2026-02-23T12:01:00.000Z'),
  ];
  const result = buildQueueState(events, {});
  const jobs = result.jobs.filter((j) => j.id === 'r1');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].reason, 'second');
});

test('buildQueueState: extracts host from URL', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://example.com/page/1', lane: 'refetch', reason: 'stale' }),
  ];
  const result = buildQueueState(events, {});
  const job = result.jobs.find((j) => j.id === 'r1');
  assert.ok(job);
  assert.equal(job.host, 'example.com');
});

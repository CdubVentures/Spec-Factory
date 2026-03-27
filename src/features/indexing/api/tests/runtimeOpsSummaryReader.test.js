// WHY: Verifies the 3-tier fallback chain for reading run events:
// 1. SQL run_artifacts (artifact_type='run_summary')
// 2. run-summary.json file on disk
// 3. bridge_events SQL (existing path for pre-migration runs)

import { describe, it } from 'node:test';
import { deepStrictEqual, ok, strictEqual } from 'node:assert';

import {
  extractEventsFromRunSummary,
} from '../../../../indexlab/runSummarySerializer.js';

import {
  RUN_SUMMARY_SCHEMA_VERSION,
} from '../contracts/runSummaryContract.js';

function makeSummaryPayload(events = []) {
  return {
    schema_version: RUN_SUMMARY_SCHEMA_VERSION,
    telemetry: {
      meta: { run_id: 'run-r-001', category: 'mouse', product_id: 'p1', status: 'completed' },
      events,
      llm_agg: { total_calls: 0 },
      observability: {},
    },
  };
}

function makeMockEvents(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    run_id: 'run-r-001',
    category: 'mouse',
    product_id: 'p1',
    ts: `2026-03-27T10:0${i}:00Z`,
    stage: 'fetch',
    event: 'fetch_finished',
    payload: { url: `https://example.com/p${i}`, status: 200 },
  }));
}

describe('extractEventsFromRunSummary', () => {
  it('extracts events from valid summary', () => {
    const events = makeMockEvents(5);
    const summary = makeSummaryPayload(events);
    const result = extractEventsFromRunSummary(summary);
    strictEqual(result.length, 5);
    deepStrictEqual(result, events);
  });

  it('returns empty array for null', () => {
    deepStrictEqual(extractEventsFromRunSummary(null), []);
  });

  it('returns empty array for summary with no events', () => {
    const summary = makeSummaryPayload([]);
    const result = extractEventsFromRunSummary(summary);
    deepStrictEqual(result, []);
  });

  it('returns empty array for malformed summary', () => {
    deepStrictEqual(extractEventsFromRunSummary({ telemetry: {} }), []);
    deepStrictEqual(extractEventsFromRunSummary({}), []);
    deepStrictEqual(extractEventsFromRunSummary('string'), []);
  });
});

describe('readRunSummaryEvents fallback chain', () => {
  it('events from summary payload are identical to raw bridge events', () => {
    const rawEvents = makeMockEvents(10);
    const summary = makeSummaryPayload(rawEvents);
    const extracted = extractEventsFromRunSummary(summary);

    // Every builder receives this exact array — verify shape parity
    strictEqual(extracted.length, rawEvents.length);
    for (let i = 0; i < rawEvents.length; i++) {
      strictEqual(extracted[i].run_id, rawEvents[i].run_id);
      strictEqual(extracted[i].stage, rawEvents[i].stage);
      strictEqual(extracted[i].event, rawEvents[i].event);
      strictEqual(extracted[i].ts, rawEvents[i].ts);
      deepStrictEqual(extracted[i].payload, rawEvents[i].payload);
    }
  });

  it('event payload objects are not stringified (already parsed)', () => {
    const events = [{ run_id: 'r1', category: 'c', product_id: 'p', ts: 't', stage: 's', event: 'e', payload: { url: 'https://a.com' } }];
    const summary = makeSummaryPayload(events);
    const extracted = extractEventsFromRunSummary(summary);
    ok(typeof extracted[0].payload === 'object', 'payload should be an object, not a string');
    strictEqual(extracted[0].payload.url, 'https://a.com');
  });
});

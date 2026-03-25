import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsSummary } from '../runtimeOpsDataBuilders.js';
import {
  makeEvent,
  makeMeta,
} from './fixtures/runtimeOpsDataBuildersHarness.js';

test('buildRuntimeOpsSummary: empty events returns the baseline summary shape', () => {
  const result = buildRuntimeOpsSummary([], {});

  assert.ok(result && typeof result === 'object');
  assert.equal(result.status, 'unknown');
  assert.equal(result.round, 0);
  assert.equal(result.total_fetches, 0);
  assert.equal(result.total_parses, 0);
  assert.equal(result.total_llm_calls, 0);
  assert.equal(result.error_rate, 0);
  assert.equal(result.docs_per_min, 0);
  assert.equal(result.fields_per_min, 0);
  assert.deepEqual(result.top_blockers, []);
});

test('buildRuntimeOpsSummary: meta forwards status round and phase cursor while absent cursor falls back to empty', () => {
  const withCursor = buildRuntimeOpsSummary([], makeMeta({
    status: 'running',
    round: 3,
    phase_cursor: 'phase_03_search_profile',
  }));
  const withoutCursor = buildRuntimeOpsSummary([], makeMeta());

  assert.equal(withCursor.status, 'running');
  assert.equal(withCursor.round, 3);
  assert.equal(withCursor.phase_cursor, 'phase_03_search_profile');
  assert.equal(withoutCursor.phase_cursor, '');
});

test('buildRuntimeOpsSummary: counts real fetch and parse work while ignoring stage-scope lifecycle markers', () => {
  const events = [
    makeEvent('fetch_started', { scope: 'stage', trigger: 'run_started' }),
    makeEvent('fetch_started', { scope: 'url', url: 'https://a.com/1' }),
    makeEvent('fetch_finished', { scope: 'url', url: 'https://a.com/1', status: 200 }),
    makeEvent('fetch_started', { scope: 'url', url: 'https://b.com/2' }),
    makeEvent('fetch_finished', { scope: 'url', url: 'https://b.com/2', status_code: 403 }),
    makeEvent('fetch_finished', { scope: 'stage', reason: 'run_completed' }),
    makeEvent('parse_started', { scope: 'stage', trigger: 'source_processed' }),
    makeEvent('parse_started', { scope: 'url', url: 'https://a.com/1' }),
    makeEvent('parse_finished', { scope: 'url', url: 'https://a.com/1' }),
    makeEvent('parse_finished', { scope: 'stage', reason: 'run_completed' }),
  ];

  const result = buildRuntimeOpsSummary(events, makeMeta());

  assert.equal(result.total_fetches, 2);
  assert.equal(result.total_parses, 1);
  assert.ok(result.error_rate > 0);
  assert.ok(result.error_rate < 1);
});

test('buildRuntimeOpsSummary: llm calls and indexed field counts flow into the live rate metrics', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('parse_finished', { url: 'https://a.com/1' }, { ts: '2026-02-20T00:02:00.000Z' }),
    makeEvent('index_finished', { url: 'https://a.com/1', count: 11 }, { ts: '2026-02-20T00:03:00.000Z' }),
    makeEvent('llm_started', { batch_id: 'b1' }, { ts: '2026-02-20T00:03:30.000Z' }),
    makeEvent('llm_finished', { batch_id: 'b1', fields_extracted: 2 }, { ts: '2026-02-20T00:04:00.000Z' }),
    makeEvent('llm_started', { batch_id: 'b2' }, { ts: '2026-02-20T00:04:30.000Z' }),
    makeEvent('llm_finished', { batch_id: 'b2' }, { ts: '2026-02-20T00:05:00.000Z' }),
  ];

  const result = buildRuntimeOpsSummary(events, makeMeta());

  assert.equal(result.total_parses, 1);
  assert.equal(result.total_llm_calls, 2);
  assert.ok(result.fields_per_min > 1);
  assert.ok(result.fields_per_min < 1.2);
});

test('buildRuntimeOpsSummary: top blockers are grouped from repeated error hosts', () => {
  const events = [
    makeEvent('fetch_finished', { url: 'https://blocked.com/1', status_code: 403, error: 'forbidden' }),
    makeEvent('fetch_finished', { url: 'https://blocked.com/2', status_code: 403, error: 'forbidden' }),
    makeEvent('fetch_finished', { url: 'https://other.com/1', status_code: 200 }),
  ];

  const result = buildRuntimeOpsSummary(events, makeMeta());

  assert.ok(result.top_blockers.length >= 1);
  assert.equal(result.top_blockers[0].host, 'blocked.com');
});

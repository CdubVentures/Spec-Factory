import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPipelineFlow } from '../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

function makeEvent(event, payload = {}, overrides = {}) {
  return {
    run_id: 'run-001',
    ts: '2026-02-20T00:01:00.000Z',
    event,
    payload,
    ...overrides,
  };
}

test('buildPipelineFlow: empty events returns 5 zeroed stages', () => {
  const result = buildPipelineFlow([]);
  assert.ok(result);
  assert.ok(Array.isArray(result.stages));
  assert.equal(result.stages.length, 5);
  const names = result.stages.map((s) => s.name);
  assert.deepEqual(names, ['search', 'fetch', 'parse', 'index', 'llm']);
  for (const stage of result.stages) {
    assert.equal(stage.active, 0);
    assert.equal(stage.completed, 0);
    assert.equal(stage.failed, 0);
  }
  assert.ok(Array.isArray(result.recent_transitions));
  assert.equal(result.recent_transitions.length, 0);
});

test('buildPipelineFlow: active workers counted (started without finished)', () => {
  const events = [
    makeEvent('search_started', { query: 'test', worker_id: 'search-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:01.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/2', worker_id: 'fetch-2' }, { ts: '2026-02-20T00:01:02.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', worker_id: 'fetch-1', status_code: 200 }, { ts: '2026-02-20T00:01:03.000Z' }),
  ];
  const result = buildPipelineFlow(events);
  const search = result.stages.find((s) => s.name === 'search');
  const fetch = result.stages.find((s) => s.name === 'fetch');
  assert.equal(search.active, 1);
  assert.equal(fetch.active, 1);
  assert.equal(fetch.completed, 1);
});

test('buildPipelineFlow: transitions counted correctly', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', worker_id: 'fetch-1', status_code: 200 }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('parse_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:06.000Z' }),
    makeEvent('parse_finished', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:08.000Z' }),
  ];
  const result = buildPipelineFlow(events);
  assert.ok(result.recent_transitions.length >= 1);
  const t = result.recent_transitions[0];
  assert.equal(t.url, 'https://a.com/1');
  assert.ok(t.from_stage);
  assert.ok(t.to_stage);
});

test('buildPipelineFlow: recent_transitions capped at 20', () => {
  const events = [];
  for (let i = 0; i < 30; i++) {
    const url = `https://site.com/page-${i}`;
    events.push(
      makeEvent('fetch_started', { url, worker_id: `fetch-${i}` }, { ts: `2026-02-20T00:01:${String(i).padStart(2, '0')}.000Z` }),
      makeEvent('fetch_finished', { url, worker_id: `fetch-${i}`, status_code: 200 }, { ts: `2026-02-20T00:02:${String(i).padStart(2, '0')}.000Z` }),
    );
  }
  const result = buildPipelineFlow(events);
  assert.ok(result.recent_transitions.length <= 20);
});

test('buildPipelineFlow: failed events increment failed count', () => {
  const events = [
    makeEvent('llm_started', { batch_id: 'b1', worker_id: 'llm-b1' }),
    makeEvent('llm_failed', { batch_id: 'b1', worker_id: 'llm-b1', message: 'timeout' }),
  ];
  const result = buildPipelineFlow(events);
  const llm = result.stages.find((s) => s.name === 'llm');
  assert.equal(llm.failed, 1);
  assert.equal(llm.active, 0);
});

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeProductSources } from '../mergeProductSources.js';

function makeSource(overrides = {}) {
  return {
    url: 'https://example.com/page',
    final_url: 'https://example.com/page',
    host: 'example.com',
    content_hash: 'abc123def456',
    html_file: 'abc123def456.html.gz',
    screenshot_count: 1,
    status: 200,
    first_seen_run_id: 'run-001',
    last_seen_run_id: 'run-001',
    ...overrides,
  };
}

describe('mergeProductSources', () => {
  test('both empty returns empty array', () => {
    assert.deepEqual(mergeProductSources({ existing: [], incoming: [], runId: 'run-002' }), []);
  });

  test('no existing + incoming adds all with first/last = runId', () => {
    const incoming = [
      makeSource({ content_hash: 'aaa', first_seen_run_id: 'run-002', last_seen_run_id: 'run-002' }),
      makeSource({ content_hash: 'bbb', first_seen_run_id: 'run-002', last_seen_run_id: 'run-002' }),
    ];
    const merged = mergeProductSources({ existing: [], incoming, runId: 'run-002' });
    assert.equal(merged.length, 2);
    assert.equal(merged[0].first_seen_run_id, 'run-002');
    assert.equal(merged[1].first_seen_run_id, 'run-002');
  });

  test('existing + no incoming returns existing unchanged', () => {
    const existing = [makeSource({ content_hash: 'aaa' })];
    const merged = mergeProductSources({ existing, incoming: [], runId: 'run-002' });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].last_seen_run_id, 'run-001');
  });

  test('same content_hash updates last_seen_run_id, preserves first_seen_run_id', () => {
    const existing = [makeSource({ content_hash: 'aaa', first_seen_run_id: 'run-001', last_seen_run_id: 'run-001' })];
    const incoming = [makeSource({ content_hash: 'aaa', first_seen_run_id: 'run-002', last_seen_run_id: 'run-002' })];
    const merged = mergeProductSources({ existing, incoming, runId: 'run-002' });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].first_seen_run_id, 'run-001');
    assert.equal(merged[0].last_seen_run_id, 'run-002');
  });

  test('different content_hash adds new entry', () => {
    const existing = [makeSource({ content_hash: 'aaa' })];
    const incoming = [makeSource({ content_hash: 'bbb', url: 'https://other.com' })];
    const merged = mergeProductSources({ existing, incoming, runId: 'run-002' });
    assert.equal(merged.length, 2);
  });

  test('null content_hash always added (no dedup)', () => {
    const existing = [makeSource({ content_hash: null })];
    const incoming = [makeSource({ content_hash: null })];
    const merged = mergeProductSources({ existing, incoming, runId: 'run-002' });
    assert.equal(merged.length, 2);
  });

  test('existing order preserved, new entries appended', () => {
    const existing = [makeSource({ content_hash: 'aaa', url: 'first' }), makeSource({ content_hash: 'bbb', url: 'second' })];
    const incoming = [makeSource({ content_hash: 'ccc', url: 'third' })];
    const merged = mergeProductSources({ existing, incoming, runId: 'run-002' });
    assert.equal(merged[0].url, 'first');
    assert.equal(merged[1].url, 'second');
    assert.equal(merged[2].url, 'third');
  });

  test('original existing array not mutated', () => {
    const existing = [makeSource({ content_hash: 'aaa', last_seen_run_id: 'run-001' })];
    const snapshot = JSON.parse(JSON.stringify(existing));
    mergeProductSources({ existing, incoming: [makeSource({ content_hash: 'aaa' })], runId: 'run-002' });
    assert.deepEqual(existing, snapshot);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsDocumentDetail } from '../runtimeOpsDataBuilders.js';
import { makeEvent } from './fixtures/runtimeOpsDataBuildersHarness.js';

test('buildRuntimeOpsDocumentDetail: returns null for an unknown URL', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1' }),
  ];

  const result = buildRuntimeOpsDocumentDetail(events, 'https://unknown.com/missing');

  assert.equal(result, null);
});

test('buildRuntimeOpsDocumentDetail: returns the full lifecycle timeline for a known URL', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/page' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/page', status_code: 200, bytes: 3000 }, { ts: '2026-02-20T00:01:02.000Z' }),
    makeEvent('parse_started', { url: 'https://a.com/page' }, { ts: '2026-02-20T00:01:03.000Z' }),
    makeEvent('parse_finished', { url: 'https://a.com/page', parse_method: 'cheerio', candidates: 5 }, { ts: '2026-02-20T00:01:04.000Z' }),
    makeEvent('index_started', { url: 'https://a.com/page' }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('index_finished', { url: 'https://a.com/page', evidence_chunks: 3 }, { ts: '2026-02-20T00:01:06.000Z' }),
  ];

  const result = buildRuntimeOpsDocumentDetail(events, 'https://a.com/page');

  assert.ok(result);
  assert.equal(result.url, 'https://a.com/page');
  assert.ok(Array.isArray(result.timeline));
  assert.ok(result.timeline.length >= 3);
  assert.equal(result.status_code, 200);
  assert.equal(result.bytes, 3000);
  assert.equal(result.evidence_chunks, 3);
});

test('buildRuntimeOpsDocumentDetail: runtime-bridge status payload populates status_code', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/page' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/page', status: 200, bytes: 3000 }, { ts: '2026-02-20T00:01:02.000Z' }),
  ];

  const result = buildRuntimeOpsDocumentDetail(events, 'https://a.com/page');

  assert.ok(result);
  assert.equal(result.status_code, 200);
  assert.equal(result.bytes, 3000);
});

test('buildRuntimeOpsDocumentDetail: source processing backfills bytes and parse method when fetch telemetry is thin', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/page' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('parse_finished', { url: 'https://a.com/page' }, { ts: '2026-02-20T00:01:03.000Z' }),
    makeEvent('source_processed', {
      url: 'https://a.com/page',
      status: 200,
      bytes: 39138,
      content_type: 'text/html',
      article_extraction_method: 'readability',
    }, { ts: '2026-02-20T00:01:04.000Z' }),
  ];

  const result = buildRuntimeOpsDocumentDetail(events, 'https://a.com/page');

  assert.ok(result);
  assert.equal(result.status_code, 200);
  assert.equal(result.bytes, 39138);
  assert.equal(result.parse_method, 'readability');
});

test('buildRuntimeOpsDocumentDetail: empty parse payload does not erase a parse method learned earlier', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://a.com/page',
      status: 200,
      bytes: 39138,
      content_type: 'text/html',
      article_extraction_method: 'readability',
    }, { ts: '2026-02-20T00:01:04.000Z' }),
    makeEvent('parse_finished', {
      url: 'https://a.com/page',
      parse_method: '',
    }, { ts: '2026-02-20T00:01:04.000Z' }),
  ];

  const result = buildRuntimeOpsDocumentDetail(events, 'https://a.com/page');

  assert.ok(result);
  assert.equal(result.parse_method, 'readability');
});

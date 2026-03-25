import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsDocuments } from '../runtimeOpsDataBuilders.js';
import { makeEvent } from './fixtures/runtimeOpsDataBuildersHarness.js';

test('buildRuntimeOpsDocuments: empty events returns no rows', () => {
  const result = buildRuntimeOpsDocuments([], {});
  assert.deepEqual(result, []);
});

test('buildRuntimeOpsDocuments: aggregates fetch and parse lifecycle rows newest-first', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/page1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/page1', status_code: 200, bytes: 5000 }, { ts: '2026-02-20T00:01:02.000Z' }),
    makeEvent('parse_started', { url: 'https://a.com/page1' }, { ts: '2026-02-20T00:01:03.000Z' }),
    makeEvent('parse_finished', { url: 'https://a.com/page1', parse_method: 'cheerio' }, { ts: '2026-02-20T00:01:04.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/page2' }, { ts: '2026-02-20T00:02:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://b.com/page2', status_code: 403 }, { ts: '2026-02-20T00:02:01.000Z' }),
  ];

  const result = buildRuntimeOpsDocuments(events, {});

  assert.equal(result.length, 2);
  assert.equal(result[0].url, 'https://b.com/page2');
  assert.equal(result[1].url, 'https://a.com/page1');
});

test('buildRuntimeOpsDocuments: runtime-bridge status payload sets fetched status and code', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/page1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/page1', status: 200, bytes: 5000 }, { ts: '2026-02-20T00:01:02.000Z' }),
  ];

  const result = buildRuntimeOpsDocuments(events, {});

  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'fetched');
  assert.equal(result[0].status_code, 200);
});

test('buildRuntimeOpsDocuments: source processing backfills parsed document metadata', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/page1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('parse_finished', { url: 'https://a.com/page1' }, { ts: '2026-02-20T00:01:03.000Z' }),
    makeEvent('source_processed', {
      url: 'https://a.com/page1',
      status: 200,
      bytes: 436975,
      content_type: 'text/html',
      content_hash: 'd0d8a9d07ae54ee7db145521bf7b73583e224bed8047c337e9a0ee98d1586bbe',
      article_extraction_method: 'readability',
    }, { ts: '2026-02-20T00:01:04.000Z' }),
  ];

  const result = buildRuntimeOpsDocuments(events, {});

  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'parsed');
  assert.equal(result[0].status_code, 200);
  assert.equal(result[0].bytes, 436975);
  assert.equal(result[0].content_type, 'text/html');
  assert.equal(result[0].content_hash, 'd0d8a9d0');
  assert.equal(result[0].parse_method, 'readability');
});

test('buildRuntimeOpsDocuments: empty parse payload does not erase a parse method learned earlier', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://a.com/page1',
      status: 200,
      bytes: 436975,
      content_type: 'text/html',
      content_hash: 'd0d8a9d07ae54ee7db145521bf7b73583e224bed8047c337e9a0ee98d1586bbe',
      article_extraction_method: 'readability',
    }, { ts: '2026-02-20T00:01:04.000Z' }),
    makeEvent('parse_finished', {
      url: 'https://a.com/page1',
      parse_method: '',
    }, { ts: '2026-02-20T00:01:04.000Z' }),
  ];

  const result = buildRuntimeOpsDocuments(events, {});

  assert.equal(result.length, 1);
  assert.equal(result[0].parse_method, 'readability');
});

test('buildRuntimeOpsDocuments: limit trims the newest-first list', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/2' }, { ts: '2026-02-20T00:02:00.000Z' }),
    makeEvent('fetch_started', { url: 'https://c.com/3' }, { ts: '2026-02-20T00:03:00.000Z' }),
  ];

  const result = buildRuntimeOpsDocuments(events, { limit: 2 });

  assert.equal(result.length, 2);
  assert.equal(result[0].url, 'https://c.com/3');
  assert.equal(result[1].url, 'https://b.com/2');
});

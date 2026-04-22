// WHY: B6 — join triage metadata (hint_source / providers) from orderedSources
// back onto crawlResults after runFetchPlan strips everything but URL+response.
// Tier is derived from hint_source prefix to mirror the query-row shape.

import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichCrawlResults, deriveTierFromHintSource } from '../enrichCrawlResults.js';

function makeResult(url, extras = {}) {
  return { url, finalUrl: url, status: 200, html: '<html></html>', ...extras };
}
function makeSource(url, triageMeta) {
  return { url, host: new URL(url).host, triageMeta };
}

test('deriveTierFromHintSource maps tier1/2/3 prefixes to seed/group_search/key_search', () => {
  assert.equal(deriveTierFromHintSource('tier1_seed'), 'seed');
  assert.equal(deriveTierFromHintSource('tier2_group'), 'group_search');
  assert.equal(deriveTierFromHintSource('tier2_group_search'), 'group_search');
  assert.equal(deriveTierFromHintSource('tier3_key'), 'key_search');
  assert.equal(deriveTierFromHintSource('tier3_key_search'), 'key_search');
  assert.equal(deriveTierFromHintSource(null), null);
  assert.equal(deriveTierFromHintSource(''), null);
  assert.equal(deriveTierFromHintSource('unknown'), null);
});

test('enrichCrawlResults attaches hint_source / tier / providers by URL', () => {
  const crawlResults = [
    makeResult('https://rtings.com/a'),
    makeResult('https://techpowerup.com/b'),
  ];
  const orderedSources = [
    makeSource('https://rtings.com/a', { hint_source: 'tier1_seed', providers: ['serper'] }),
    makeSource('https://techpowerup.com/b', { hint_source: 'tier2_group', providers: ['serper', 'bing'] }),
  ];

  const out = enrichCrawlResults(crawlResults, orderedSources);

  assert.equal(out.length, 2);
  assert.equal(out[0].hint_source, 'tier1_seed');
  assert.equal(out[0].tier, 'seed');
  assert.deepEqual(out[0].providers, ['serper']);
  assert.equal(out[1].hint_source, 'tier2_group');
  assert.equal(out[1].tier, 'group_search');
  assert.deepEqual(out[1].providers, ['serper', 'bing']);
});

test('enrichCrawlResults preserves the original crawl fields', () => {
  const crawlResults = [makeResult('https://x.com', { success: true, blocked: false, workerId: 'fetch-1' })];
  const orderedSources = [makeSource('https://x.com', { hint_source: 'tier1_seed', providers: ['serper'] })];

  const out = enrichCrawlResults(crawlResults, orderedSources);
  assert.equal(out[0].url, 'https://x.com');
  assert.equal(out[0].success, true);
  assert.equal(out[0].workerId, 'fetch-1');
  assert.equal(out[0].status, 200);
});

test('enrichCrawlResults yields nulls when url not in orderedSources map', () => {
  const crawlResults = [makeResult('https://unknown.com')];
  const orderedSources = [makeSource('https://known.com', { hint_source: 'tier1_seed', providers: ['serper'] })];

  const out = enrichCrawlResults(crawlResults, orderedSources);
  assert.equal(out[0].hint_source, null);
  assert.equal(out[0].tier, null);
  assert.equal(out[0].providers, null);
});

test('enrichCrawlResults handles missing triageMeta on orderedSource', () => {
  const crawlResults = [makeResult('https://x.com')];
  const orderedSources = [{ url: 'https://x.com', host: 'x.com' }]; // no triageMeta

  const out = enrichCrawlResults(crawlResults, orderedSources);
  assert.equal(out[0].hint_source, null);
  assert.equal(out[0].tier, null);
  assert.equal(out[0].providers, null);
});

test('enrichCrawlResults handles empty inputs', () => {
  assert.deepEqual(enrichCrawlResults([], []), []);
  assert.deepEqual(enrichCrawlResults(null, null), []);
  assert.deepEqual(enrichCrawlResults(undefined, undefined), []);
});

test('enrichCrawlResults matches by final_url when it differs from url', () => {
  // WHY: redirects — crawlResult.url is the original request, finalUrl is after
  // redirect. The source map keys by request URL so we want to match on url.
  const crawlResults = [makeResult('https://short.co/abc', { finalUrl: 'https://real.site/page' })];
  const orderedSources = [makeSource('https://short.co/abc', { hint_source: 'tier1_seed', providers: ['serper'] })];

  const out = enrichCrawlResults(crawlResults, orderedSources);
  assert.equal(out[0].hint_source, 'tier1_seed', 'matches by request url, not finalUrl');
});

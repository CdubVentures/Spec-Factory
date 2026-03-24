import test from 'node:test';
import assert from 'node:assert/strict';
import { FrontierDb } from '../frontierDb.js';

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
    async readJsonOrNull(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async writeObject(key, body) {
      data.set(key, JSON.parse(Buffer.from(body).toString('utf8')));
    },
    snapshot(key) {
      return data.get(key);
    }
  };
}

// ── recordQuery + getQueryRecord ──

test('FrontierDb.recordQuery stores and retrieves query record', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json' });

  db.recordQuery({
    productId: 'p1',
    query: 'razer viper specs',
    provider: 'searxng',
    fields: ['weight'],
    results: [{ url: 'https://example.com/spec' }]
  });

  const record = db.getQueryRecord({ productId: 'p1', query: 'razer viper specs' });
  assert.ok(record);
  assert.equal(record.query_text, 'razer viper specs');
  assert.equal(record.provider, 'searxng');
  assert.equal(record.results.length, 1);
});

test('FrontierDb.getQueryRecord returns null for unknown query', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json' });

  const record = db.getQueryRecord({ productId: 'p1', query: 'unknown query' });
  assert.equal(record, null);
});

test('FrontierDb.recordQuery persists tier metadata when provided', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json', cooldownMs: 0 });

  db.recordQuery({
    productId: 'p1',
    query: 'brand model specifications',
    provider: 'google',
    fields: ['weight'],
    results: [{ url: 'https://x.com', title: 'T', host: 'x.com', snippet: '' }],
    tier: 'seed',
    group_key: null,
    normalized_key: null,
    hint_source: 'tier1_seed',
  });

  const record = db.getQueryRecord({ productId: 'p1', query: 'brand model specifications' });
  assert.equal(record.tier, 'seed');
  assert.equal(record.group_key, null);
  assert.equal(record.hint_source, 'tier1_seed');
});

test('FrontierDb.recordQuery defaults tier fields to null when not provided', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json', cooldownMs: 0 });

  db.recordQuery({
    productId: 'p1',
    query: 'some query',
    provider: 'bing',
    fields: [],
    results: [],
  });

  const record = db.getQueryRecord({ productId: 'p1', query: 'some query' });
  assert.equal(record.tier, null);
  assert.equal(record.group_key, null);
  assert.equal(record.normalized_key, null);
  assert.equal(record.hint_source, null);
});

// ── recordFetch + getUrlRow ──

test('FrontierDb.recordFetch stores and retrieves URL row', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json' });

  db.recordFetch({
    productId: 'p1',
    url: 'https://example.com/spec',
    status: 200,
    contentType: 'text/html',
    fieldsFound: ['weight', 'dpi'],
    confidence: 0.9
  });

  const row = db.getUrlRow('https://example.com/spec');
  assert.ok(row);
  assert.equal(row.last_status, 200);
  assert.ok(row.fields_found.includes('weight'));
  assert.ok(row.fields_found.includes('dpi'));
});

test('FrontierDb.getUrlRow returns empty object for unknown URL', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json' });

  const row = db.getUrlRow('https://unknown.com/page');
  assert.deepStrictEqual(row, {});
});

test('FrontierDb.recordFetch merges fields_found across multiple fetches', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json' });

  db.recordFetch({
    productId: 'p1',
    url: 'https://example.com/spec',
    status: 200,
    fieldsFound: ['weight'],
  });
  db.recordFetch({
    productId: 'p1',
    url: 'https://example.com/spec',
    status: 200,
    fieldsFound: ['dpi', 'polling_rate'],
  });

  const row = db.getUrlRow('https://example.com/spec');
  assert.ok(row.fields_found.includes('weight'));
  assert.ok(row.fields_found.includes('dpi'));
  assert.ok(row.fields_found.includes('polling_rate'));
  assert.equal(row.fetch_count, 2);
});

// ── buildQueryExecutionHistory ──

test('FrontierDb.buildQueryExecutionHistory returns empty for unknown product', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json', cooldownMs: 0 });

  const history = db.buildQueryExecutionHistory('unknown');
  assert.deepStrictEqual(history, { queries: [] });
});

test('FrontierDb.buildQueryExecutionHistory maps tier metadata from recorded queries', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json', cooldownMs: 0 });

  db.recordQuery({
    productId: 'p1', query: 'brand model specs', provider: 'google',
    fields: ['weight'], results: [{ url: 'https://a.com', title: '', host: 'a.com', snippet: '' }],
    tier: 'seed', group_key: null, normalized_key: null,
  });
  db.recordQuery({
    productId: 'p1', query: 'brand model sensor dpi', provider: 'google',
    fields: ['sensor', 'dpi'], results: [{ url: 'https://b.com', title: '', host: 'b.com', snippet: '' }],
    tier: 'group_search', group_key: 'sensor_performance', normalized_key: null,
  });
  db.recordQuery({
    productId: 'p1', query: 'brand model battery hours', provider: 'google',
    fields: ['battery_hours'], results: [],
    tier: 'key_search', group_key: 'connectivity', normalized_key: 'battery hours',
  });

  const history = db.buildQueryExecutionHistory('p1');
  assert.equal(history.queries.length, 3);

  const seed = history.queries.find(q => q.tier === 'seed');
  assert.ok(seed);
  assert.equal(seed.group_key, null);

  const group = history.queries.find(q => q.tier === 'group_search');
  assert.ok(group);
  assert.equal(group.group_key, 'sensor_performance');

  const key = history.queries.find(q => q.tier === 'key_search');
  assert.ok(key);
  assert.equal(key.normalized_key, 'battery hours');
});

test('FrontierDb.buildQueryExecutionHistory handles legacy queries without tier', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json', cooldownMs: 0 });

  db.recordQuery({
    productId: 'p1', query: 'old query', provider: 'bing',
    fields: [], results: [],
  });

  const history = db.buildQueryExecutionHistory('p1');
  assert.equal(history.queries.length, 1);
  assert.equal(history.queries[0].tier, null);
});

// ---------------------------------------------------------------------------
// aggregateDomainStats
// ---------------------------------------------------------------------------

test('aggregateDomainStats returns empty map for no domains', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, config: {} });
  const stats = db.aggregateDomainStats([]);
  assert.equal(stats.size, 0);
});

test('aggregateDomainStats returns zeros for unknown domain', () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, config: {} });
  const stats = db.aggregateDomainStats(['unknown.com']);
  assert.equal(stats.size, 1);
  const s = stats.get('unknown.com');
  assert.equal(s.fetch_count, 0);
  assert.equal(s.ok_count, 0);
  assert.equal(s.blocked_count, 0);
  assert.equal(s.success_rate, 0);
  assert.equal(s.avg_latency_ms, 0);
  assert.equal(s.cooldown_remaining_ms, 0);
  assert.equal(s.last_blocked_ts, null);
});

test('aggregateDomainStats aggregates fetch history from recorded URLs', () => {
  const storage = createStorage();
  const db = new FrontierDb({
    storage,
    config: {
      frontierCooldown403BaseSeconds: 60,
      frontierCooldown429BaseSeconds: 60,
      frontierBackoffMaxExponent: 3,
      frontierCooldown404Seconds: 3600,
      frontierCooldown404RepeatSeconds: 7200,
      frontierCooldown410Seconds: 86400,
      frontierCooldownTimeoutSeconds: 300,
      frontierPathPenaltyNotfoundThreshold: 3,
    },
  });

  db.recordFetch({ productId: 'p1', url: 'https://rtings.com/page1', status: 200, elapsedMs: 100 });
  db.recordFetch({ productId: 'p1', url: 'https://rtings.com/page2', status: 200, elapsedMs: 200 });
  db.recordFetch({ productId: 'p1', url: 'https://rtings.com/page3', status: 403, elapsedMs: 50 });
  db.recordFetch({ productId: 'p1', url: 'https://example.com/spec', status: 200, elapsedMs: 300 });

  const stats = db.aggregateDomainStats(['rtings.com', 'example.com']);
  assert.equal(stats.size, 2);

  const rtings = stats.get('rtings.com');
  assert.equal(rtings.fetch_count, 3);
  assert.equal(rtings.ok_count, 2);
  assert.equal(rtings.blocked_count, 1);
  assert.ok(rtings.success_rate > 0.6 && rtings.success_rate < 0.7);
  assert.ok(rtings.avg_latency_ms > 0);
  assert.ok(rtings.last_blocked_ts !== null);

  const example = stats.get('example.com');
  assert.equal(example.fetch_count, 1);
  assert.equal(example.ok_count, 1);
  assert.equal(example.blocked_count, 0);
  assert.equal(example.success_rate, 1);
  assert.equal(example.last_blocked_ts, null);
});

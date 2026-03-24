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

test('FrontierDb deduplicates queries per product during cooldown window', async () => {
  const storage = createStorage();
  const db = new FrontierDb({
    storage,
    key: 'specs/outputs/_intel/frontier/frontier.json',
    config: {
      frontierQueryCooldownSeconds: 3600
    }
  });
  await db.load();

  assert.equal(db.shouldSkipQuery({ productId: 'p1', query: 'razer viper specs' }), false);
  db.recordQuery({
    productId: 'p1',
    query: 'razer viper specs',
    provider: 'searxng',
    fields: ['weight'],
    results: [{ url: 'https://example.com/spec' }]
  });
  assert.equal(db.shouldSkipQuery({ productId: 'p1', query: 'razer viper specs' }), true);
  assert.equal(db.shouldSkipQuery({ productId: 'p2', query: 'razer viper specs' }), false);
});

test('FrontierDb enforces URL cooldown for repeated 404 responses', async () => {
  const storage = createStorage();
  const db = new FrontierDb({
    storage,
    key: 'specs/outputs/_intel/frontier/frontier.json',
    config: {
      frontierCooldown404Seconds: 60,
      frontierCooldown404RepeatSeconds: 120
    }
  });
  await db.load();

  const url = 'https://example.com/spec?utm_source=x';
  assert.equal(db.shouldSkipUrl(url).skip, false);
  db.recordFetch({
    productId: 'p1',
    url,
    status: 404
  });
  const first = db.shouldSkipUrl(url);
  assert.equal(first.skip, true);
  assert.equal(first.reason, 'cooldown');

  db.recordFetch({
    productId: 'p1',
    url,
    status: 404
  });
  db.recordFetch({
    productId: 'p1',
    url,
    status: 404
  });
  const row = db.getUrlRow(url);
  assert.equal(row.cooldown.reason, 'status_404_repeated');
});

test('FrontierDb applies cooldown for 403 with backoff reason', async () => {
  const storage = createStorage();
  const db = new FrontierDb({
    storage,
    key: 'specs/outputs/_intel/frontier/frontier.json',
    config: {
      frontierCooldown403BaseSeconds: 60
    }
  });
  await db.load();

  const url = 'https://example.com/forbidden';
  db.recordFetch({
    productId: 'p1',
    url,
    status: 403
  });
  const first = db.shouldSkipUrl(url);
  assert.equal(first.skip, true);
  const row = db.getUrlRow(url);
  assert.equal(row.cooldown.reason, 'status_403_backoff');
});

test('FrontierDb respects custom frontierBackoffMaxExponent caps', async () => {
  const storage = createStorage();
  const db = new FrontierDb({
    storage,
    key: 'specs/outputs/_intel/frontier/frontier.json',
    config: {
      frontierCooldown403BaseSeconds: 60,
      frontierBackoffMaxExponent: 2,
    }
  });
  await db.load();

  const url = 'https://example.com/rate-limited';
  for (let idx = 0; idx < 6; idx += 1) {
    db.recordFetch({
      productId: 'p1',
      url,
      status: 403
    });
  }

  const row = db.getUrlRow(url);
  assert.equal(row.cooldown.reason, 'status_403_backoff');
  assert.equal(row.cooldown.seconds, 240);
});

test('FrontierDb records yields and produces product snapshot', async () => {
  const storage = createStorage();
  const key = 'specs/outputs/_intel/frontier/frontier.json';
  const db = new FrontierDb({ storage, key });
  await db.load();

  db.recordQuery({
    productId: 'mouse-1',
    query: 'mouse weight specs',
    provider: 'searxng',
    fields: ['weight'],
    results: [{ url: 'https://example.com/p1' }]
  });
  db.recordFetch({
    productId: 'mouse-1',
    url: 'https://example.com/p1',
    status: 200,
    contentType: 'text/html',
    fieldsFound: ['weight', 'dpi'],
    confidence: 0.9
  });

  const snapshot = db.snapshotForProduct('mouse-1');
  assert.equal(snapshot.query_count, 1);
  assert.equal(snapshot.url_count >= 1, true);
  assert.equal(snapshot.field_yield.weight >= 1, true);

  await db.save();
  assert.equal(Boolean(storage.snapshot(key)), true);
});

// ── Tier metadata on query recording ──

test('FrontierDb.recordQuery persists tier metadata when provided', async () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json', cooldownMs: 0 });
  await db.load();

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

test('FrontierDb.recordQuery defaults tier fields to null when not provided', async () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json', cooldownMs: 0 });
  await db.load();

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

// ── buildQueryExecutionHistory ──

test('FrontierDb.buildQueryExecutionHistory returns empty for unknown product', async () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json', cooldownMs: 0 });
  await db.load();

  const history = db.buildQueryExecutionHistory('unknown');
  assert.deepStrictEqual(history, { queries: [] });
});

test('FrontierDb.buildQueryExecutionHistory maps tier metadata from recorded queries', async () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json', cooldownMs: 0 });
  await db.load();

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

test('FrontierDb.buildQueryExecutionHistory handles legacy queries without tier', async () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, key: 'frontier.json', cooldownMs: 0 });
  await db.load();

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

test('aggregateDomainStats returns empty map for no domains', async () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, config: {} });
  await db.load();
  const stats = db.aggregateDomainStats([]);
  assert.equal(stats.size, 0);
});

test('aggregateDomainStats returns zeros for unknown domain', async () => {
  const storage = createStorage();
  const db = new FrontierDb({ storage, config: {} });
  await db.load();
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

test('aggregateDomainStats aggregates fetch history from recorded URLs', async () => {
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
  await db.load();

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

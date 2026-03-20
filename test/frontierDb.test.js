import test from 'node:test';
import assert from 'node:assert/strict';
import { FrontierDb } from '../src/research/frontierDb.js';

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

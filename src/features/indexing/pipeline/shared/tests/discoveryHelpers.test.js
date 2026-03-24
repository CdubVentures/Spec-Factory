/**
 * Unit tests for discoveryHelpers.js
 *
 * Phase 4A: Tests for the 10 helper functions extracted from searchDiscovery.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runWithConcurrency,
  mergeLearningStoreHintsIntoLexicon,
  loadLearningArtifacts,
  buildSearchProfileKeys,
  writeSearchProfileArtifacts,
  buildQueryAttemptStats,
  normalizeTriageScore,
  normalizeSourceEntryDiscovery,
  resolveEnabledSourceEntries,
} from '../helpers.js';

// ---------------------------------------------------------------------------
// 1. runWithConcurrency
// ---------------------------------------------------------------------------

test('runWithConcurrency: empty items returns empty array', async () => {
  const result = await runWithConcurrency([], 2, async (item) => item);
  assert.deepStrictEqual(result, []);
});

test('runWithConcurrency: null/undefined items returns empty array', async () => {
  assert.deepStrictEqual(await runWithConcurrency(null, 1, async (x) => x), []);
  assert.deepStrictEqual(await runWithConcurrency(undefined, 1, async (x) => x), []);
});

test('runWithConcurrency: processes all items in order', async () => {
  const items = [10, 20, 30];
  const result = await runWithConcurrency(items, 1, async (item) => item * 2);
  assert.deepStrictEqual(result, [20, 40, 60]);
});

test('runWithConcurrency: concurrency > items works', async () => {
  const result = await runWithConcurrency([1, 2], 10, async (item) => item + 1);
  assert.deepStrictEqual(result, [2, 3]);
});

test('runWithConcurrency: worker receives index', async () => {
  const indices = [];
  await runWithConcurrency(['a', 'b', 'c'], 2, async (item, index) => {
    indices.push(index);
  });
  assert.deepStrictEqual(indices.sort(), [0, 1, 2]);
});

// ---------------------------------------------------------------------------
// 2. mergeLearningStoreHintsIntoLexicon
// ---------------------------------------------------------------------------

test('mergeLearningStoreHintsIntoLexicon: null hints returns lexicon unchanged', () => {
  const lexicon = { fields: { weight: { synonyms: { grams: { count: 1 } } } } };
  const result = mergeLearningStoreHintsIntoLexicon(lexicon, null);
  assert.deepStrictEqual(result, lexicon);
});

test('mergeLearningStoreHintsIntoLexicon: merges active anchors with weight 3', () => {
  const result = mergeLearningStoreHintsIntoLexicon(
    { fields: {} },
    { anchorsByField: { sensor: [{ phrase: 'optical sensor', decayStatus: 'active' }] } }
  );
  assert.equal(result.fields.sensor.synonyms['optical sensor'].count, 3);
});

test('mergeLearningStoreHintsIntoLexicon: decayed anchors get weight 1', () => {
  const result = mergeLearningStoreHintsIntoLexicon(
    { fields: {} },
    { anchorsByField: { dpi: [{ phrase: 'dots per inch', decayStatus: 'decayed' }] } }
  );
  assert.equal(result.fields.dpi.synonyms['dots per inch'].count, 1);
});

test('mergeLearningStoreHintsIntoLexicon: skips expired anchors', () => {
  const result = mergeLearningStoreHintsIntoLexicon(
    { fields: {} },
    { anchorsByField: { dpi: [{ phrase: 'old phrase', decayStatus: 'expired' }] } }
  );
  assert.deepStrictEqual(result.fields.dpi?.synonyms || {}, {});
});

test('mergeLearningStoreHintsIntoLexicon: skips short phrases', () => {
  const result = mergeLearningStoreHintsIntoLexicon(
    { fields: {} },
    { anchorsByField: { dpi: [{ phrase: 'ab', decayStatus: 'active' }] } }
  );
  assert.deepStrictEqual(result.fields.dpi?.synonyms || {}, {});
});

// ---------------------------------------------------------------------------
// 3. loadLearningArtifacts
// ---------------------------------------------------------------------------

test('loadLearningArtifacts: returns defaults when storage returns null', async () => {
  const storage = {
    resolveOutputKey: (...parts) => parts.join('/'),
    readJsonOrNull: async () => null,
  };
  const result = await loadLearningArtifacts({ storage, category: 'mouse' });
  assert.deepStrictEqual(result, { lexicon: {}, queryTemplates: {}, fieldYield: {} });
});

test('loadLearningArtifacts: returns parsed data', async () => {
  const data = {
    '_learning/mouse/field_lexicon.json': { fields: { sensor: {} } },
    '_learning/mouse/query_templates.json': { templates: ['t1'] },
    '_learning/mouse/field_yield.json': { yield: 0.8 },
  };
  const storage = {
    resolveOutputKey: (...parts) => parts.join('/'),
    readJsonOrNull: async (key) => data[key] || null,
  };
  const result = await loadLearningArtifacts({ storage, category: 'mouse' });
  assert.deepStrictEqual(result.lexicon, { fields: { sensor: {} } });
  assert.deepStrictEqual(result.queryTemplates, { templates: ['t1'] });
  assert.deepStrictEqual(result.fieldYield, { yield: 0.8 });
});

// ---------------------------------------------------------------------------
// 4. buildSearchProfileKeys
// ---------------------------------------------------------------------------

test('buildSearchProfileKeys: builds all three keys', () => {
  const storage = {
    resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
  };
  const result = buildSearchProfileKeys({
    storage,
    config: { s3InputPrefix: 'prefix' },
    category: 'mouse',
    productId: 'mouse-razer-viper',
    runId: 'run-001',
  });
  assert.ok(result.inputKey.includes('_discovery'));
  assert.ok(result.inputKey.includes('run-001'));
  assert.ok(result.runKey);
  assert.ok(result.latestKey);
});

test('buildSearchProfileKeys: null runKey/latestKey when missing params', () => {
  const storage = {
    resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
  };
  const result = buildSearchProfileKeys({
    storage,
    config: { s3InputPrefix: 'prefix' },
    category: '',
    productId: '',
    runId: 'run-001',
  });
  assert.equal(result.runKey, null);
  assert.equal(result.latestKey, null);
  assert.ok(result.inputKey);
});

// ---------------------------------------------------------------------------
// 5. writeSearchProfileArtifacts
// ---------------------------------------------------------------------------

test('writeSearchProfileArtifacts: writes to all unique keys', async () => {
  const written = new Map();
  const storage = {
    writeObject: async (key, body) => { written.set(key, JSON.parse(body.toString('utf8'))); },
  };
  await writeSearchProfileArtifacts({
    storage,
    payload: { status: 'test' },
    keys: { inputKey: 'a', runKey: 'b', latestKey: 'c' },
  });
  assert.equal(written.size, 3);
  assert.deepStrictEqual(written.get('a'), { status: 'test' });
});

test('writeSearchProfileArtifacts: deduplicates keys', async () => {
  const written = new Map();
  const storage = {
    writeObject: async (key, body) => { written.set(key, JSON.parse(body.toString('utf8'))); },
  };
  await writeSearchProfileArtifacts({
    storage,
    payload: { status: 'test' },
    keys: { inputKey: 'same', runKey: 'same', latestKey: null },
  });
  assert.equal(written.size, 1);
});

// ---------------------------------------------------------------------------
// 6. buildQueryAttemptStats
// ---------------------------------------------------------------------------

test('buildQueryAttemptStats: empty rows returns empty', () => {
  assert.deepStrictEqual(buildQueryAttemptStats([]), []);
  assert.deepStrictEqual(buildQueryAttemptStats(null), []);
});

test('buildQueryAttemptStats: aggregates multiple attempts per query', () => {
  const rows = [
    { query: 'razer viper', result_count: 5, provider: 'google' },
    { query: 'razer viper', result_count: 3, provider: 'bing' },
    { query: 'logitech mouse', result_count: 10, provider: 'google' },
  ];
  const stats = buildQueryAttemptStats(rows);
  assert.equal(stats.length, 2);
  const razer = stats.find((s) => s.query === 'razer viper');
  assert.equal(razer.attempts, 2);
  assert.equal(razer.result_count, 8);
  assert.deepStrictEqual(razer.providers, ['google', 'bing']);
});

test('buildQueryAttemptStats: tracks frontier_cache flag', () => {
  const rows = [
    { query: 'cached query', result_count: 2, provider: 'cache', reason_code: 'frontier_query_cache' },
  ];
  const stats = buildQueryAttemptStats(rows);
  assert.equal(stats[0].frontier_cache, true);
});

test('buildQueryAttemptStats: sorts by result_count desc', () => {
  const rows = [
    { query: 'low', result_count: 1, provider: 'google' },
    { query: 'high', result_count: 10, provider: 'google' },
  ];
  const stats = buildQueryAttemptStats(rows);
  assert.equal(stats[0].query, 'high');
  assert.equal(stats[1].query, 'low');
});

// ---------------------------------------------------------------------------
// 7. normalizeTriageScore
// ---------------------------------------------------------------------------

test('normalizeTriageScore: returns rerank_score when present', () => {
  assert.equal(normalizeTriageScore({ rerank_score: 0.85 }), 0.85);
});

test('normalizeTriageScore: falls back to score then score_det', () => {
  assert.equal(normalizeTriageScore({ score: 0.7 }), 0.7);
  assert.equal(normalizeTriageScore({ score_det: 0.5 }), 0.5);
});

test('normalizeTriageScore: returns 0 when none present', () => {
  assert.equal(normalizeTriageScore({}), 0);
  assert.equal(normalizeTriageScore(undefined), 0);
});

// ---------------------------------------------------------------------------
// 8. normalizeSourceEntryDiscovery
// ---------------------------------------------------------------------------

test('normalizeSourceEntryDiscovery: fills defaults for object input', () => {
  const result = normalizeSourceEntryDiscovery({ method: 'search' });
  assert.equal(result.method, 'search');
  assert.equal(result.priority, 50);
  assert.equal(result.enabled, true);
});

test('normalizeSourceEntryDiscovery: returns all defaults for non-object', () => {
  const result = normalizeSourceEntryDiscovery(null);
  assert.equal(result.method, 'manual');
  assert.equal(result.priority, 50);
  assert.equal(result.enabled, true);
  assert.equal(result.source_type, '');
});

// ---------------------------------------------------------------------------
// 9. resolveEnabledSourceEntries
// ---------------------------------------------------------------------------

test('resolveEnabledSourceEntries: returns empty for null/undefined', () => {
  assert.deepStrictEqual(resolveEnabledSourceEntries(), []);
  assert.deepStrictEqual(resolveEnabledSourceEntries({}), []);
  assert.deepStrictEqual(resolveEnabledSourceEntries({ sourceEntries: null }), []);
});

test('resolveEnabledSourceEntries: filters disabled entries', () => {
  const entries = [
    { url: 'https://a.com', discovery: { enabled: true, method: 'manual' } },
    { url: 'https://b.com', discovery: { enabled: false, method: 'manual' } },
    { url: 'https://c.com', discovery: null },
  ];
  const result = resolveEnabledSourceEntries({ sourceEntries: entries });
  assert.equal(result.length, 2);
  assert.equal(result[0].url, 'https://a.com');
  assert.equal(result[1].url, 'https://c.com');
});

test('resolveEnabledSourceEntries: normalizes missing discovery', () => {
  const result = resolveEnabledSourceEntries({ sourceEntries: [{ url: 'https://x.com' }] });
  assert.equal(result[0].discovery.method, 'manual');
  assert.equal(result[0].discovery.priority, 50);
});

test('resolveEnabledSourceEntries: skips non-object entries', () => {
  const entries = [null, undefined, 42, 'string', { url: 'https://valid.com' }];
  const result = resolveEnabledSourceEntries({ sourceEntries: entries });
  assert.equal(result.length, 1);
  assert.equal(result[0].url, 'https://valid.com');
});

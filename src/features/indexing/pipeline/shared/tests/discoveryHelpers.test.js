/**
 * Unit tests for discoveryHelpers.js
 *
 * Phase 4A: Tests for the 10 helper functions extracted from searchDiscovery.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runWithConcurrency,
  loadLearningArtifacts,
  buildQueryAttemptStats,
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
// 4. buildQueryAttemptStats
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

test('buildQueryAttemptStats: tracks cooldown_skipped flag', () => {
  const rows = [
    { query: 'cached query', result_count: 2, provider: 'cache', reason_code: 'cooldown_skip' },
  ];
  const stats = buildQueryAttemptStats(rows);
  assert.equal(stats[0].cooldown_skipped, true);
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


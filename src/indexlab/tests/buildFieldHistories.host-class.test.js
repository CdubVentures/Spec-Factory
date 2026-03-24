import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHostClass } from './helpers/buildFieldHistoriesHarness.js';

test('classifyHostClass', async (t) => {
  await t.test('tier 1 manufacturer resolves to official', () => {
    assert.equal(classifyHostClass({ tier: 1, tierName: 'manufacturer', host: 'logitechg.com' }), 'official');
  });

  await t.test('tier 1 support host resolves to support', () => {
    assert.equal(classifyHostClass({ tier: 1, tierName: 'manufacturer', host: 'support.logi.com' }), 'support');
  });

  await t.test('tier 1 support path resolves to support', () => {
    assert.equal(classifyHostClass({ tier: 1, tierName: 'manufacturer', host: 'logi.com', url: 'https://logi.com/support/specs' }), 'support');
  });

  await t.test('review tier name resolves to review', () => {
    assert.equal(classifyHostClass({ tier: 2, tierName: 'review', host: 'rtings.com' }), 'review');
  });

  await t.test('retailer tier name resolves to retailer', () => {
    assert.equal(classifyHostClass({ tier: 2, tierName: 'retailer', host: 'amazon.com' }), 'retailer');
  });

  await t.test('benchmark hosts resolve to benchmark', () => {
    assert.equal(classifyHostClass({ tier: 2, tierName: 'professional', host: 'userbenchmark.com' }), 'benchmark');
  });

  await t.test('database hosts resolve to database', () => {
    assert.equal(classifyHostClass({ tier: 2, tierName: 'professional', host: 'techpowerup.com' }), 'database');
  });

  await t.test('tier 3 resolves to community', () => {
    assert.equal(classifyHostClass({ tier: 3, tierName: 'community', host: 'reddit.com' }), 'community');
  });

  await t.test('unknown tier falls back', () => {
    assert.equal(classifyHostClass({ tier: 99, tierName: '', host: 'unknown.xyz' }), 'fallback');
  });

  await t.test('nullish input falls back', () => {
    assert.equal(classifyHostClass(null), 'fallback');
    assert.equal(classifyHostClass(undefined), 'fallback');
    assert.equal(classifyHostClass({}), 'fallback');
  });
});

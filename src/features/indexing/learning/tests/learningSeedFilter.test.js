import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { collectLearningSeeds } from '../selfImproveLoop.js';

// WHY: Characterization tests locking down the token-matching filter logic
// extracted from SourcePlanner.seedLearning during planner removal.

// Wrapper that matches the test's call signature to the real function
function filterLearningSeeds(urls, { brandTokens = [], modelTokens = [] } = {}) {
  // collectLearningSeeds expects a learningProfile shape
  const profile = { profile: { preferred_urls: urls || [] } };
  return collectLearningSeeds(profile, { brandTokens, modelTokens });
}

describe('filterLearningSeeds (characterization)', () => {
  test('accepts URL matching both brand and model tokens', () => {
    const urls = ['https://example.com/logitech/g502'];
    const result = filterLearningSeeds(urls, {
      brandTokens: ['logitech'],
      modelTokens: ['g502'],
    });
    assert.deepEqual(result, urls);
  });

  test('rejects URL missing model token when model tokens provided', () => {
    const urls = ['https://example.com/logitech/other-mouse'];
    const result = filterLearningSeeds(urls, {
      brandTokens: ['logitech'],
      modelTokens: ['g502'],
    });
    assert.deepEqual(result, []);
  });

  test('rejects URL missing brand token when both brand and model provided', () => {
    const urls = ['https://example.com/razer/g502'];
    const result = filterLearningSeeds(urls, {
      brandTokens: ['logitech'],
      modelTokens: ['g502'],
    });
    assert.deepEqual(result, []);
  });

  test('accepts URL with brand only when no model tokens provided', () => {
    const urls = ['https://logitech.com/products'];
    const result = filterLearningSeeds(urls, {
      brandTokens: ['logitech'],
      modelTokens: [],
    });
    assert.deepEqual(result, urls);
  });

  test('rejects URL with no brand match when only brand tokens provided', () => {
    const urls = ['https://random.com/products'];
    const result = filterLearningSeeds(urls, {
      brandTokens: ['logitech'],
      modelTokens: [],
    });
    assert.deepEqual(result, []);
  });

  test('model threshold is 2 when 3+ model tokens', () => {
    // With 3 model tokens, need at least 2 hits
    const urls = ['https://example.com/logitech/g502-hero-gaming'];
    const result = filterLearningSeeds(urls, {
      brandTokens: ['logitech'],
      modelTokens: ['g502', 'hero', 'wireless'],
    });
    // 'g502' and 'hero' both hit → 2 hits >= threshold 2 → pass
    assert.deepEqual(result, urls);
  });

  test('model threshold of 2 rejects single hit when 3+ tokens', () => {
    const urls = ['https://example.com/logitech/g502-review'];
    const result = filterLearningSeeds(urls, {
      brandTokens: ['logitech'],
      modelTokens: ['g502', 'hero', 'wireless'],
    });
    // Only 'g502' hits → 1 hit < threshold 2 → reject
    assert.deepEqual(result, []);
  });

  test('model threshold is 1 when fewer than 3 model tokens', () => {
    const urls = ['https://example.com/logitech/g502-review'];
    const result = filterLearningSeeds(urls, {
      brandTokens: ['logitech'],
      modelTokens: ['g502', 'hero'],
    });
    // 'g502' hits → 1 hit >= threshold 1 → pass
    assert.deepEqual(result, urls);
  });

  test('skips malformed URLs without crashing', () => {
    const urls = ['not-a-url', 'https://valid.com/logitech/g502'];
    const result = filterLearningSeeds(urls, {
      brandTokens: ['logitech'],
      modelTokens: ['g502'],
    });
    assert.deepEqual(result, ['https://valid.com/logitech/g502']);
  });

  test('empty URLs returns empty array', () => {
    assert.deepEqual(filterLearningSeeds([], { brandTokens: ['a'], modelTokens: ['b'] }), []);
    assert.deepEqual(filterLearningSeeds(null, { brandTokens: ['a'] }), []);
  });

  test('no brand or model tokens rejects everything', () => {
    const urls = ['https://example.com/anything'];
    assert.deepEqual(filterLearningSeeds(urls, { brandTokens: [], modelTokens: [] }), []);
  });

  test('matches against hostname, pathname, and search params', () => {
    const urls = ['https://review.com/page?brand=logitech&model=g502'];
    const result = filterLearningSeeds(urls, {
      brandTokens: ['logitech'],
      modelTokens: ['g502'],
    });
    assert.deepEqual(result, urls);
  });

  test('matching is case-insensitive', () => {
    const urls = ['https://example.com/LOGITECH/G502'];
    const result = filterLearningSeeds(urls, {
      brandTokens: ['logitech'],
      modelTokens: ['g502'],
    });
    assert.deepEqual(result, urls);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveIntelBundle,
  scoreRequiredFieldBoost,
  readRewardScoreFromMethodMap,
  scoreFieldRewardBoost,
  computePathHeuristicBoost,
  computeSourcePriority,
  computeDomainPriority
} from '../src/planner/sourcePlannerScoring.js';

function baseScoringCtx(overrides = {}) {
  return {
    sourceIntelDomains: {},
    brandKey: 'logitech',
    requiredFields: [],
    filledFields: new Set(),
    ...overrides
  };
}

// --- resolveIntelBundle ---

test('resolveIntelBundle returns nulls when domain not in intel', () => {
  const ctx = baseScoringCtx();
  const result = resolveIntelBundle('unknown.com', ctx);
  assert.deepEqual(result, { domainIntel: null, activeIntel: null });
});

test('resolveIntelBundle returns brand-specific intel when available', () => {
  const domainData = {
    planner_score: 0.5,
    per_brand: {
      logitech: { planner_score: 0.8, identity_match_rate: 0.9 }
    }
  };
  const ctx = baseScoringCtx({
    sourceIntelDomains: { 'example.com': domainData }
  });
  const result = resolveIntelBundle('example.com', ctx);
  assert.equal(result.domainIntel, domainData);
  assert.equal(result.activeIntel.planner_score, 0.8);
});

test('resolveIntelBundle falls back to domain intel when brand not present', () => {
  const domainData = { planner_score: 0.5, per_brand: {} };
  const ctx = baseScoringCtx({
    sourceIntelDomains: { 'example.com': domainData }
  });
  const result = resolveIntelBundle('example.com', ctx);
  assert.equal(result.activeIntel, domainData);
});

// --- scoreRequiredFieldBoost ---

test('scoreRequiredFieldBoost returns 0 for no missing fields', () => {
  assert.equal(scoreRequiredFieldBoost({}, {}, []), 0);
});

test('scoreRequiredFieldBoost computes boost from helpfulness counts', () => {
  const intel = {
    per_field_helpfulness: { sensor: 100, polling_rate: 200 }
  };
  const boost = scoreRequiredFieldBoost(intel, null, ['sensor', 'polling_rate']);
  assert.ok(boost > 0, 'should produce positive boost');
  assert.ok(boost <= 0.2, 'should be capped at 0.2');
});

// --- readRewardScoreFromMethodMap ---

test('readRewardScoreFromMethodMap returns best score for matching field prefix', () => {
  const map = {
    'sensor::html_table': { reward_score: 0.8 },
    'sensor::llm_extract': { reward_score: 0.5 },
    'weight::html_table': { reward_score: 0.9 }
  };
  assert.equal(readRewardScoreFromMethodMap(map, 'sensor'), 0.8);
  assert.equal(readRewardScoreFromMethodMap(map, 'weight'), 0.9);
  assert.equal(readRewardScoreFromMethodMap(map, 'missing'), null);
});

test('readRewardScoreFromMethodMap handles empty map', () => {
  assert.equal(readRewardScoreFromMethodMap({}, 'field'), null);
  assert.equal(readRewardScoreFromMethodMap(null, 'field'), null);
});

// --- scoreFieldRewardBoost ---

test('scoreFieldRewardBoost returns 0 when no missing fields', () => {
  assert.equal(scoreFieldRewardBoost({}, {}, {}, []), 0);
});

test('scoreFieldRewardBoost returns 0 when no domain intel', () => {
  assert.equal(scoreFieldRewardBoost({}, null, null, ['sensor']), 0);
});

test('scoreFieldRewardBoost computes weighted boost from path and domain intel', () => {
  const domainIntel = {
    per_field_reward: { sensor: { score: 0.6 } },
    per_path: {
      '/mice/g-pro-x-superlight-2': {
        per_field_reward: { sensor: { score: 0.9 } }
      }
    }
  };
  const row = { url: 'https://example.com/mice/g-pro-x-superlight-2' };
  const boost = scoreFieldRewardBoost(row, domainIntel, domainIntel, ['sensor']);
  assert.ok(typeof boost === 'number');
  assert.ok(boost >= -0.2 && boost <= 0.2, 'should be within bounds');
});

// --- computePathHeuristicBoost ---

test('computePathHeuristicBoost de-prioritizes search and root paths', () => {
  const ctx = baseScoringCtx();
  const rootBoost = computePathHeuristicBoost({ url: 'https://example.com/', role: 'other' }, ctx);
  assert.ok(rootBoost < 0, 'root path should be negative');

  const searchBoost = computePathHeuristicBoost(
    { url: 'https://example.com/search/?q=mouse', role: 'other' }, ctx
  );
  assert.ok(searchBoost < 0, 'search path should be negative');
});

test('computePathHeuristicBoost de-prioritizes robots and sitemaps', () => {
  const ctx = baseScoringCtx();
  const robotsBoost = computePathHeuristicBoost(
    { url: 'https://example.com/robots.txt', role: 'manufacturer' }, ctx
  );
  assert.ok(robotsBoost < 0, 'robots.txt should be negative');
});

test('computePathHeuristicBoost boosts manufacturer category product paths', () => {
  const ctx = baseScoringCtx();
  const boost = computePathHeuristicBoost(
    { url: 'https://logitech.com/mice/g-pro-x-superlight-2', role: 'manufacturer' }, ctx
  );
  assert.ok(boost > 0, 'manufacturer category product path should be positive');
});

test('computePathHeuristicBoost boosts manufacturer paths with brand in URL', () => {
  const ctx = baseScoringCtx({ brandKey: 'razer' });
  const withBrand = computePathHeuristicBoost(
    { url: 'https://razer.com/mice/razer-viper-v3-pro', role: 'manufacturer' }, ctx
  );
  const withoutBrand = computePathHeuristicBoost(
    { url: 'https://razer.com/mice/viper-v3-pro', role: 'manufacturer' }, ctx
  );
  assert.ok(withBrand > withoutBrand, 'brand in path should get higher boost');
});

test('computePathHeuristicBoost boosts review/database product paths', () => {
  const ctx = baseScoringCtx();
  const boost = computePathHeuristicBoost(
    { url: 'https://rtings.com/review/logitech-g-pro', role: 'review' }, ctx
  );
  assert.ok(boost > 0, 'review product path should be positive');
});

test('computePathHeuristicBoost returns 0 for empty/invalid URL', () => {
  const ctx = baseScoringCtx();
  assert.equal(computePathHeuristicBoost({ url: '' }, ctx), 0);
  assert.equal(computePathHeuristicBoost({ url: 'not-a-url' }, ctx), 0);
  assert.equal(computePathHeuristicBoost({}, ctx), 0);
});

// --- computeSourcePriority ---

test('computeSourcePriority returns path heuristic when no rootDomain', () => {
  const ctx = baseScoringCtx();
  const score = computeSourcePriority({ url: 'https://example.com/' }, ctx);
  assert.ok(score < 0, 'root URL without rootDomain should be negative');
});

test('computeSourcePriority includes intel score when available', () => {
  const ctx = baseScoringCtx({
    sourceIntelDomains: {
      'example.com': { planner_score: 0.7 }
    }
  });
  const score = computeSourcePriority(
    { rootDomain: 'example.com', url: 'https://example.com/product/mouse', role: 'review' },
    ctx
  );
  assert.ok(score > 0.5, 'should include planner_score');
});

// --- computeDomainPriority ---

test('computeDomainPriority delegates to computeSourcePriority', () => {
  const ctx = baseScoringCtx({
    sourceIntelDomains: {
      'example.com': { planner_score: 0.5 }
    }
  });
  const score = computeDomainPriority('example.com', ctx);
  assert.ok(typeof score === 'number');
});

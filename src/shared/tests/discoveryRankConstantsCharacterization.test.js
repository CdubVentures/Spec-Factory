import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  availabilityRank,
  difficultyRank,
  requiredLevelRank,
  mapRequiredLevelToBucket,
} from '../discoveryRankConstants.js';
import {
  computeGroupProductivityScore,
} from '../../features/indexing/pipeline/needSet/searchPlanningContext.js';

describe('discovery rank contracts', () => {
  it('orders availability from most to least discoverable and falls back to the lowest priority rank', () => {
    assert.ok(availabilityRank('always') < availabilityRank('sometimes'));
    assert.ok(availabilityRank('sometimes') < availabilityRank('rare'));
    assert.equal(availabilityRank('bogus'), availabilityRank('rare'));
    assert.equal(availabilityRank(undefined), availabilityRank('rare'));
  });

  it('orders difficulty from easy to very_hard and falls back to the hardest rank', () => {
    assert.ok(difficultyRank('easy') < difficultyRank('medium'));
    assert.ok(difficultyRank('medium') < difficultyRank('hard'));
    assert.ok(difficultyRank('hard') < difficultyRank('very_hard'));
    assert.equal(difficultyRank('bogus'), difficultyRank('very_hard'));
    assert.equal(difficultyRank(null), difficultyRank('very_hard'));
  });

  it('orders required levels from mandatory to non_mandatory and falls back to non_mandatory', () => {
    assert.ok(requiredLevelRank('mandatory') < requiredLevelRank('non_mandatory'));
    assert.equal(requiredLevelRank('bogus'), requiredLevelRank('non_mandatory'));
    assert.equal(requiredLevelRank(undefined), requiredLevelRank('non_mandatory'));
  });
});

describe('group productivity contract', () => {
  it('returns 0 for empty input', () => {
    assert.equal(computeGroupProductivityScore([], 0), 0);
    assert.equal(computeGroupProductivityScore(null, 0), 0);
  });

  it('prefers easier, more available, higher-need groups over harder low-need groups', () => {
    const productive = computeGroupProductivityScore([
      { availability: 'always', difficulty: 'easy', need_score: 80 },
      { availability: 'always', difficulty: 'easy', need_score: 60 },
    ], 0);
    const unproductive = computeGroupProductivityScore([
      { availability: 'rare', difficulty: 'hard', need_score: 10 },
    ], 0);

    assert.ok(productive > unproductive);
  });

  it('applies retry penalty and caps it after five attempts', () => {
    const fields = [
      { availability: 'always', difficulty: 'easy', need_score: 80 },
    ];

    const fresh = computeGroupProductivityScore(fields, 0);
    const retried = computeGroupProductivityScore(fields, 3);
    const capped = computeGroupProductivityScore(fields, 10);
    const fiveRetries = computeGroupProductivityScore(fields, 5);

    assert.ok(retried < fresh);
    assert.equal(capped, fiveRetries);
  });
});

describe('required-level bucket contract', () => {
  it('maps mandatory fields to the core bucket', () => {
    assert.equal(mapRequiredLevelToBucket('mandatory'), 'core');
  });

  it('maps non_mandatory and unknown fields to the optional bucket', () => {
    assert.equal(mapRequiredLevelToBucket('non_mandatory'), 'optional');
    assert.equal(mapRequiredLevelToBucket(''), 'optional');
    assert.equal(mapRequiredLevelToBucket(undefined), 'optional');
  });
});

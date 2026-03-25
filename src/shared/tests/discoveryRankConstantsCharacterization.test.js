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
    assert.ok(availabilityRank('always') < availabilityRank('expected'));
    assert.ok(availabilityRank('expected') < availabilityRank('sometimes'));
    assert.ok(availabilityRank('sometimes') < availabilityRank('rare'));
    assert.ok(availabilityRank('rare') < availabilityRank('editorial_only'));
    assert.equal(availabilityRank('bogus'), availabilityRank('editorial_only'));
    assert.equal(availabilityRank(undefined), availabilityRank('editorial_only'));
  });

  it('orders difficulty from easy to hard and falls back to the hardest rank', () => {
    assert.ok(difficultyRank('easy') < difficultyRank('medium'));
    assert.ok(difficultyRank('medium') < difficultyRank('hard'));
    assert.equal(difficultyRank('bogus'), difficultyRank('hard'));
    assert.equal(difficultyRank(null), difficultyRank('hard'));
  });

  it('orders required levels from identity to optional and falls back to optional', () => {
    assert.ok(requiredLevelRank('identity') < requiredLevelRank('critical'));
    assert.ok(requiredLevelRank('critical') < requiredLevelRank('required'));
    assert.ok(requiredLevelRank('required') < requiredLevelRank('expected'));
    assert.ok(requiredLevelRank('expected') < requiredLevelRank('optional'));
    assert.equal(requiredLevelRank('bogus'), requiredLevelRank('optional'));
    assert.equal(requiredLevelRank(undefined), requiredLevelRank('optional'));
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
  it('maps identity, critical, and required fields to the core bucket', () => {
    assert.equal(mapRequiredLevelToBucket('identity'), 'core');
    assert.equal(mapRequiredLevelToBucket('critical'), 'core');
    assert.equal(mapRequiredLevelToBucket('required'), 'core');
  });

  it('maps expected fields to secondary and unknown/optional fields to optional', () => {
    assert.equal(mapRequiredLevelToBucket('expected'), 'secondary');
    assert.equal(mapRequiredLevelToBucket('optional'), 'optional');
    assert.equal(mapRequiredLevelToBucket(''), 'optional');
    assert.equal(mapRequiredLevelToBucket(undefined), 'optional');
  });
});

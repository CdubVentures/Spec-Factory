import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  availabilityRank,
  difficultyRank,
  requiredLevelRank,
} from '../../features/indexing/pipeline/needSet/needsetEngine.js';

import {
  mapRequiredLevelToBucket,
} from '../discoveryRankConstants.js';

import {
  computeGroupProductivityScore,
} from '../../features/indexing/pipeline/needSet/searchPlanningContext.js';

// WHY: Lock down current rank-constant behavior BEFORE extraction.
// Both needsetEngine.js and searchPlanningContext.js use identical rank maps
// under different names. This test proves the values match and survive extraction.

describe('discoveryRankConstants characterization', () => {
  describe('availabilityRank (from needsetEngine)', () => {
    it('maps known keys to expected ranks', () => {
      assert.equal(availabilityRank('always'), 0);
      assert.equal(availabilityRank('expected'), 1);
      assert.equal(availabilityRank('sometimes'), 2);
      assert.equal(availabilityRank('rare'), 3);
      assert.equal(availabilityRank('editorial_only'), 4);
    });
    it('returns fallback 4 for unknown keys', () => {
      assert.equal(availabilityRank('bogus'), 4);
      assert.equal(availabilityRank(undefined), 4);
      assert.equal(availabilityRank(null), 4);
      assert.equal(availabilityRank(''), 4);
    });
  });

  describe('difficultyRank (from needsetEngine)', () => {
    it('maps known keys to expected ranks', () => {
      assert.equal(difficultyRank('easy'), 0);
      assert.equal(difficultyRank('medium'), 1);
      assert.equal(difficultyRank('hard'), 2);
    });
    it('returns fallback 2 for unknown keys', () => {
      assert.equal(difficultyRank('bogus'), 2);
      assert.equal(difficultyRank(undefined), 2);
      assert.equal(difficultyRank(null), 2);
    });
  });

  describe('requiredLevelRank (from needsetEngine)', () => {
    it('maps known keys to expected ranks', () => {
      assert.equal(requiredLevelRank('identity'), 0);
      assert.equal(requiredLevelRank('critical'), 1);
      assert.equal(requiredLevelRank('required'), 2);
      assert.equal(requiredLevelRank('expected'), 3);
      assert.equal(requiredLevelRank('optional'), 4);
    });
    it('returns fallback 4 for unknown keys', () => {
      assert.equal(requiredLevelRank('bogus'), 4);
      assert.equal(requiredLevelRank(undefined), 4);
    });
  });

  describe('computeGroupProductivityScore (uses V4_ rank maps in searchPlanningContext)', () => {
    it('returns 0 for empty input', () => {
      assert.equal(computeGroupProductivityScore([], 0), 0);
      assert.equal(computeGroupProductivityScore(null, 0), 0);
    });

    it('scores high for easy, always-available fields with zero retries', () => {
      const fields = [
        { availability: 'always', difficulty: 'easy', need_score: 80 },
        { availability: 'always', difficulty: 'easy', need_score: 60 },
      ];
      const score = computeGroupProductivityScore(fields, 0);
      // avgAvail = (4-0 + 4-0)/2 = 4, avgDiff = (2-0 + 2-0)/2 = 2
      // avgNeed = 70, volumeBonus = 2*2 = 4, repeatPenalty = 0
      // score = 4*30 + 2*20 + 70*0.5 + 4 - 0 = 120 + 40 + 35 + 4 = 199
      assert.equal(score, 199);
    });

    it('scores low for rare, hard fields with retries', () => {
      const fields = [
        { availability: 'rare', difficulty: 'hard', need_score: 10 },
      ];
      const score = computeGroupProductivityScore(fields, 3);
      // avgAvail = (4-3)/1 = 1, avgDiff = (2-2)/1 = 0
      // avgNeed = 10, volumeBonus = 1*2 = 2, repeatPenalty = 3*10 = 30
      // score = 1*30 + 0*20 + 10*0.5 + 2 - 30 = 30 + 0 + 5 + 2 - 30 = 7
      assert.equal(score, 7);
    });

    it('applies repeat penalty capped at 5', () => {
      const fields = [
        { availability: 'always', difficulty: 'easy', need_score: 80 },
      ];
      const score10 = computeGroupProductivityScore(fields, 10);
      const score5 = computeGroupProductivityScore(fields, 5);
      // Repeat penalty caps at 5 * 10 = 50
      assert.equal(score10, score5);
    });
  });

  describe('mapRequiredLevelToBucket', () => {
    it('identity/critical/required → core', () => {
      assert.equal(mapRequiredLevelToBucket('identity'), 'core');
      assert.equal(mapRequiredLevelToBucket('critical'), 'core');
      assert.equal(mapRequiredLevelToBucket('required'), 'core');
    });

    it('expected → secondary', () => {
      assert.equal(mapRequiredLevelToBucket('expected'), 'secondary');
    });

    it('optional and unknown → optional', () => {
      assert.equal(mapRequiredLevelToBucket('optional'), 'optional');
      assert.equal(mapRequiredLevelToBucket(''), 'optional');
      assert.equal(mapRequiredLevelToBucket(undefined), 'optional');
      assert.equal(mapRequiredLevelToBucket(null), 'optional');
    });
  });
});

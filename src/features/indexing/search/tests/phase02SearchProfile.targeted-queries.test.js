import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTargetedQueries,
  makeCategoryConfig,
  makeJob,
} from './helpers/phase02SearchProfileHarness.js';

describe('Phase 02 - buildTargetedQueries Integration', () => {
  it('returns string array bounded by maxQueries', () => {
    const queries = buildTargetedQueries({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 8
    });

    assert.ok(Array.isArray(queries));
    assert.ok(queries.length <= 8);
    assert.ok(queries.every((query) => typeof query === 'string'));
  });
});

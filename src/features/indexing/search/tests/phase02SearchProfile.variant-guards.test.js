import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchProfile,
  makeCategoryConfig,
  makeJob,
} from './helpers/phase02SearchProfileHarness.js';

describe('Phase 02 - Variant Guard Terms', () => {
  it('includes identity tokens and digit groups in variant_guard_terms', () => {
    const profile = buildSearchProfile({
      job: makeJob({ identityLock: { brand: 'Razer', model: 'Viper V3 Pro', variant: '' } }),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 12
    });

    assert.ok(Array.isArray(profile.variant_guard_terms));
    assert.ok(profile.variant_guard_terms.length > 0, 'guard terms produced');
    const hasDigit = profile.variant_guard_terms.some((term) => /\d/.test(term));
    assert.ok(hasDigit, 'includes digit group from model');
  });
});

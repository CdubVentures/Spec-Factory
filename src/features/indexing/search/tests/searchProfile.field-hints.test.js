import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchProfile,
  makeCategoryConfig,
  makeFocusGroup,
  makeJob,
  makeSeedStatus,
} from './helpers/searchProfileHarness.js';

function makeWeightFocusGroup() {
  return {
    ...makeFocusGroup({
      key: 'weight_group',
      label: 'Weight',
      group_search_worthy: false,
      group_description_long: 'weight grams',
      normalized_key_queue: ['weight'],
      unresolved_field_keys: ['weight'],
      field_keys: ['weight'],
      total_field_count: 1,
    }),
    group_description_short: 'weight',
    phase: 'now',
    skip_reason: null,
    desc: 'weight',
  };
}

describe('Phase 02 - Field Studio Hint Wiring', () => {
  it('search_hints.query_terms are consumed before fallback synonym expansion', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 24,
      seedStatus: makeSeedStatus({ specs_seed: { is_needed: true } }),
      focusGroups: [makeWeightFocusGroup()],
    });

    const weightQueries = profile.query_rows.filter((row) => row.target_fields?.includes('weight'));
    const fromTier3 = weightQueries.filter((row) => row.hint_source === 'tier3_key');

    assert.ok(fromTier3.length > 0, 'tier3 key search produces weight-targeted queries');
  });

  it('search_hints.domain_hints emit soft host-biased queries', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'click_latency'],
      maxQueries: 48,
      seedStatus: makeSeedStatus({
        specs_seed: { is_needed: true },
        source_seeds: {
          'razer.com': { is_needed: true },
          'rtings.com': { is_needed: true },
        },
      }),
      focusGroups: [],
    });

    const razerHostQueries = profile.queries.filter((query) => query.includes('razer.com') && !query.includes('site:'));
    const rtingsHostQueries = profile.queries.filter((query) => query.includes('rtings.com') && !query.includes('site:'));

    assert.ok(razerHostQueries.length > 0, 'razer.com source seed produces soft host-biased queries');
    assert.ok(rtingsHostQueries.length > 0, 'rtings.com source seed produces soft host-biased queries');
  });

  it('preferred_content_types bias doc_hint in query rows', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'click_latency'],
      maxQueries: 48,
      seedStatus: makeSeedStatus({ specs_seed: { is_needed: true } }),
      focusGroups: [],
    });

    const seedRows = profile.query_rows.filter((row) => row.tier === 'seed');
    const seedDocHints = [...new Set(seedRows.map((row) => row.doc_hint).filter(Boolean))];

    assert.ok(seedDocHints.some((hint) => hint.includes('spec')), 'tier1 seed row has doc_hint=spec');
  });
});

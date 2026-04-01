import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchProfile,
  makeCategoryConfig,
  makeFocusGroup,
  makeJob,
  makeSeedStatus,
} from './helpers/searchProfileHarness.js';

function makeWeightFocusGroup(overrides = {}) {
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
      ...overrides,
    }),
    group_description_short: overrides.group_description_short || 'weight',
    phase: overrides.phase || 'now',
    skip_reason: overrides.skip_reason ?? null,
    desc: overrides.desc || 'weight',
  };
}

describe('Phase 02 - SearchProfile Shape', () => {
  it('produces all spec-required top-level keys', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24
    });

    assert.ok(profile.category === 'mouse');
    assert.ok(profile.identity, 'identity present');
    assert.ok(Array.isArray(profile.variant_guard_terms), 'variant_guard_terms present');
    assert.ok(Array.isArray(profile.identity_aliases), 'identity_aliases present');
    assert.ok(Array.isArray(profile.alias_reject_log), 'alias_reject_log present');
    assert.ok(Array.isArray(profile.query_reject_log), 'query_reject_log present');
    assert.ok(Array.isArray(profile.focus_fields), 'focus_fields present');
    assert.ok(Array.isArray(profile.base_templates), 'base_templates present');
    assert.ok(Array.isArray(profile.query_rows), 'query_rows present');
    assert.ok(Array.isArray(profile.queries), 'queries present');
    assert.ok(Array.isArray(profile.targeted_queries), 'targeted_queries present');
    assert.ok(typeof profile.field_target_queries === 'object', 'field_target_queries present');
    assert.ok(Array.isArray(profile.doc_hint_queries), 'doc_hint_queries present');
    assert.ok(typeof profile.hint_source_counts === 'object', 'hint_source_counts present');
  });

  it('query_rows contain provenance metadata', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'click_latency'],
      maxQueries: 24,
      seedStatus: makeSeedStatus({
        specs_seed: { is_needed: true },
        source_seeds: { 'razer.com': { is_needed: true } },
      }),
      focusGroups: [makeWeightFocusGroup()],
    });

    const withHintSource = profile.query_rows.filter((row) => row.hint_source);
    const withTargetFields = profile.query_rows.filter((row) => row.target_fields?.length > 0);
    const withDocHint = profile.query_rows.filter((row) => row.doc_hint);

    assert.ok(withHintSource.length > 0, 'some query_rows have hint_source');
    assert.ok(withTargetFields.length > 0, 'some query_rows have target_fields');
    assert.ok(withDocHint.length > 0, 'some query_rows have doc_hint');
  });

  it('field_target_queries maps fields to their queries', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24,
      seedStatus: makeSeedStatus({ specs_seed: { is_needed: true } }),
      focusGroups: [
        makeWeightFocusGroup({
          group_description_short: 'weight sensor',
          group_description_long: 'weight sensor',
          normalized_key_queue: ['weight', 'sensor'],
          unresolved_field_keys: ['weight', 'sensor'],
          field_keys: ['weight', 'sensor'],
          total_field_count: 2,
          desc: 'weight sensor',
        }),
      ],
    });

    assert.ok(
      'weight' in profile.field_target_queries || 'sensor' in profile.field_target_queries,
      'at least one focus field has targeted queries'
    );

    for (const queries of Object.values(profile.field_target_queries)) {
      assert.ok(queries.length <= 3, 'field_target_queries capped at 3 per field');
    }
  });

  it('doc_hint_queries groups queries by doc_hint', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 24
    });

    assert.ok(Array.isArray(profile.doc_hint_queries));
    for (const row of profile.doc_hint_queries) {
      assert.ok(typeof row.doc_hint === 'string' && row.doc_hint.length > 0, 'doc_hint is non-empty');
      assert.ok(Array.isArray(row.queries), 'queries is array');
      assert.ok(row.queries.length <= 3, 'doc_hint queries capped at 3');
    }
  });
});

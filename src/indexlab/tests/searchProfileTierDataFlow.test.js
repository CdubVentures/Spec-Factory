import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { toSearchProfileQueryRow } from '../runtimeBridgePayloads.js';
import { refreshSearchProfileCollections } from '../runtimeBridgeArtifacts.js';

const FIXED_TS = '2026-03-22T00:00:00.000Z';

function makeSearchProfileRow(kind = 'legacy', overrides = {}) {
  const rows = {
    legacy: {
      query: 'Razer Viper V3 Pro specifications',
      hint_source: 'field_rules.search_hints',
      target_fields: ['sensor_type', 'dpi_range'],
      doc_hint: 'spec',
      domain_hint: 'razer.com',
      source_host: 'razer.com',
      attempts: 1,
      result_count: 5,
      providers: ['serper'],
    },
    seed: {
      query: 'Razer Viper V3 Pro specifications',
      hint_source: 'tier1_seed',
      tier: 'seed',
      target_fields: [],
      doc_hint: 'spec',
      domain_hint: 'razer.com',
      source_host: 'razer.com',
      attempts: 0,
      result_count: 0,
      providers: [],
    },
    group_search: {
      query: 'Razer Viper V3 Pro sensor DPI tracking',
      hint_source: 'tier2_group',
      tier: 'group_search',
      target_fields: ['sensor_type', 'dpi_range'],
      doc_hint: '',
      domain_hint: '',
      source_host: '',
      group_key: 'sensor_specs',
      attempts: 0,
      result_count: 0,
      providers: [],
    },
    key_search: {
      query: 'Razer Viper V3 Pro polling rate',
      hint_source: 'tier3_key',
      tier: 'key_search',
      target_fields: ['polling_rate'],
      doc_hint: '',
      domain_hint: '',
      source_host: '',
      group_key: 'sensor_specs',
      normalized_key: 'polling_rate',
      repeat_count: 1,
      all_aliases: ['report rate', 'Hz'],
      domain_hints: ['razer.com', 'rtings.com'],
      content_types: ['spec_sheet', 'review'],
      domains_tried_for_key: ['razer.com'],
      content_types_tried_for_key: ['spec_sheet'],
      attempts: 0,
      result_count: 0,
      providers: [],
    },
  };

  return { ...(rows[kind] || rows.legacy), ...overrides };
}

function makeBridgeState(overrides = {}) {
  return {
    runId: 'test-run-001',
    context: { category: 'mouse', productId: 'mouse-razer-viper-v3-pro' },
    searchProfile: {
      status: 'planned',
      query_rows: [],
      query_count: 0,
      selected_query_count: 0,
      selected_queries: [],
      query_stats: [],
      queries: [],
      generated_at: FIXED_TS,
      run_id: 'test-run-001',
      category: 'mouse',
      product_id: 'mouse-razer-viper-v3-pro',
      ...overrides,
    },
  };
}

describe('toSearchProfileQueryRow', () => {
  it('preserves the legacy search-profile row contract', () => {
    const result = toSearchProfileQueryRow(makeSearchProfileRow('legacy'));

    assert.deepEqual(
      {
        query: result.query,
        hint_source: result.hint_source,
        target_fields: result.target_fields,
        doc_hint: result.doc_hint,
        domain_hint: result.domain_hint,
        source_host: result.source_host,
        attempts: result.attempts,
        result_count: result.result_count,
        providers: result.providers,
      },
      {
        query: 'Razer Viper V3 Pro specifications',
        hint_source: 'field_rules.search_hints',
        target_fields: ['sensor_type', 'dpi_range'],
        doc_hint: 'spec',
        domain_hint: 'razer.com',
        source_host: 'razer.com',
        attempts: 1,
        result_count: 5,
        providers: ['serper'],
      },
    );
  });

  it('preserves tier metadata for key-search rows', () => {
    const result = toSearchProfileQueryRow(makeSearchProfileRow('key_search'));

    assert.deepEqual(
      {
        tier: result.tier,
        group_key: result.group_key,
        normalized_key: result.normalized_key,
        repeat_count: result.repeat_count,
        all_aliases: result.all_aliases,
        domain_hints: result.domain_hints,
        content_types: result.content_types,
        domains_tried_for_key: result.domains_tried_for_key,
        content_types_tried_for_key: result.content_types_tried_for_key,
      },
      {
        tier: 'key_search',
        group_key: 'sensor_specs',
        normalized_key: 'polling_rate',
        repeat_count: 1,
        all_aliases: ['report rate', 'Hz'],
        domain_hints: ['razer.com', 'rtings.com'],
        content_types: ['spec_sheet', 'review'],
        domains_tried_for_key: ['razer.com'],
        content_types_tried_for_key: ['spec_sheet'],
      },
    );
  });

  it('returns safe tier defaults when tier metadata is absent', () => {
    for (const { label, input } of [
      { label: 'legacy row', input: makeSearchProfileRow('legacy') },
      { label: 'empty row', input: {} },
    ]) {
      const result = toSearchProfileQueryRow(input);

      assert.deepEqual(
        {
          tier: result.tier,
          group_key: result.group_key,
          normalized_key: result.normalized_key,
          repeat_count: result.repeat_count,
          all_aliases: result.all_aliases,
          domain_hints: result.domain_hints,
          content_types: result.content_types,
          domains_tried_for_key: result.domains_tried_for_key,
          content_types_tried_for_key: result.content_types_tried_for_key,
        },
        {
          tier: '',
          group_key: '',
          normalized_key: '',
          repeat_count: 0,
          all_aliases: [],
          domain_hints: [],
          content_types: [],
          domains_tried_for_key: [],
          content_types_tried_for_key: [],
        },
        label,
      );
    }
  });
});

describe('refreshSearchProfileCollections', () => {
  it('preserves caller-owned planned and executed statuses when rows exist', () => {
    for (const status of ['planned', 'executed']) {
      const state = makeBridgeState({
        status,
        query_rows: [makeSearchProfileRow('legacy')],
      });

      refreshSearchProfileCollections(state, FIXED_TS);

      assert.equal(state.searchProfile.status, status, status);
      assert.equal(state.searchProfile.query_count, 1, status);
      assert.equal(state.searchProfile.selected_query_count, 1, status);
      assert.deepEqual(
        state.searchProfile.selected_queries,
        ['Razer Viper V3 Pro specifications'],
        status,
      );
    }
  });

  it('derives executed or pending from pending status based on normalized row presence', () => {
    for (const { label, queryRows, expectedStatus, expectedCount } of [
      {
        label: 'pending with rows becomes executed',
        queryRows: [makeSearchProfileRow('legacy')],
        expectedStatus: 'executed',
        expectedCount: 1,
      },
      {
        label: 'pending without rows stays pending',
        queryRows: [],
        expectedStatus: 'pending',
        expectedCount: 0,
      },
      {
        label: 'pending with blank rows stays pending after normalization',
        queryRows: [{ query: '   ' }],
        expectedStatus: 'pending',
        expectedCount: 0,
      },
    ]) {
      const state = makeBridgeState({
        status: 'pending',
        query_rows: queryRows,
      });

      refreshSearchProfileCollections(state, FIXED_TS);

      assert.equal(state.searchProfile.status, expectedStatus, label);
      assert.equal(state.searchProfile.query_count, expectedCount, label);
      assert.equal(state.searchProfile.selected_query_count, expectedCount, label);
    }
  });
});

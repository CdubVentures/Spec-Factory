// WHY: Characterization + contract tests for tier metadata flowing through
// the search profile pipeline: event emission → bridge normalizer → artifact.
// Phase 1 locks current (stripped) behavior; Phase 2 tests add tier expectations.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  toSearchProfileQueryRow,
  mergeSearchProfileRows,
} from '../runtimeBridgePayloads.js';
import { refreshSearchProfileCollections } from '../runtimeBridgeArtifacts.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeLegacyRow(overrides = {}) {
  return {
    query: 'Razer Viper V3 Pro specifications',
    hint_source: 'field_rules.search_hints',
    target_fields: ['sensor_type', 'dpi_range'],
    doc_hint: 'spec',
    domain_hint: 'razer.com',
    source_host: 'razer.com',
    attempts: 1,
    result_count: 5,
    providers: ['serper'],
    ...overrides,
  };
}

function makeTierRow(tier, overrides = {}) {
  const base = {
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
      preferred_content_types: ['spec_sheet', 'review'],
      domains_tried_for_key: ['razer.com'],
      content_types_tried_for_key: ['spec_sheet'],
      attempts: 0,
      result_count: 0,
      providers: [],
    },
  };
  return { ...(base[tier] || base.seed), ...overrides };
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
      generated_at: '2026-03-22T00:00:00.000Z',
      run_id: 'test-run-001',
      category: 'mouse',
      product_id: 'mouse-razer-viper-v3-pro',
      ...overrides,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1: CHARACTERIZATION — lock current (pre-fix) behavior
// ═══════════════════════════════════════════════════════════════════════════

describe('searchProfileTierDataFlow — characterization', () => {
  describe('toSearchProfileQueryRow — legacy rows', () => {
    it('preserves all standard fields from a legacy row', () => {
      const input = makeLegacyRow();
      const result = toSearchProfileQueryRow(input);

      assert.equal(result.query, 'Razer Viper V3 Pro specifications');
      assert.equal(result.hint_source, 'field_rules.search_hints');
      assert.deepEqual(result.target_fields, ['sensor_type', 'dpi_range']);
      assert.equal(result.doc_hint, 'spec');
      assert.equal(result.domain_hint, 'razer.com');
      assert.equal(result.source_host, 'razer.com');
      assert.equal(result.attempts, 1);
      assert.equal(result.result_count, 5);
      assert.deepEqual(result.providers, ['serper']);
    });

    it('returns safe defaults for empty input', () => {
      const result = toSearchProfileQueryRow({});
      assert.equal(result.query, '');
      assert.deepEqual(result.target_fields, []);
      assert.equal(result.attempts, 0);
      assert.equal(result.result_count, 0);
      assert.deepEqual(result.providers, []);
      assert.equal(result.hint_source, '');
    });
  });

  describe('refreshSearchProfileCollections — status handling', () => {
    it('preserves "planned" status when rows exist', () => {
      const state = makeBridgeState();
      state.searchProfile.query_rows = [makeLegacyRow()];
      state.searchProfile.status = 'planned';

      refreshSearchProfileCollections(state, '2026-03-22T00:00:00.000Z');

      assert.equal(state.searchProfile.status, 'planned');
    });

    it('preserves "planned" status even when no rows', () => {
      const state = makeBridgeState();
      state.searchProfile.query_rows = [];
      state.searchProfile.status = 'planned';

      refreshSearchProfileCollections(state, '2026-03-22T00:00:00.000Z');

      assert.equal(state.searchProfile.status, 'planned');
    });

    it('defaults to "executed" when status is pending and rows exist', () => {
      const state = makeBridgeState();
      state.searchProfile.query_rows = [makeLegacyRow()];
      state.searchProfile.status = 'pending';

      refreshSearchProfileCollections(state, '2026-03-22T00:00:00.000Z');

      assert.equal(state.searchProfile.status, 'executed');
    });

    it('stays "pending" when status is pending and no rows', () => {
      const state = makeBridgeState();
      state.searchProfile.query_rows = [];
      state.searchProfile.status = 'pending';

      refreshSearchProfileCollections(state, '2026-03-22T00:00:00.000Z');

      assert.equal(state.searchProfile.status, 'pending');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2: MACRO-RED — tier-aware expectations (these FAIL until Phase 3)
// ═══════════════════════════════════════════════════════════════════════════

describe('searchProfileTierDataFlow — tier preservation contract', () => {
  describe('toSearchProfileQueryRow — tier scalar fields', () => {
    it('preserves tier, group_key, normalized_key, repeat_count', () => {
      const input = makeTierRow('key_search');
      const result = toSearchProfileQueryRow(input);

      assert.equal(result.tier, 'key_search');
      assert.equal(result.group_key, 'sensor_specs');
      assert.equal(result.normalized_key, 'polling_rate');
      assert.equal(result.repeat_count, 1);
    });

    it('preserves tier and group_key for tier2 rows', () => {
      const input = makeTierRow('group_search');
      const result = toSearchProfileQueryRow(input);

      assert.equal(result.tier, 'group_search');
      assert.equal(result.group_key, 'sensor_specs');
    });

    it('preserves tier for tier1 seed rows', () => {
      const input = makeTierRow('seed');
      const result = toSearchProfileQueryRow(input);

      assert.equal(result.tier, 'seed');
    });
  });

  describe('toSearchProfileQueryRow — tier array fields', () => {
    it('preserves all_aliases', () => {
      const input = makeTierRow('key_search');
      const result = toSearchProfileQueryRow(input);
      assert.deepEqual(result.all_aliases, ['report rate', 'Hz']);
    });

    it('preserves domain_hints', () => {
      const input = makeTierRow('key_search');
      const result = toSearchProfileQueryRow(input);
      assert.deepEqual(result.domain_hints, ['razer.com', 'rtings.com']);
    });

    it('preserves preferred_content_types', () => {
      const input = makeTierRow('key_search');
      const result = toSearchProfileQueryRow(input);
      assert.deepEqual(result.preferred_content_types, ['spec_sheet', 'review']);
    });

    it('preserves domains_tried_for_key', () => {
      const input = makeTierRow('key_search');
      const result = toSearchProfileQueryRow(input);
      assert.deepEqual(result.domains_tried_for_key, ['razer.com']);
    });

    it('preserves content_types_tried_for_key', () => {
      const input = makeTierRow('key_search');
      const result = toSearchProfileQueryRow(input);
      assert.deepEqual(result.content_types_tried_for_key, ['spec_sheet']);
    });
  });

  describe('toSearchProfileQueryRow — tier defaults for missing fields', () => {
    it('returns safe defaults when tier fields are absent', () => {
      const input = makeLegacyRow();
      const result = toSearchProfileQueryRow(input);

      assert.equal(result.tier, '');
      assert.equal(result.group_key, '');
      assert.equal(result.normalized_key, '');
      assert.equal(result.repeat_count, 0);
      assert.deepEqual(result.all_aliases, []);
      assert.deepEqual(result.domain_hints, []);
      assert.deepEqual(result.preferred_content_types, []);
      assert.deepEqual(result.domains_tried_for_key, []);
      assert.deepEqual(result.content_types_tried_for_key, []);
    });
  });

  describe('refreshSearchProfileCollections — status preservation', () => {
    it('preserves "planned" status when rows exist', () => {
      const state = makeBridgeState();
      state.searchProfile.query_rows = [makeLegacyRow()];
      state.searchProfile.status = 'planned';

      refreshSearchProfileCollections(state, '2026-03-22T00:00:00.000Z');

      assert.equal(state.searchProfile.status, 'planned');
    });

    it('preserves "executed" status when rows exist', () => {
      const state = makeBridgeState();
      state.searchProfile.query_rows = [makeLegacyRow()];
      state.searchProfile.status = 'executed';

      refreshSearchProfileCollections(state, '2026-03-22T00:00:00.000Z');

      assert.equal(state.searchProfile.status, 'executed');
    });
  });
});

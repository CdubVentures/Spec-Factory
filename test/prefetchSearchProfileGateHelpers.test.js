import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getQueryGateFlags,
  buildGateSummary,
  fieldRulesCountForSource,
  normalizeFieldRuleGateCounts,
} from '../tools/gui-react/src/pages/runtime-ops/panels/prefetchSearchProfileGateHelpers.js';

describe('getQueryGateFlags', () => {
  it('does not enable queryTerms/fieldRules from hint_source_counts when row hint_source is empty', () => {
    const flags = getQueryGateFlags(
      {
        query: 'Endgame Gear OP1w 4k Wireless',
        hint_source: '',
        doc_hint: '',
        domain_hint: '',
        source_host: '',
      },
      { 'field_rules.search_hints': 48, deterministic: 24 },
    );

    assert.equal(flags.queryTerms, false);
    assert.equal(flags.fieldRules, false);
  });

  it('enables sourceHost from domain_hint fallback even when source_host is empty', () => {
    const flags = getQueryGateFlags(
      {
        query: 'site:rtings.com Endgame Gear OP1w 4k Wireless',
        hint_source: 'field_rules.search_hints',
        doc_hint: '',
        domain_hint: 'rtings.com',
        source_host: '',
      },
      {},
    );

    assert.equal(flags.sourceHost, true);
  });
});

describe('buildGateSummary', () => {
  it('keeps query terms OFF while enabling field-rules from indexed field_rules keys', () => {
    const summary = buildGateSummary(
      [
        {
          query: 'Endgame Gear OP1w 4k Wireless',
          hint_source: '',
          doc_hint: '',
          domain_hint: '',
          source_host: '',
          __from_plan_profile: true,
        },
      ],
      { 'field_rules.search_hints': 48, deterministic: 24 },
    );

    assert.equal(summary.queryTermsOn, false);
    assert.equal(summary.fieldRulesOn, true);
    assert.equal(summary.queryTermsCount, 0);
    assert.ok(summary.fieldRulesCount > 0);
  });

  it('turns query terms and field-rules ON from row gate keys', () => {
    const summary = buildGateSummary(
      [
        {
          query: 'Endgame Gear OP1w 4k Wireless weight',
          hint_source: 'field_rules.search_hints',
          doc_hint: '',
          domain_hint: '',
          source_host: '',
        },
      ],
      {},
    );

    assert.equal(summary.queryTermsOn, true);
    assert.equal(summary.fieldRulesOn, true);
    assert.equal(summary.queryTermsCount, 1);
    assert.equal(summary.fieldRulesCount, 1);
  });

  it('includes per-key field-rule counts for gate-bridge display', () => {
    const summary = buildGateSummary(
      [],
      {
        'field_rules.search_hints': 48,
        'field_rules.domain_hints': 12,
        deterministic: 24,
      },
    );

    assert.deepEqual(summary.fieldRuleKeyCounts, [
      { source: 'field_rules.search_hints', count: 48 },
      { source: 'field_rules.domain_hints', count: 12 },
    ]);
  });
});

describe('fieldRulesCountForSource', () => {
  it('returns per-key count for row hint_source when it is a field_rules key', () => {
    const count = fieldRulesCountForSource(
      {
        hint_source: 'field_rules.search_hints',
      },
      {
        'field_rules.search_hints': 48,
        'field_rules.domain_hints': 12,
      },
    );
    assert.equal(count, 48);
  });

  it('returns zero when row hint_source is not a field_rules key', () => {
    const count = fieldRulesCountForSource(
      {
        hint_source: 'runtime_bridge_baseline',
      },
      {
        'field_rules.search_hints': 48,
      },
    );
    assert.equal(count, 0);
  });
});

describe('normalizeFieldRuleGateCounts', () => {
  it('normalizes known gate keys in stable order and keeps explicit off state', () => {
    const rows = normalizeFieldRuleGateCounts({
      'search_hints.query_terms': {
        value_count: 3,
        enabled_field_count: 1,
        disabled_field_count: 0,
        status: 'active',
      },
      'search_hints.domain_hints': {
        value_count: 0,
        enabled_field_count: 0,
        disabled_field_count: 2,
        status: 'off',
      },
      'search_hints.preferred_content_types': {
        value_count: 0,
        enabled_field_count: 2,
        disabled_field_count: 0,
        status: 'zero',
      },
    });

    assert.deepEqual(
      rows.map((row) => ({
        key: row.key,
        status: row.status,
        valueCount: row.valueCount,
      })),
      [
        { key: 'search_hints.query_terms', status: 'active', valueCount: 3 },
        { key: 'search_hints.domain_hints', status: 'off', valueCount: 0 },
        { key: 'search_hints.preferred_content_types', status: 'zero', valueCount: 0 },
      ],
    );
  });

  it('derives zero status when no explicit status exists and value_count is zero', () => {
    const rows = normalizeFieldRuleGateCounts({
      'search_hints.query_terms': {
        value_count: 0,
        enabled_field_count: 2,
        disabled_field_count: 0,
      },
    });

    const queryTermsRow = rows.find((row) => row.key === 'search_hints.query_terms');
    assert.equal(Boolean(queryTermsRow), true);
    assert.equal(queryTermsRow?.status, 'zero');
    assert.equal(queryTermsRow?.valueCount, 0);
  });
});

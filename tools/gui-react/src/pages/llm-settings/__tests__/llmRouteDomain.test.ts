import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import type { LlmRouteRow } from '../../../types/llmSettings.ts';
import {
  clampToRange,
  toEffortBand,
  rowEffortBand,
  normalizeRowEffortBand,
  normalizeRowsEffortBand,
  applyContextPack,
  rowDefaultsComparable,
  applyRoutePreset,
  EFFORT_BOUNDS,
  MAX_TOKEN_BOUNDS,
  MIN_EVIDENCE_BOUNDS,
} from '../llmRouteDomain.ts';

function makeRow(overrides: Partial<LlmRouteRow> = {}): LlmRouteRow {
  return {
    id: 1,
    category: 'test',
    scope: 'field',
    route_key: 'test:field:required:hard:rare',
    required_level: 'required',
    difficulty: 'hard',
    availability: 'rare',
    effort: 5,
    effort_band: '4-6',
    single_source_data: true,
    all_source_data: false,
    enable_websearch: false,
    model_ladder_today: '',
    all_sources_confidence_repatch: false,
    max_tokens: 4096,
    studio_key_navigation_sent_in_extract_review: true,
    studio_contract_rules_sent_in_extract_review: true,
    studio_extraction_guidance_sent_in_extract_review: false,
    studio_tooltip_or_description_sent_when_present: false,
    studio_enum_options_sent_when_present: false,
    studio_component_variance_constraints_sent_in_component_review: false,
    studio_parse_template_sent_direct_in_extract_review: true,
    studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: false,
    studio_required_level_sent_in_extract_review: true,
    studio_component_entity_set_sent_when_component_field: false,
    studio_evidence_policy_sent_direct_in_extract_review: true,
    studio_variance_policy_sent_in_component_review: false,
    studio_constraints_sent_in_component_review: false,
    studio_send_booleans_prompted_to_model: false,
    scalar_linked_send: 'scalar value',
    component_values_send: 'component values',
    list_values_send: 'list values',
    llm_output_min_evidence_refs_required: 1,
    insufficient_evidence_action: 'threshold_unmet',
    ...overrides,
  };
}

describe('clampToRange', () => {
  it('clamps value within bounds', () => {
    strictEqual(clampToRange(5, 1, 10), 5);
  });
  it('clamps below min', () => {
    strictEqual(clampToRange(-1, 1, 10), 1);
  });
  it('clamps above max', () => {
    strictEqual(clampToRange(15, 1, 10), 10);
  });
  it('uses min for NaN', () => {
    strictEqual(clampToRange(NaN, 1, 10), 1);
  });
  it('uses min for Infinity (not finite, falls back to min)', () => {
    strictEqual(clampToRange(Infinity, 1, 10), 1);
  });
  it('uses min for -Infinity', () => {
    strictEqual(clampToRange(-Infinity, 1, 10), 1);
  });
  it('returns exact min boundary', () => {
    strictEqual(clampToRange(1, 1, 10), 1);
  });
  it('returns exact max boundary', () => {
    strictEqual(clampToRange(10, 1, 10), 10);
  });
});

describe('toEffortBand', () => {
  const cases: [number, string][] = [
    [1, '1-3'],
    [2, '1-3'],
    [3, '1-3'],
    [4, '4-6'],
    [5, '4-6'],
    [6, '4-6'],
    [7, '7-8'],
    [8, '7-8'],
    [9, '9-10'],
    [10, '9-10'],
  ];
  for (const [input, expected] of cases) {
    it(`maps effort ${input} to band ${expected}`, () => {
      strictEqual(toEffortBand(input), expected);
    });
  }
  it('maps NaN to lowest band', () => {
    strictEqual(toEffortBand(NaN), '1-3');
  });
  it('maps Infinity to lowest band (not finite, falls back to min)', () => {
    strictEqual(toEffortBand(Infinity), '1-3');
  });
  it('maps -Infinity to lowest band', () => {
    strictEqual(toEffortBand(-Infinity), '1-3');
  });
});

describe('rowEffortBand', () => {
  it('delegates to toEffortBand via row.effort', () => {
    strictEqual(rowEffortBand({ effort: 7 }), '7-8');
    strictEqual(rowEffortBand({ effort: 1 }), '1-3');
    strictEqual(rowEffortBand({ effort: 10 }), '9-10');
  });
});

describe('normalizeRowEffortBand', () => {
  it('returns same row reference if band already matches', () => {
    const row = makeRow({ effort: 5, effort_band: '4-6' });
    const result = normalizeRowEffortBand(row);
    strictEqual(result, row);
  });
  it('returns new row with corrected band if mismatched', () => {
    const row = makeRow({ effort: 9, effort_band: '4-6' });
    const result = normalizeRowEffortBand(row);
    strictEqual(result.effort_band, '9-10');
    ok(result !== row);
  });
});

describe('normalizeRowsEffortBand', () => {
  it('normalizes all rows in array', () => {
    const rows = [
      makeRow({ effort: 1, effort_band: 'wrong' }),
      makeRow({ effort: 10, effort_band: 'wrong' }),
    ];
    const result = normalizeRowsEffortBand(rows);
    strictEqual(result[0].effort_band, '1-3');
    strictEqual(result[1].effort_band, '9-10');
  });
});

describe('applyContextPack', () => {
  it('minimal: enables exactly 5 flags + booleans off', () => {
    const row = makeRow();
    const result = applyContextPack(row, 'minimal');
    strictEqual(result.studio_key_navigation_sent_in_extract_review, true);
    strictEqual(result.studio_contract_rules_sent_in_extract_review, true);
    strictEqual(result.studio_parse_template_sent_direct_in_extract_review, true);
    strictEqual(result.studio_required_level_sent_in_extract_review, true);
    strictEqual(result.studio_evidence_policy_sent_direct_in_extract_review, true);
    strictEqual(result.studio_send_booleans_prompted_to_model, false);
    strictEqual(result.studio_extraction_guidance_sent_in_extract_review, false);
    strictEqual(result.studio_tooltip_or_description_sent_when_present, false);
    strictEqual(result.studio_enum_options_sent_when_present, false);
    strictEqual(result.studio_component_variance_constraints_sent_in_component_review, false);
  });

  it('full: enables all flags except booleans', () => {
    const row = makeRow();
    const result = applyContextPack(row, 'full');
    strictEqual(result.studio_key_navigation_sent_in_extract_review, true);
    strictEqual(result.studio_extraction_guidance_sent_in_extract_review, true);
    strictEqual(result.studio_component_variance_constraints_sent_in_component_review, true);
    strictEqual(result.studio_send_booleans_prompted_to_model, false);
  });

  it('standard: enables all flags, conditionally disables component flags for non-component scope', () => {
    const row = makeRow({ scope: 'field' });
    const result = applyContextPack(row, 'standard');
    strictEqual(result.studio_key_navigation_sent_in_extract_review, true);
    strictEqual(result.studio_component_variance_constraints_sent_in_component_review, false);
    strictEqual(result.studio_variance_policy_sent_in_component_review, false);
    strictEqual(result.studio_constraints_sent_in_component_review, false);
    strictEqual(result.studio_component_entity_set_sent_when_component_field, false);
    strictEqual(result.studio_send_booleans_prompted_to_model, false);
  });

  it('standard: enables component flags for component scope', () => {
    const row = makeRow({ scope: 'component' });
    const result = applyContextPack(row, 'standard');
    strictEqual(result.studio_component_variance_constraints_sent_in_component_review, true);
    strictEqual(result.studio_variance_policy_sent_in_component_review, true);
    strictEqual(result.studio_constraints_sent_in_component_review, true);
    strictEqual(result.studio_component_entity_set_sent_when_component_field, true);
  });
});

describe('rowDefaultsComparable', () => {
  it('excludes id, category, and route_key', () => {
    const row = makeRow({ id: 999, category: 'special', route_key: 'unique:key' });
    const comparable = rowDefaultsComparable(row);
    ok(!('id' in comparable));
    ok(!('category' in comparable));
    ok(!('route_key' in comparable));
  });

  it('includes all behavioral fields', () => {
    const row = makeRow();
    const comparable = rowDefaultsComparable(row);
    const keys = Object.keys(comparable);
    ok(keys.includes('scope'));
    ok(keys.includes('required_level'));
    ok(keys.includes('effort'));
    ok(keys.includes('max_tokens'));
    ok(keys.includes('studio_key_navigation_sent_in_extract_review'));
    ok(keys.includes('insufficient_evidence_action'));
    ok(keys.includes('scalar_linked_send'));
    ok(keys.includes('llm_output_min_evidence_refs_required'));
  });

  it('produces identical JSON for identical rows', () => {
    const row1 = makeRow();
    const row2 = makeRow();
    deepStrictEqual(rowDefaultsComparable(row1), rowDefaultsComparable(row2));
  });

  it('produces different JSON when behavioral field differs', () => {
    const row1 = makeRow({ effort: 5 });
    const row2 = makeRow({ effort: 8 });
    const json1 = JSON.stringify(rowDefaultsComparable(row1));
    const json2 = JSON.stringify(rowDefaultsComparable(row2));
    ok(json1 !== json2);
  });
});

describe('applyRoutePreset', () => {
  it('balanced: enables all_source_data for required level', () => {
    const row = makeRow({ required_level: 'required', difficulty: 'easy' });
    const result = applyRoutePreset(row, 'balanced');
    strictEqual(result.all_source_data, true);
  });

  it('balanced: disables all_source_data for optional/easy', () => {
    const row = makeRow({ required_level: 'optional', difficulty: 'easy' });
    const result = applyRoutePreset(row, 'balanced');
    strictEqual(result.all_source_data, false);
  });

  it('balanced: enables websearch for rare availability', () => {
    const row = makeRow({ availability: 'rare', difficulty: 'easy', required_level: 'optional' });
    const result = applyRoutePreset(row, 'balanced');
    strictEqual(result.enable_websearch, true);
  });

  it('balanced: disables websearch for always/easy/optional', () => {
    const row = makeRow({ availability: 'always', difficulty: 'easy', required_level: 'optional' });
    const result = applyRoutePreset(row, 'balanced');
    strictEqual(result.enable_websearch, false);
  });

  it('balanced: clamps max_tokens to preset bounds', () => {
    const row = makeRow({ max_tokens: 100 });
    const result = applyRoutePreset(row, 'balanced');
    ok(result.max_tokens >= 4096);
    ok(result.max_tokens <= 8192);
  });

  it('balanced: preserves existing model_ladder_today if set', () => {
    const row = makeRow({ model_ladder_today: 'custom-model' });
    const result = applyRoutePreset(row, 'balanced');
    strictEqual(result.model_ladder_today, 'custom-model');
  });

  it('balanced: sets model_ladder_today from preset if empty', () => {
    const row = makeRow({ model_ladder_today: '' });
    const result = applyRoutePreset(row, 'balanced');
    ok(result.model_ladder_today.length > 0);
  });

  it('deep: sets min evidence refs', () => {
    const row = makeRow({ llm_output_min_evidence_refs_required: 1 });
    const result = applyRoutePreset(row, 'deep');
    ok(result.llm_output_min_evidence_refs_required >= MIN_EVIDENCE_BOUNDS.min);
    ok(result.llm_output_min_evidence_refs_required <= MIN_EVIDENCE_BOUNDS.max);
  });

  it('deep: clamps max_tokens to deep preset bounds', () => {
    const row = makeRow({ max_tokens: 100 });
    const result = applyRoutePreset(row, 'deep');
    ok(result.max_tokens >= 12288);
    ok(result.max_tokens <= 65536);
  });
});

describe('bound constants', () => {
  it('EFFORT_BOUNDS has min=1 max=10', () => {
    strictEqual(EFFORT_BOUNDS.min, 1);
    strictEqual(EFFORT_BOUNDS.max, 10);
  });
  it('MAX_TOKEN_BOUNDS has expected range', () => {
    strictEqual(MAX_TOKEN_BOUNDS.min, 256);
    strictEqual(MAX_TOKEN_BOUNDS.max, 65536);
  });
  it('MIN_EVIDENCE_BOUNDS has expected range', () => {
    strictEqual(MIN_EVIDENCE_BOUNDS.min, 1);
    strictEqual(MIN_EVIDENCE_BOUNDS.max, 5);
  });
});

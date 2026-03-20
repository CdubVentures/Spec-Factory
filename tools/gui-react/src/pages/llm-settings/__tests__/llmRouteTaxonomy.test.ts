import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import type { LlmRouteRow } from '../../../types/llmSettings.ts';
import {
  REQUIRED_LEVEL_RANK,
  DIFFICULTY_RANK,
  AVAILABILITY_RANK,
  REQUIRED_LEVEL_OPTIONS,
  DIFFICULTY_OPTIONS,
  AVAILABILITY_OPTIONS,
  PROMPT_FLAG_FIELDS,
  SORT_BY_KEYS,
  SORT_DIR_KEYS,
  CONTEXT_PACK_OPTIONS,
  SCALAR_SEND_OPTIONS,
  COMPONENT_SEND_OPTIONS,
  LIST_SEND_OPTIONS,
  INSUFFICIENT_EVIDENCE_OPTIONS,
  rankForSort,
  tagCls,
} from '../llmRouteTaxonomy.ts';

function makeRow(overrides: Partial<LlmRouteRow> = {}): LlmRouteRow {
  return {
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
  } as LlmRouteRow;
}

describe('rank maps', () => {
  it('REQUIRED_LEVEL_RANK has 7 entries', () => {
    strictEqual(Object.keys(REQUIRED_LEVEL_RANK).length, 7);
  });
  it('identity has highest rank', () => {
    strictEqual(REQUIRED_LEVEL_RANK['identity'], 7);
  });
  it('commerce has lowest rank', () => {
    strictEqual(REQUIRED_LEVEL_RANK['commerce'], 1);
  });
  it('DIFFICULTY_RANK has 4 entries', () => {
    strictEqual(Object.keys(DIFFICULTY_RANK).length, 4);
  });
  it('instrumented has highest difficulty rank', () => {
    strictEqual(DIFFICULTY_RANK['instrumented'], 4);
  });
  it('AVAILABILITY_RANK has 5 entries', () => {
    strictEqual(Object.keys(AVAILABILITY_RANK).length, 5);
  });
  it('always has highest availability rank', () => {
    strictEqual(AVAILABILITY_RANK['always'], 5);
  });
});

describe('derived option arrays', () => {
  it('REQUIRED_LEVEL_OPTIONS matches rank map keys', () => {
    strictEqual(REQUIRED_LEVEL_OPTIONS.length, 7);
    for (const opt of REQUIRED_LEVEL_OPTIONS) {
      ok(opt in REQUIRED_LEVEL_RANK, `${opt} missing from rank map`);
    }
  });
  it('DIFFICULTY_OPTIONS matches rank map keys', () => {
    strictEqual(DIFFICULTY_OPTIONS.length, 4);
    for (const opt of DIFFICULTY_OPTIONS) {
      ok(opt in DIFFICULTY_RANK, `${opt} missing from rank map`);
    }
  });
  it('AVAILABILITY_OPTIONS matches rank map keys', () => {
    strictEqual(AVAILABILITY_OPTIONS.length, 5);
    for (const opt of AVAILABILITY_OPTIONS) {
      ok(opt in AVAILABILITY_RANK, `${opt} missing from rank map`);
    }
  });
});

describe('enum option arrays', () => {
  it('CONTEXT_PACK_OPTIONS has standard, minimal, full', () => {
    strictEqual(CONTEXT_PACK_OPTIONS.length, 3);
    ok(CONTEXT_PACK_OPTIONS.includes('standard'));
    ok(CONTEXT_PACK_OPTIONS.includes('minimal'));
    ok(CONTEXT_PACK_OPTIONS.includes('full'));
  });
  it('SCALAR_SEND_OPTIONS has 2 entries', () => {
    strictEqual(SCALAR_SEND_OPTIONS.length, 2);
  });
  it('COMPONENT_SEND_OPTIONS has 2 entries', () => {
    strictEqual(COMPONENT_SEND_OPTIONS.length, 2);
  });
  it('LIST_SEND_OPTIONS has 2 entries', () => {
    strictEqual(LIST_SEND_OPTIONS.length, 2);
  });
  it('INSUFFICIENT_EVIDENCE_OPTIONS has 3 entries', () => {
    strictEqual(INSUFFICIENT_EVIDENCE_OPTIONS.length, 3);
    ok(INSUFFICIENT_EVIDENCE_OPTIONS.includes('threshold_unmet'));
    ok(INSUFFICIENT_EVIDENCE_OPTIONS.includes('return_unk'));
    ok(INSUFFICIENT_EVIDENCE_OPTIONS.includes('escalate'));
  });
});

describe('PROMPT_FLAG_FIELDS', () => {
  it('has 14 entries', () => {
    strictEqual(PROMPT_FLAG_FIELDS.length, 14);
  });
  it('all start with studio_', () => {
    for (const field of PROMPT_FLAG_FIELDS) {
      ok(String(field).startsWith('studio_'), `${String(field)} does not start with studio_`);
    }
  });
});

describe('SORT_BY_KEYS and SORT_DIR_KEYS', () => {
  it('SORT_BY_KEYS has 5 entries', () => {
    strictEqual(SORT_BY_KEYS.length, 5);
  });
  it('SORT_DIR_KEYS has asc and desc', () => {
    strictEqual(SORT_DIR_KEYS.length, 2);
    ok(SORT_DIR_KEYS.includes('asc'));
    ok(SORT_DIR_KEYS.includes('desc'));
  });
});

describe('rankForSort', () => {
  it('returns effort number for effort sort', () => {
    strictEqual(rankForSort(makeRow({ effort: 7 }), 'effort'), 7);
  });
  it('returns rank for required_level sort', () => {
    strictEqual(rankForSort(makeRow({ required_level: 'critical' }), 'required_level'), 6);
  });
  it('returns rank for difficulty sort', () => {
    strictEqual(rankForSort(makeRow({ difficulty: 'hard' }), 'difficulty'), 3);
  });
  it('returns rank for availability sort', () => {
    strictEqual(rankForSort(makeRow({ availability: 'always' }), 'availability'), 5);
  });
  it('returns route_key string for route_key sort', () => {
    strictEqual(rankForSort(makeRow({ route_key: 'abc' }), 'route_key'), 'abc');
  });
  it('returns 0 for unknown dimension values', () => {
    strictEqual(rankForSort(makeRow({ required_level: 'unknown' }), 'required_level'), 0);
  });
});

describe('tagCls', () => {
  it('required: identity -> sf-chip-danger', () => {
    strictEqual(tagCls('required', 'identity'), 'sf-chip-danger');
  });
  it('required: critical -> sf-chip-danger', () => {
    strictEqual(tagCls('required', 'critical'), 'sf-chip-danger');
  });
  it('required: expected -> sf-chip-info', () => {
    strictEqual(tagCls('required', 'expected'), 'sf-chip-info');
  });
  it('required: optional -> sf-chip-neutral', () => {
    strictEqual(tagCls('required', 'optional'), 'sf-chip-neutral');
  });
  it('difficulty: hard -> sf-chip-warning', () => {
    strictEqual(tagCls('difficulty', 'hard'), 'sf-chip-warning');
  });
  it('difficulty: instrumented -> sf-chip-warning', () => {
    strictEqual(tagCls('difficulty', 'instrumented'), 'sf-chip-warning');
  });
  it('difficulty: medium -> sf-chip-info', () => {
    strictEqual(tagCls('difficulty', 'medium'), 'sf-chip-info');
  });
  it('difficulty: easy -> sf-chip-success', () => {
    strictEqual(tagCls('difficulty', 'easy'), 'sf-chip-success');
  });
  it('availability: always -> sf-chip-success', () => {
    strictEqual(tagCls('availability', 'always'), 'sf-chip-success');
  });
  it('availability: sometimes -> sf-chip-warning', () => {
    strictEqual(tagCls('availability', 'sometimes'), 'sf-chip-warning');
  });
  it('availability: rare -> sf-chip-neutral', () => {
    strictEqual(tagCls('availability', 'rare'), 'sf-chip-neutral');
  });
  it('effort: 1 -> sf-chip-success', () => {
    strictEqual(tagCls('effort', '1'), 'sf-chip-success');
  });
  it('effort: 5 -> sf-chip-info', () => {
    strictEqual(tagCls('effort', '5'), 'sf-chip-info');
  });
  it('effort: 7 -> sf-chip-warning', () => {
    strictEqual(tagCls('effort', '7'), 'sf-chip-warning');
  });
  it('effort: 10 -> sf-chip-danger', () => {
    strictEqual(tagCls('effort', '10'), 'sf-chip-danger');
  });
  it('effort: empty string -> sf-chip-success (fallback to min)', () => {
    strictEqual(tagCls('effort', ''), 'sf-chip-success');
  });
});

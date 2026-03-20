import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import type { LlmRouteRow } from '../../../types/llmSettings.ts';
import {
  SCOPE_KEYS,
  scopes,
  prettyToken,
  presetDisplayName,
  routeSummary,
  flagLabel,
  selectedRouteTone,
  selectedRouteToneStyle,
} from '../llmRoutePresentation.ts';

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

describe('SCOPE_KEYS and scopes', () => {
  it('SCOPE_KEYS has 3 entries', () => {
    strictEqual(SCOPE_KEYS.length, 3);
    deepStrictEqual([...SCOPE_KEYS], ['field', 'component', 'list']);
  });
  it('scopes has matching labels', () => {
    strictEqual(scopes.length, 3);
    strictEqual(scopes[0].id, 'field');
    strictEqual(scopes[0].label, 'Field Keys');
    strictEqual(scopes[1].id, 'component');
    strictEqual(scopes[1].label, 'Component Review');
    strictEqual(scopes[2].id, 'list');
    strictEqual(scopes[2].label, 'List Review');
  });
});

describe('prettyToken', () => {
  it('replaces underscores with spaces and capitalizes words', () => {
    strictEqual(prettyToken('editorial_only'), 'Editorial Only');
  });
  it('handles single word', () => {
    strictEqual(prettyToken('hard'), 'Hard');
  });
  it('handles empty string', () => {
    strictEqual(prettyToken(''), '');
  });
});

describe('presetDisplayName', () => {
  it('formats as Required | Difficulty | Availability', () => {
    const row = makeRow({ required_level: 'critical', difficulty: 'hard', availability: 'rare' });
    strictEqual(presetDisplayName(row), 'Critical | Hard | Rare');
  });
});

describe('routeSummary', () => {
  it('formats as raw values with effort number', () => {
    const row = makeRow({ required_level: 'critical', difficulty: 'hard', availability: 'rare', effort: 8 });
    strictEqual(routeSummary(row), 'critical | hard | rare | effort 8');
  });
});

describe('flagLabel', () => {
  it('strips studio_ prefix and replaces separators', () => {
    strictEqual(flagLabel('studio_key_navigation_sent_in_extract_review'), 'key navigation in extract review');
  });
  it('handles _when_ separator', () => {
    strictEqual(flagLabel('studio_tooltip_or_description_sent_when_present'), 'tooltip or description when present');
  });
});

describe('selectedRouteTone', () => {
  it('effort 9-10 -> danger', () => {
    strictEqual(selectedRouteTone(makeRow({ effort: 9 })), 'sf-callout sf-callout-danger');
  });
  it('effort 7-8 -> warning', () => {
    strictEqual(selectedRouteTone(makeRow({ effort: 7 })), 'sf-callout sf-callout-warning');
  });
  it('effort 4-6 -> info', () => {
    strictEqual(selectedRouteTone(makeRow({ effort: 5 })), 'sf-callout sf-callout-info');
  });
  it('effort 1-3 -> success', () => {
    strictEqual(selectedRouteTone(makeRow({ effort: 2 })), 'sf-callout sf-callout-success');
  });
});

describe('selectedRouteToneStyle', () => {
  it('effort 9-10 -> danger CSS vars', () => {
    const style = selectedRouteToneStyle(makeRow({ effort: 10 }));
    strictEqual(style.color, 'var(--sf-state-danger-fg)');
    strictEqual(style.backgroundColor, 'var(--sf-state-danger-bg)');
    strictEqual(style.borderColor, 'var(--sf-state-danger-border)');
  });
  it('effort 7-8 -> warning CSS vars', () => {
    const style = selectedRouteToneStyle(makeRow({ effort: 8 }));
    strictEqual(style.color, 'var(--sf-state-warning-fg)');
  });
  it('effort 4-6 -> info CSS vars', () => {
    const style = selectedRouteToneStyle(makeRow({ effort: 4 }));
    strictEqual(style.color, 'var(--sf-state-info-fg)');
  });
  it('effort 1-3 -> success CSS vars', () => {
    const style = selectedRouteToneStyle(makeRow({ effort: 1 }));
    strictEqual(style.color, 'var(--sf-state-success-fg)');
  });
});

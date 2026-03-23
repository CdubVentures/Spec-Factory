// WHY: Golden-master characterization tests locking down current LLM route
// matrix shapes BEFORE migrating to registry-driven derivation.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LLM_ROUTE_BOOLEAN_KEYS } from '../src/db/specDbSchema.js';
import { defaultContextFlagsForScope } from '../src/db/specDbHelpers.js';

describe('LLM route column characterization (golden master)', () => {
  it('LLM_ROUTE_BOOLEAN_KEYS has exact 18 items', () => {
    assert.equal(LLM_ROUTE_BOOLEAN_KEYS.length, 18);
    assert.deepStrictEqual([...LLM_ROUTE_BOOLEAN_KEYS], [
      'single_source_data',
      'all_source_data',
      'enable_websearch',
      'all_sources_confidence_repatch',
      'studio_key_navigation_sent_in_extract_review',
      'studio_contract_rules_sent_in_extract_review',
      'studio_extraction_guidance_sent_in_extract_review',
      'studio_tooltip_or_description_sent_when_present',
      'studio_enum_options_sent_when_present',
      'studio_component_variance_constraints_sent_in_component_review',
      'studio_parse_template_sent_direct_in_extract_review',
      'studio_ai_mode_difficulty_effort_sent_direct_in_extract_review',
      'studio_required_level_sent_in_extract_review',
      'studio_component_entity_set_sent_when_component_field',
      'studio_evidence_policy_sent_direct_in_extract_review',
      'studio_variance_policy_sent_in_component_review',
      'studio_constraints_sent_in_component_review',
      'studio_send_booleans_prompted_to_model',
    ]);
  });

  it('defaultContextFlagsForScope(field) — exact shape', () => {
    const flags = defaultContextFlagsForScope('field');
    assert.deepStrictEqual(flags, {
      studio_key_navigation_sent_in_extract_review: 1,
      studio_contract_rules_sent_in_extract_review: 1,
      studio_extraction_guidance_sent_in_extract_review: 1,
      studio_tooltip_or_description_sent_when_present: 1,
      studio_enum_options_sent_when_present: 1,
      studio_component_variance_constraints_sent_in_component_review: 0,
      studio_parse_template_sent_direct_in_extract_review: 1,
      studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: 1,
      studio_required_level_sent_in_extract_review: 1,
      studio_component_entity_set_sent_when_component_field: 0,
      studio_evidence_policy_sent_direct_in_extract_review: 1,
      studio_variance_policy_sent_in_component_review: 0,
      studio_constraints_sent_in_component_review: 0,
      studio_send_booleans_prompted_to_model: 0,
    });
  });

  it('defaultContextFlagsForScope(component) — exact shape', () => {
    const flags = defaultContextFlagsForScope('component');
    assert.deepStrictEqual(flags, {
      studio_key_navigation_sent_in_extract_review: 1,
      studio_contract_rules_sent_in_extract_review: 1,
      studio_extraction_guidance_sent_in_extract_review: 1,
      studio_tooltip_or_description_sent_when_present: 1,
      studio_enum_options_sent_when_present: 1,
      studio_component_variance_constraints_sent_in_component_review: 1,
      studio_parse_template_sent_direct_in_extract_review: 1,
      studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: 1,
      studio_required_level_sent_in_extract_review: 1,
      studio_component_entity_set_sent_when_component_field: 1,
      studio_evidence_policy_sent_direct_in_extract_review: 1,
      studio_variance_policy_sent_in_component_review: 1,
      studio_constraints_sent_in_component_review: 1,
      studio_send_booleans_prompted_to_model: 0,
    });
  });
});

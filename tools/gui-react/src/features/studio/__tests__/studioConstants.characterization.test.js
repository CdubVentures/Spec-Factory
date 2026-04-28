import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELD_RULE_STUDIO_TIPS } from '../../../../../../src/field-rules/fieldRuleSchema.js';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadStudioConstants() {
  return loadBundledModule('tools/gui-react/src/utils/studioConstants.ts', {
    prefix: 'studio-constants-characterization-',
  });
}

test('STUDIO_TIPS characterizes the current field-rule tooltip key surface', async () => {
  const { STUDIO_TIPS } = await loadStudioConstants();

  assert.deepEqual(Object.keys(STUDIO_TIPS).sort(), [
    'ai_reasoning_note',
    'aliases',
    'availability',
    'comp_allow_new',
    'comp_constraints',
    'comp_field_key',
    'comp_override_allowed',
    'comp_require_identity_evidence',
    'comp_tolerance',
    'comp_variance_policy',
    'compile_errors',
    'compile_warnings',
    'component_db',
    'component_type',
    'content_types',
    'contract_range',
    'contract_unit',
    'data_list_field',
    'data_list_manual_values',
    'data_list_normalize',
    'data_type',
    'difficulty',
    'display_decimals',
    'display_mode',
    'domain_hints',
    'enum_component_values',
    'enum_detected_values',
    'enum_policy',
    'enum_source',
    'enum_value_source',
    'field_contract_table',
    'generated_artifacts',
    'guardrails_report',
    'key_section_ai_assist',
    'key_section_components',
    'key_section_constraints',
    'key_section_contract',
    'key_section_enum',
    'key_section_evidence',
    'key_section_priority',
    'key_section_search',
    'key_section_ui',
    'list_rules',
    'list_rules_dedupe',
    'list_rules_item_union',
    'list_rules_sort',
    'min_evidence_refs',
    'pif_priority_images',
    'query_terms',
    'required_level',
    'rounding_decimals',
    'rounding_mode',
    'run_compile',
    'shape',
    'tier_preference',
    'tooltip_bank_file',
    'tooltip_guidance',
    'tooltip_section_component_sources',
    'tooltip_section_enums',
    'tooltip_section_tooltip_bank',
    'ui_group',
    'ui_label',
    'ui_order',
    'ui_prefix',
    'ui_suffix',
    'variant_inventory_usage',
  ]);

  for (const [key, value] of Object.entries(STUDIO_TIPS)) {
    assert.equal(typeof value, 'string', `${key} value should be a string`);
    assert.ok(value.trim().length > 0, `${key} value should be non-empty`);
  }
});

test('STUDIO_TIPS derives field-rule tooltip strings from the registry', async () => {
  const { STUDIO_TIPS } = await loadStudioConstants();

  assert.deepEqual(
    Object.fromEntries(
      Object.keys(FIELD_RULE_STUDIO_TIPS)
        .sort()
        .map((key) => [key, STUDIO_TIPS[key]]),
    ),
    Object.fromEntries(Object.entries(FIELD_RULE_STUDIO_TIPS).sort()),
  );
});

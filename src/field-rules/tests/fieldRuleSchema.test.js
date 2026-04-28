import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_RULE_KINDS,
  FIELD_RULE_AI_ASSIST_TOGGLE_CONTROLS,
  FIELD_RULE_COMPONENT_TYPE_CONTROL,
  FIELD_RULE_CONTRACT_CONTROLS,
  FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS,
  FIELD_RULE_CONSTRAINT_CONTROL,
  FIELD_RULE_EVIDENCE_CONTROLS,
  FIELD_RULE_ENUM_CONTROLS,
  FIELD_RULE_PRIORITY_CONTROLS,
  FIELD_RULE_SEARCH_HINT_CONTROLS,
  FIELD_RULE_SCHEMA,
  FIELD_RULE_STUDIO_TIPS,
} from '../fieldRuleSchema.js';

test('FIELD_RULE_SCHEMA is a frozen non-empty registry', () => {
  assert.ok(Array.isArray(FIELD_RULE_SCHEMA), 'schema must be an array');
  assert.ok(FIELD_RULE_SCHEMA.length >= 20, `expected >=20 entries, got ${FIELD_RULE_SCHEMA.length}`);
  assert.ok(Object.isFrozen(FIELD_RULE_SCHEMA), 'schema array must be frozen');
});

test('FIELD_RULE_SCHEMA entries have required authoring metadata', () => {
  for (const entry of FIELD_RULE_SCHEMA) {
    assert.equal(typeof entry.path, 'string', `${entry.path}: path must be a string`);
    assert.ok(entry.path.length > 0, 'path must be non-empty');
    assert.equal(typeof entry.label, 'string', `${entry.path}: label must be a string`);
    assert.ok(entry.label.length > 0, `${entry.path}: label must be non-empty`);
    assert.ok(FIELD_RULE_KINDS.has(entry.kind), `${entry.path}: unknown kind ${entry.kind}`);
    assert.equal(typeof entry.doc, 'string', `${entry.path}: doc must be a string`);
    assert.ok(entry.doc.length > 0, `${entry.path}: doc must be non-empty`);
  }
});

test('FIELD_RULE_SCHEMA has no duplicate paths', () => {
  const paths = FIELD_RULE_SCHEMA.map((entry) => entry.path);
  const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);

  assert.deepEqual(duplicates, []);
});

test('FIELD_RULE_SCHEMA preserves critical AI assist paths for downstream migration', () => {
  const paths = new Set(FIELD_RULE_SCHEMA.map((entry) => entry.path));

  assert.ok(paths.has('ai_assist.reasoning_note'));
  assert.ok(paths.has('ai_assist.variant_inventory_usage.enabled'));
  assert.ok(paths.has('ai_assist.pif_priority_images.enabled'));
});

test('FIELD_RULE_STUDIO_TIPS derives from unique schema tooltip metadata', () => {
  const entries = FIELD_RULE_SCHEMA.filter((entry) => entry.studioTipKey || entry.studioTip);
  const keys = entries.map((entry) => entry.studioTipKey);

  assert.equal(entries.length, 24);
  assert.equal(new Set(keys).size, keys.length);

  for (const entry of entries) {
    assert.equal(typeof entry.studioTipKey, 'string', `${entry.path}: studioTipKey`);
    assert.ok(entry.studioTipKey.length > 0, `${entry.path}: studioTipKey is non-empty`);
    assert.equal(typeof entry.studioTip, 'string', `${entry.path}: studioTip`);
    assert.ok(entry.studioTip.trim().length > 0, `${entry.path}: studioTip is non-empty`);
    assert.equal(FIELD_RULE_STUDIO_TIPS[entry.studioTipKey], entry.studioTip);
  }
});

test('FIELD_RULE_AI_ASSIST_TOGGLE_CONTROLS derives toggle UI metadata from schema entries', () => {
  assert.deepEqual(FIELD_RULE_AI_ASSIST_TOGGLE_CONTROLS, [
    {
      path: 'ai_assist.variant_inventory_usage',
      label: 'Variant Inventory Context',
      ariaLabel: 'Use variant inventory context',
      tooltipKey: 'variant_inventory_usage',
    },
    {
      path: 'ai_assist.pif_priority_images',
      label: 'PIF Priority Images',
      ariaLabel: 'Use PIF priority images',
      tooltipKey: 'pif_priority_images',
    },
  ]);
});

test('FIELD_RULE_PRIORITY_CONTROLS derives priority UI metadata from schema entries', () => {
  assert.deepEqual(FIELD_RULE_PRIORITY_CONTROLS, [
    {
      path: 'priority.required_level',
      label: 'Required Level',
      legacyPath: 'required_level',
      fallback: 'non_mandatory',
      tooltipKey: 'required_level',
      options: ['mandatory', 'non_mandatory'],
    },
    {
      path: 'priority.availability',
      label: 'Availability',
      legacyPath: 'availability',
      fallback: 'sometimes',
      tooltipKey: 'availability',
      options: ['always', 'sometimes', 'rare'],
    },
    {
      path: 'priority.difficulty',
      label: 'Difficulty',
      legacyPath: 'difficulty',
      fallback: 'easy',
      tooltipKey: 'difficulty',
      options: ['very_hard', 'hard', 'medium', 'easy'],
    },
  ]);
});

test('FIELD_RULE_EVIDENCE_CONTROLS derives evidence UI metadata from schema entries', () => {
  assert.deepEqual(FIELD_RULE_EVIDENCE_CONTROLS, [
    {
      path: 'evidence.min_evidence_refs',
      label: 'Min Evidence Refs',
      tooltipKey: 'min_evidence_refs',
      widget: 'number_stepper',
      legacyPath: 'min_evidence_refs',
      ariaLabel: 'min evidence refs',
      defaultValue: undefined,
      options: undefined,
    },
    {
      path: 'evidence.tier_preference',
      label: 'Tier Preference',
      tooltipKey: 'tier_preference',
      widget: 'tier_picker',
      legacyPath: undefined,
      ariaLabel: undefined,
      defaultValue: ['tier1', 'tier2', 'tier3'],
      options: ['tier1', 'tier2', 'tier3'],
    },
  ]);
});

test('FIELD_RULE_SEARCH_HINT_CONTROLS derives tag picker metadata from schema entries', () => {
  assert.deepEqual(FIELD_RULE_SEARCH_HINT_CONTROLS, [
    {
      path: 'aliases',
      label: 'Aliases',
      tooltipKey: 'aliases',
      placeholder: 'source phrases and alternate field names',
      suggestionsKey: undefined,
    },
    {
      path: 'search_hints.domain_hints',
      label: 'Domain Hints',
      tooltipKey: 'domain_hints',
      placeholder: 'manufacturer, rtings.com...',
      suggestionsKey: 'domain_hints',
    },
    {
      path: 'search_hints.content_types',
      label: 'Content Types',
      tooltipKey: 'content_types',
      placeholder: 'spec_sheet, datasheet...',
      suggestionsKey: 'content_types',
    },
    {
      path: 'search_hints.query_terms',
      label: 'Query Terms',
      tooltipKey: 'query_terms',
      placeholder: 'alternative search terms',
      suggestionsKey: undefined,
    },
  ]);
});

test('FIELD_RULE_CONSTRAINT_CONTROL derives constraint editor metadata from schema entries', () => {
  assert.deepEqual(FIELD_RULE_CONSTRAINT_CONTROL, {
    path: 'constraints',
    label: 'Cross-field constraints',
  });
});

test('FIELD_RULE_COMPONENT_TYPE_CONTROL derives component select metadata from schema entries', () => {
  assert.deepEqual(FIELD_RULE_COMPONENT_TYPE_CONTROL, {
    path: 'component.type',
    label: 'Component DB',
    tooltipKey: 'component_db',
  });
});

test('FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS derives dependency toggle metadata from schema entries', () => {
  assert.deepEqual(FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS.map((control) => control.path), [
    'variant_dependent',
    'product_image_dependent',
  ]);
  assert.deepEqual(
    FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS.map((control) => ({
      label: control.label,
      trueAriaLabel: control.trueAriaLabel,
      falseAriaLabel: control.falseAriaLabel,
    })),
    [
      {
        label: 'Variant Dependent',
        trueAriaLabel: 'Per-variant (on)',
        falseAriaLabel: 'Per-product (off)',
      },
      {
        label: 'Product Image Dependent',
        trueAriaLabel: 'Product image dependent (on)',
        falseAriaLabel: 'Product image dependent (off)',
      },
    ],
  );
});

test('FIELD_RULE_CONTRACT_CONTROLS derives contract editor metadata from schema entries', () => {
  const byPath = Object.fromEntries(
    FIELD_RULE_CONTRACT_CONTROLS.map((control) => [control.path, control]),
  );

  assert.deepEqual(Object.keys(byPath), [
    'contract.type',
    'contract.shape',
    'contract.unit',
    'contract.rounding.decimals',
    'contract.rounding.mode',
    'contract.list_rules.dedupe',
    'contract.list_rules.sort',
    'contract.list_rules.item_union',
    'contract.range.min',
    'contract.range.max',
  ]);
  assert.deepEqual(byPath['contract.type'].options, [
    'string', 'number', 'integer', 'boolean', 'date', 'url', 'range', 'mixed_number_range',
  ]);
  assert.deepEqual(byPath['contract.shape'].options, ['scalar', 'list']);
  assert.deepEqual(byPath['contract.list_rules.item_union'].options, ['', 'set_union', 'ordered_union']);
  assert.deepEqual(byPath['contract.list_rules.item_union'].optionLabels, ['winner_only', 'set_union', 'ordered_union']);
  assert.deepEqual(byPath['contract.rounding.mode'].options, ['nearest', 'floor', 'ceil']);
});

test('FIELD_RULE_ENUM_CONTROLS derives enum editor metadata from schema entries', () => {
  const byPath = Object.fromEntries(
    FIELD_RULE_ENUM_CONTROLS.map((control) => [control.path, control]),
  );

  assert.deepEqual(Object.keys(byPath), [
    'enum.policy',
    'enum.source',
    'enum.match.format_hint',
  ]);
  assert.deepEqual(byPath['enum.policy'].options, ['open', 'closed', 'open_prefer_known']);
  assert.equal(byPath['enum.source'].widget, 'enum_source_select');
  assert.equal(byPath['enum.match.format_hint'].widget, 'format_pattern_input');
});

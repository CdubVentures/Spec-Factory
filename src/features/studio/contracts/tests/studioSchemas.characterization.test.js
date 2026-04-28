import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELD_RULE_SCHEMA } from '../../../../field-rules/fieldRuleSchema.js';
import {
  PriorityProfileSchema,
  AiAssistConfigSchema,
  FieldRuleSchema,
  EnumEntrySchema,
  ComponentSourceSchema,
  DataListEntrySchema,
  StudioConfigSchema,
} from '../studioSchemas.js';

const schemaCases = [
  {
    label: 'PriorityProfileSchema',
    schema: PriorityProfileSchema,
    valid: {
      required_level: 'mandatory',
      availability: 'rare',
      difficulty: 'very_hard',
    },
    invalid: { required_level: 'required' },
  },
  {
    label: 'AiAssistConfigSchema',
    schema: AiAssistConfigSchema,
    valid: {
      reasoning_note: 'Use explicit source identity only.',
      color_edition_context: { enabled: true },
      pif_priority_images: { enabled: false },
    },
    invalid: { color_edition_context: true },
  },
  {
    label: 'FieldRuleSchema',
    schema: FieldRuleSchema,
    valid: {
      key: 'connection',
      contract: { type: 'string', shape: 'list', custom_passthrough: true },
      constraints: ['requires connection != none'],
      ui: { label: 'Connection', custom_passthrough: true },
      custom_passthrough: true,
    },
    invalid: { constraints: 'requires connection != none' },
  },
  {
    label: 'EnumEntrySchema',
    schema: EnumEntrySchema,
    valid: {
      field: 'connection',
      values: ['wired', 'wireless'],
      priority: { availability: 'sometimes' },
      ai_assist: { reasoning_note: '' },
      custom_passthrough: true,
    },
    invalid: { values: ['wired'] },
  },
  {
    label: 'ComponentSourceSchema',
    schema: ComponentSourceSchema,
    valid: {
      component_type: 'sensor',
      roles: {
        properties: [
          {
            field_key: 'dpi',
            variance_policy: 'range',
            tolerance: 2,
            constraints: ['dpi > 0'],
            component_only: false,
          },
        ],
      },
      priority: { difficulty: 'hard' },
      custom_passthrough: true,
    },
    invalid: { roles: { properties: [{ variance_policy: 'numeric' }] } },
  },
  {
    label: 'DataListEntrySchema',
    schema: DataListEntrySchema,
    valid: {
      field: 'connection',
      mode: 'sheet',
      sheet: 'Enums',
      value_column: 'D',
      manual_values: ['wired'],
      ai_assist: { pif_priority_images: { enabled: true } },
      custom_passthrough: true,
    },
    invalid: { mode: 'sheet' },
  },
  {
    label: 'StudioConfigSchema',
    schema: StudioConfigSchema,
    valid: {
      version: 1,
      tooltip_source: { path: 'tooltips.json', custom_passthrough: true },
      component_sources: [],
      enum_lists: [],
      data_lists: [],
      selected_keys: ['connection'],
      field_overrides: { connection: { contract: { type: 'string' } } },
      field_groups: ['Core'],
      identity: { min_identifiers: 2 },
      custom_passthrough: true,
    },
    invalid: { version: '1' },
  },
];

for (const { label, schema, valid, invalid } of schemaCases) {
  test(`${label} accepts the characterized minimal valid shape`, () => {
    const result = schema.safeParse(valid);
    assert.equal(result.success, true, JSON.stringify(result.error?.issues || []));
  });

  test(`${label} rejects the characterized invalid shape`, () => {
    const result = schema.safeParse(invalid);
    assert.equal(result.success, false);
  });
}

function unwrapZod(schema) {
  const name = schema?.constructor?.name;
  if (name === 'ZodOptional' || name === 'ZodNullable') {
    return unwrapZod(schema._def.innerType);
  }
  return schema;
}

test('FieldRuleSchema preserves the characterized explicit key surface', () => {
  assert.deepEqual(Object.keys(FieldRuleSchema.shape).sort(), [
    'constraints',
    'contract',
    'group',
    'key',
    'label',
    'parse',
    'required_level',
    'ui',
  ]);

  assert.deepEqual(Object.keys(unwrapZod(FieldRuleSchema.shape.contract).shape).sort(), [
    'shape',
    'type',
    'unit',
  ]);

  assert.deepEqual(Object.keys(unwrapZod(FieldRuleSchema.shape.ui).shape).sort(), [
    'aliases',
    'group',
    'label',
    'order',
  ]);
});

test('AiAssistConfigSchema rejects direct booleans on toggle keys', () => {
  assert.equal(
    AiAssistConfigSchema.safeParse({
      pif_priority_images: false,
    }).success,
    false,
  );
  assert.equal(
    AiAssistConfigSchema.safeParse({
      color_edition_context: true,
    }).success,
    false,
  );
});

test('PriorityProfileSchema key surface is derived from field-rule schema priority entries', () => {
  const expectedKeys = FIELD_RULE_SCHEMA
    .filter((entry) => entry.path.startsWith('priority.') && Array.isArray(entry.options))
    .map((entry) => entry.path.replace('priority.', ''))
    .sort();

  assert.deepEqual(Object.keys(PriorityProfileSchema.shape).sort(), expectedKeys);
});

test('AiAssistConfigSchema key surface is derived from field-rule schema ai_assist entries', () => {
  const expectedKeys = FIELD_RULE_SCHEMA
    .filter((entry) => entry.path.startsWith('ai_assist.'))
    .map((entry) => entry.path.replace('ai_assist.', '').replace(/\.enabled$/, ''))
    .sort();

  assert.deepEqual(Object.keys(AiAssistConfigSchema.shape).sort(), expectedKeys);
});

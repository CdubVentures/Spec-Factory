import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  FIELD_STUDIO_PATCH_SCHEMA_VERSION,
  applyFieldStudioPatchDocument,
  applyFieldStudioPatchDocuments,
  expectedFieldStudioPatchFileName,
  importFieldStudioPatchDirectory,
  importFieldStudioPatchDocuments,
  loadFieldStudioPatchDocuments,
  parseFieldStudioPatchPayloadFiles,
  previewFieldStudioPatchDocuments,
  validateFieldStudioPatchDocument,
} from '../fieldStudioPatch.js';

function validPatch(overrides = {}) {
  return {
    schema_version: FIELD_STUDIO_PATCH_SCHEMA_VERSION,
    category: 'mouse',
    field_key: 'design',
    navigator_ordinal: 7,
    verdict: 'minor_revise',
    patch: {
      data_lists: [
        {
          field: 'design',
          manual_values: ['standard', 'limited edition', 'collaboration', 'multiple'],
        },
      ],
      field_overrides: {
        design: {
          enum: { policy: 'closed', source: 'data_lists.design' },
          ai_assist: {
            pif_priority_images: { enabled: true },
            reasoning_note: 'Classify public edition taxonomy only.',
          },
        },
      },
    },
    audit: {
      sources_checked: ['https://example.test/source'],
      products_checked: ['Example Mouse'],
      conclusion: 'Evidence supports a closed edition taxonomy.',
    },
    ...overrides,
  };
}

function baseMap() {
  return {
    version: 2,
    selected_keys: ['design', 'weight'],
    data_lists: [
      {
        field: 'design',
        mode: 'scratch',
        normalize: 'lower_trim',
        manual_values: ['standard', 'limited'],
      },
    ],
    field_overrides: {
      design: {
        field_key: 'design',
        enum: { policy: 'open_prefer_known', source: 'data_lists.design' },
        ai_assist: {
          reasoning_note: 'old field note',
          color_edition_context: { enabled: true },
        },
        search_hints: { query_terms: ['design'], domain_hints: [] },
      },
      weight: {
        field_key: 'weight',
        contract: { type: 'number', shape: 'scalar', unit: 'g' },
      },
    },
  };
}

test('expectedFieldStudioPatchFileName keeps category, order, key, and schema version in the file name', () => {
  assert.equal(
    expectedFieldStudioPatchFileName({ category: 'mouse', fieldKey: 'design', navigatorOrdinal: 7 }),
    'mouse-07-design.field-studio-patch.v1.json',
  );
  assert.equal(
    expectedFieldStudioPatchFileName({ category: 'mouse', fieldKey: 'design' }),
    'mouse-design.field-studio-patch.v1.json',
  );
});

test('validateFieldStudioPatchDocument accepts the strict import envelope and matching filename', () => {
  const parsed = validateFieldStudioPatchDocument(validPatch(), {
    category: 'mouse',
    fileName: 'mouse-07-design.field-studio-patch.v1.json',
  });

  assert.equal(parsed.schema_version, FIELD_STUDIO_PATCH_SCHEMA_VERSION);
  assert.equal(parsed.category, 'mouse');
  assert.equal(parsed.field_key, 'design');
  assert.equal(parsed.navigator_ordinal, 7);
});

test('validateFieldStudioPatchDocument accepts structured audit roster decisions', () => {
  const parsed = validateFieldStudioPatchDocument(validPatch({
    audit: {
      sources_checked: ['https://example.test/source'],
      products_checked: ['Example Mouse'],
      conclusion: 'Sensor setup needs semantic roster decisions.',
      adjacent_key_roster_decisions: [
        {
          field_key: 'sensor_date',
          decision: 'component_property',
          component_type: 'sensor',
          expected_type: 'date',
          reason: 'Invariant date of the sensor component.',
        },
      ],
      schema_blocked_component_attributes: [
        {
          field_key: 'native_profiles',
          component_type: 'sensor',
          expected_type: 'string',
          expected_shape: 'list',
          reason: 'Semantic component-owned list, but patch schema has no property shape key.',
        },
      ],
      open_questions: [],
    },
  }), {
    category: 'mouse',
    fileName: 'mouse-07-design.field-studio-patch.v1.json',
  });

  assert.equal(parsed.audit.adjacent_key_roster_decisions[0].field_key, 'sensor_date');
  assert.equal(parsed.audit.schema_blocked_component_attributes[0].expected_shape, 'list');
});

test('validateFieldStudioPatchDocument accepts OS duplicate suffixes on matching filenames', () => {
  const parsed = validateFieldStudioPatchDocument(validPatch({
    field_key: 'sensor',
    navigator_ordinal: 35,
    patch: {
      field_overrides: {
        sensor: {
          enum: { policy: 'open_prefer_known', source: 'component_db.sensor' },
        },
      },
      component_sources: [
        {
          component_type: 'sensor',
          roles: { properties: [] },
        },
      ],
    },
  }), {
    category: 'mouse',
    fileName: 'mouse-35-sensor.field-studio-patch.v1 (1).json',
  });

  assert.equal(parsed.field_key, 'sensor');
  assert.equal(parsed.navigator_ordinal, 35);
});

test('validateFieldStudioPatchDocument rejects prose sentinels and filename/body mismatches', () => {
  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      patch: { field_overrides: { design: { ai_assist: { reasoning_note: 'No change' } } } },
    }), { category: 'mouse' }),
    /No change/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch(), {
      category: 'mouse',
      fileName: 'mouse-08-lighting.field-studio-patch.v1.json',
    }),
    /filename.*field_key/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      patch: { field_overrides: { lighting: { enum: { policy: 'closed' } } } },
    }), { category: 'mouse', fileName: 'mouse-07-design.field-studio-patch.v1.json' }),
    /only patch field_overrides\.design/i,
  );
});

test('validateFieldStudioPatchDocument rejects retired data-list mode', () => {
  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      patch: {
        data_lists: [
          {
            field: 'design',
            normalize: 'lower_trim',
            manual_values: ['standard'],
          },
        ],
      },
    }), { category: 'mouse', fileName: 'mouse-07-design.field-studio-patch.v1.json' }),
    /data_lists\[0\]\.normalize is retired/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      patch: {
        data_lists: [
          {
            field: 'design',
            mode: 'manual',
            manual_values: ['standard'],
          },
        ],
      },
    }), { category: 'mouse', fileName: 'mouse-07-design.field-studio-patch.v1.json' }),
    /data_lists\[0\]\.mode is retired/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      patch: {
        data_lists: [
          {
            field: 'design',
            manual_values: ['standard'],
            priority: { difficulty: 'hard' },
          },
        ],
      },
    }), { category: 'mouse', fileName: 'mouse-07-design.field-studio-patch.v1.json' }),
    /data_lists\[0\]\.priority is retired/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      patch: {
        data_lists: [
          {
            field: 'design',
            manual_values: ['standard'],
            ai_assist: { reasoning_note: 'list guidance' },
          },
        ],
      },
    }), { category: 'mouse', fileName: 'mouse-07-design.field-studio-patch.v1.json' }),
    /data_lists\[0\]\.ai_assist is retired/i,
  );
});

test('applyFieldStudioPatchDocument deep-merges one key and data list without touching unrelated settings', () => {
  const next = applyFieldStudioPatchDocument(baseMap(), validPatch());

  assert.deepEqual(next.data_lists[0].manual_values, [
    'standard',
    'limited edition',
    'collaboration',
    'multiple',
  ]);
  assert.equal(next.data_lists[0].mode, 'scratch', 'existing data list metadata is preserved');
  assert.equal(Object.hasOwn(next.data_lists[0], 'normalize'), false);
  assert.equal(next.field_overrides.design.enum.policy, 'closed');
  assert.equal(next.field_overrides.design.ai_assist.reasoning_note, 'Classify public edition taxonomy only.');
  assert.deepEqual(next.field_overrides.design.ai_assist.pif_priority_images, { enabled: true });
  assert.deepEqual(next.field_overrides.design.ai_assist.color_edition_context, { enabled: true });
  assert.equal(next.field_overrides.weight.contract.unit, 'g');
});

test('previewFieldStudioPatchDocuments rejects field enum links without matching data list rows', () => {
  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: baseMap(),
    patchDocs: [
      validPatch({
        patch: {
          field_overrides: {
            design: {
              enum: { policy: 'closed', source: 'data_lists.missing_design' },
            },
          },
        },
      }),
    ],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, false);
  assert.match(preview.errors.join('\n'), /data_lists\.missing_design/i);
});

test('previewFieldStudioPatchDocuments rejects component_db links without a matching component source', () => {
  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: baseMap(),
    patchDocs: [
      validPatch({
        patch: {
          field_overrides: {
            design: {
              enum: { policy: 'open_prefer_known', source: 'component_db.sensor' },
            },
          },
        },
      }),
    ],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, false);
  assert.match(preview.errors.join('\n'), /component_db\.sensor/i);
  assert.match(preview.errors.join('\n'), /self-lock/i);
});

test('previewFieldStudioPatchDocuments rejects component identity aliases under field_overrides', () => {
  const sensorPatch = validPatch({
    field_key: 'sensor',
    navigator_ordinal: 35,
    verdict: 'schema_decision',
    patch: {
      field_overrides: {
        sensor: {
          enum: { policy: 'closed', source: 'component_db.sensor' },
          aliases: ['Razer Focus Pro 35K Optical Sensor Gen-2'],
        },
      },
      component_sources: [
        {
          component_type: 'sensor',
          roles: { properties: [] },
        },
      ],
    },
  });

  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: {
      ...baseMap(),
      selected_keys: ['design', 'weight', 'sensor'],
      field_overrides: {
        ...baseMap().field_overrides,
        sensor: {
          field_key: 'sensor',
          enum: { policy: 'open_prefer_known', source: 'component_db.sensor' },
        },
      },
      component_sources: [
        {
          component_type: 'sensor',
          roles: { properties: [] },
        },
      ],
    },
    patchDocs: [sensorPatch],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, false);
  assert.match(preview.errors.join('\n'), /field_overrides\.sensor\.aliases/i);
  assert.match(preview.errors.join('\n'), /blank\/absent/i);
  assert.doesNotMatch(preview.errors.join('\n'), /Component Review/i);
});

test('previewFieldStudioPatchDocuments rejects auto component facet aliases under field_overrides', () => {
  const sensorBrandPatch = validPatch({
    field_key: 'sensor_brand',
    navigator_ordinal: 36,
    verdict: 'schema_decision',
    patch: {
      field_overrides: {
        sensor_brand: {
          aliases: ['PixArt', 'PAW'],
        },
      },
    },
  });

  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: {
      ...baseMap(),
      selected_keys: ['design', 'weight', 'sensor', 'sensor_brand'],
      field_overrides: {
        ...baseMap().field_overrides,
        sensor: {
          field_key: 'sensor',
          enum: { policy: 'open_prefer_known', source: 'component_db.sensor' },
        },
        sensor_brand: {
          field_key: 'sensor_brand',
          component_identity_projection: { component_type: 'sensor', facet: 'brand' },
        },
      },
      component_sources: [
        {
          component_type: 'sensor',
          roles: { properties: [] },
        },
      ],
    },
    patchDocs: [sensorBrandPatch],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, false);
  assert.match(preview.errors.join('\n'), /field_overrides\.sensor_brand\.aliases/i);
  assert.match(preview.errors.join('\n'), /blank\/absent/i);
  assert.doesNotMatch(preview.errors.join('\n'), /Component Review/i);
});

test('previewFieldStudioPatchDocuments allows clearing component identity field aliases', () => {
  const sensorPatch = validPatch({
    field_key: 'sensor',
    navigator_ordinal: 35,
    verdict: 'schema_decision',
    patch: {
      field_overrides: {
        sensor: {
          enum: { policy: 'closed', source: 'component_db.sensor' },
          aliases: null,
        },
      },
      component_sources: [
        {
          component_type: 'sensor',
          roles: {
            properties: [
              {
                field_key: 'sensor_type',
                type: 'string',
                variance_policy: 'authoritative',
              },
            ],
          },
        },
      ],
    },
  });

  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: {
      ...baseMap(),
      selected_keys: ['design', 'weight', 'sensor', 'sensor_type'],
      field_overrides: {
        ...baseMap().field_overrides,
        sensor: {
          field_key: 'sensor',
          aliases: ['optical sensor'],
          enum: { policy: 'open_prefer_known', source: 'component_db.sensor' },
        },
        sensor_type: {
          field_key: 'sensor_type',
          contract: { type: 'string', shape: 'scalar' },
        },
      },
      component_sources: [
        {
          component_type: 'sensor',
          roles: { properties: [] },
        },
      ],
    },
    patchDocs: [sensorPatch],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, true);
  assert.equal(preview.fieldStudioMap.field_overrides.sensor.aliases, null);
});

test('previewFieldStudioPatchDocuments rejects component source rows without parent self-lock', () => {
  const componentPatch = validPatch({
    field_key: 'switch_type',
    navigator_ordinal: 12,
    patch: {
      field_overrides: {
        switch_type: {
          contract: { type: 'string', shape: 'scalar' },
        },
      },
      component_sources: [
        {
          component_type: 'switch',
          roles: {
            properties: [
              {
                field_key: 'switch_type',
                type: 'string',
                variance_policy: 'authoritative',
              },
            ],
          },
        },
      ],
    },
  });

  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: {
      ...baseMap(),
      selected_keys: ['design', 'weight', 'switch_type'],
    },
    patchDocs: [componentPatch],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, false);
  assert.match(preview.errors.join('\n'), /component_sources\[switch\].*component_db\.switch/i);
});

test('previewFieldStudioPatchDocuments accepts linked component source rows when parent self-lock exists', () => {
  const componentPatch = validPatch({
    field_key: 'switch_type',
    navigator_ordinal: 12,
    patch: {
      field_overrides: {
        switch_type: {
          contract: { type: 'string', shape: 'scalar' },
        },
      },
      component_sources: [
        {
          component_type: 'switch',
          roles: {
            properties: [
              {
                field_key: 'switch_type',
                type: 'string',
                variance_policy: 'authoritative',
              },
            ],
          },
        },
      ],
    },
  });

  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: {
      ...baseMap(),
      selected_keys: ['design', 'weight', 'switch', 'switch_type'],
      field_overrides: {
        ...baseMap().field_overrides,
        switch: {
          field_key: 'switch',
          enum: { policy: 'open_prefer_known', source: 'component_db.switch' },
        },
      },
    },
    patchDocs: [componentPatch],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, true);
  assert.ok(preview.changes.some((change) => change.kind === 'component_source' && change.componentType === 'switch'));
});

test('previewFieldStudioPatchDocuments accepts existing component parent lock hints', () => {
  const componentPatch = validPatch({
    field_key: 'switch_type',
    navigator_ordinal: 12,
    patch: {
      field_overrides: {
        switch_type: {
          contract: { type: 'string', shape: 'scalar' },
        },
      },
      component_sources: [
        {
          component_type: 'switch',
          roles: {
            properties: [
              {
                field_key: 'switch_type',
                type: 'string',
                variance_policy: 'authoritative',
              },
            ],
          },
        },
      ],
    },
  });

  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: {
      ...baseMap(),
      selected_keys: ['design', 'weight', 'switch', 'switch_type'],
      field_overrides: {
        ...baseMap().field_overrides,
        switch: {
          field_key: 'switch',
          field_studio_hints: { component_db: 'switch' },
          parse: { component_type: 'switch' },
        },
      },
    },
    patchDocs: [componentPatch],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, true);
});

test('previewFieldStudioPatchDocuments accepts legacy component hints even when enum.source is still data_lists', () => {
  const componentPatch = validPatch({
    field_key: 'switch_type',
    navigator_ordinal: 12,
    patch: {
      field_overrides: {
        switch_type: {
          contract: { type: 'string', shape: 'scalar' },
        },
      },
      component_sources: [
        {
          component_type: 'switch',
          roles: {
            properties: [
              {
                field_key: 'switch_type',
                type: 'string',
                variance_policy: 'authoritative',
              },
            ],
          },
        },
      ],
    },
  });

  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: {
      ...baseMap(),
      selected_keys: ['design', 'weight', 'switch', 'switch_type'],
      data_lists: [
        ...baseMap().data_lists,
        { field: 'switch', manual_values: ['Optical Switches'] },
      ],
      field_overrides: {
        ...baseMap().field_overrides,
        switch: {
          field_key: 'switch',
          enum: { policy: 'open_prefer_known', source: 'data_lists.switch' },
          component: { type: 'switch', source: 'component_db.switch' },
          field_studio_hints: { component_db: 'switch' },
          parse: { component_type: 'switch' },
        },
      },
    },
    patchDocs: [componentPatch],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, true);
});

test('previewFieldStudioPatchDocuments does not treat stale field_studio_hints alone as component identity', () => {
  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: {
      ...baseMap(),
      selected_keys: ['design', 'weight', 'material'],
      data_lists: [
        ...baseMap().data_lists,
        { field: 'material', manual_values: ['plastic'] },
      ],
      field_overrides: {
        ...baseMap().field_overrides,
        material: {
          field_key: 'material',
          contract: { type: 'string', shape: 'list' },
          enum: { policy: 'open_prefer_known', source: 'data_lists.material' },
          field_studio_hints: { component_db: 'material' },
        },
      },
    },
    patchDocs: [validPatch()],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, true);
});

test('importFieldStudioPatchDocuments lets parent component patches replace the full attribute list', () => {
  const parentPatch = validPatch({
    field_key: 'sensor',
    navigator_ordinal: 40,
    patch: {
      field_overrides: {
        sensor: {
          contract: { type: 'string', shape: 'scalar' },
          enum: { policy: 'open_prefer_known', source: 'component_db.sensor' },
        },
      },
      component_sources: [
        {
          component_type: 'sensor',
          roles: {
            properties: [
              {
                field_key: 'sensor_type',
                type: 'string',
                variance_policy: 'authoritative',
              },
              {
                field_key: 'dpi',
                type: 'number',
                unit: 'dpi',
                variance_policy: 'upper_bound',
                tolerance: 5,
              },
              {
                field_key: 'sensor_native_resolution_steps',
                type: 'integer',
                variance_policy: 'authoritative',
                component_only: true,
              },
            ],
          },
        },
      ],
    },
  });

  const result = importFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: {
      ...baseMap(),
      selected_keys: ['design', 'weight', 'sensor', 'sensor_type', 'dpi'],
      field_overrides: {
        ...baseMap().field_overrides,
        sensor: {
          field_key: 'sensor',
          enum: { policy: 'open_prefer_known', source: 'data_lists.sensor' },
        },
        sensor_type: {
          field_key: 'sensor_type',
          contract: { type: 'string', shape: 'scalar' },
        },
        dpi: {
          field_key: 'dpi',
          contract: { type: 'number', shape: 'scalar', unit: 'dpi' },
        },
      },
      component_sources: [
        {
          component_type: 'sensor',
          roles: {
            properties: [
              {
                field_key: 'dpi',
                type: 'number',
                unit: 'dpi',
                variance_policy: 'upper_bound',
              },
              {
                field_key: 'stale_sensor_attribute',
                type: 'string',
                variance_policy: 'authoritative',
                component_only: true,
              },
            ],
          },
        },
      ],
    },
    patchDocs: [parentPatch],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  const properties = result.fieldStudioMap.component_sources[0].roles.properties;
  assert.deepEqual(properties.map((prop) => prop.field_key), [
    'sensor_type',
    'dpi',
    'sensor_native_resolution_steps',
  ]);
  assert.equal(properties[1].tolerance, 5);
  assert.equal(properties[2].component_only, true);
  assert.equal(result.fieldStudioMap.field_overrides.sensor.enum.source, 'component_db.sensor');
});

test('previewFieldStudioPatchDocuments rejects auto component identity facets as component properties', () => {
  const parentPatch = validPatch({
    field_key: 'sensor',
    navigator_ordinal: 40,
    patch: {
      field_overrides: {
        sensor: {
          contract: { type: 'string', shape: 'scalar' },
          enum: { policy: 'open_prefer_known', source: 'component_db.sensor' },
        },
      },
      component_sources: [
        {
          component_type: 'sensor',
          roles: {
            properties: [
              {
                field_key: 'sensor_brand',
                type: 'string',
                variance_policy: 'authoritative',
              },
              {
                field_key: 'sensor_link',
                type: 'url',
                variance_policy: 'authoritative',
              },
            ],
          },
        },
      ],
    },
  });

  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: {
      ...baseMap(),
      selected_keys: ['design', 'weight', 'sensor'],
      field_overrides: {
        ...baseMap().field_overrides,
        sensor: {
          field_key: 'sensor',
          enum: { policy: 'open_prefer_known', source: 'component_db.sensor' },
        },
      },
      component_sources: [
        {
          component_type: 'sensor',
          roles: { properties: [] },
        },
      ],
    },
    patchDocs: [parentPatch],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: [],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, false);
  assert.match(preview.errors.join('\n'), /sensor_brand.*identity facet/i);
  assert.match(preview.errors.join('\n'), /sensor_link.*identity facet/i);
});

test('validateFieldStudioPatchDocument rejects retired component source workbook fields', () => {
  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      field_key: 'switch_type',
      patch: {
        component_sources: [
          {
            component_type: 'switch',
            sheet: 'switches',
            roles: {
              properties: [
                {
                  field_key: 'switch_type',
                  column: 'F',
                  type: 'string',
                  variance_policy: 'authoritative',
                },
              ],
            },
          },
        ],
      },
    }), { category: 'mouse' }),
    /component_sources\[0\]\.sheet is retired/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      field_key: 'switch_type',
      patch: {
        component_sources: [
          {
            component_type: 'switch',
            priority: { difficulty: 'hard' },
            roles: {
              properties: [
                {
                  field_key: 'switch_type',
                  type: 'string',
                  variance_policy: 'authoritative',
                },
              ],
            },
          },
        ],
      },
    }), { category: 'mouse' }),
    /component_sources\[0\]\.priority is retired/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      field_key: 'switch_type',
      patch: {
        component_sources: [
          {
            component_type: 'switch',
            ai_assist: { reasoning_note: 'component guidance' },
            roles: {
              properties: [
                {
                  field_key: 'switch_type',
                  type: 'string',
                  variance_policy: 'authoritative',
                },
              ],
            },
          },
        ],
      },
    }), { category: 'mouse' }),
    /component_sources\[0\]\.ai_assist is retired/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      field_key: 'switch_type',
      patch: {
        component_sources: [
          {
            component_type: 'switch',
            source_notes: 'do not allow extra source-level fields',
            roles: {
              properties: [
                {
                  field_key: 'switch_type',
                  type: 'string',
                  variance_policy: 'authoritative',
                },
              ],
            },
          },
        ],
      },
    }), { category: 'mouse' }),
    /component_sources\[0\]\.source_notes is not allowed/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      field_key: 'switch_type',
      patch: {
        component_sources: [
          {
            component_type: 'switch',
            roles: {
              notes: 'do not allow role metadata',
              properties: [
                {
                  field_key: 'switch_type',
                  type: 'string',
                  variance_policy: 'authoritative',
                },
              ],
            },
          },
        ],
      },
    }), { category: 'mouse' }),
    /component_sources\[0\]\.roles\.notes is not allowed/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      field_key: 'switch_type',
      patch: {
        component_sources: [
          {
            component_type: 'switch',
            roles: {
              properties: [
                {
                  field_key: 'switch_type',
                  type: 'string',
                  variance_policy: 'authoritative',
                  source_notes: 'do not allow property metadata',
                },
              ],
            },
          },
        ],
      },
    }), { category: 'mouse' }),
    /component_sources\[0\]\.roles\.properties\[0\]\.source_notes is not allowed/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      field_key: 'switch',
      patch: {
        component_sources: [
          {
            component_type: 'switch',
            roles: {
              properties: [
                {
                  field_key: 'switch_type',
                  type: 'string',
                  variance_policy: 'authoritative',
                  source_notes: 'identity owner rows still use strict property shape',
                },
              ],
            },
          },
        ],
      },
    }), { category: 'mouse' }),
    /component_sources\[0\]\.roles\.properties\[0\]\.source_notes is not allowed/i,
  );
});

test('loadFieldStudioPatchDocuments loads valid patch files from a folder in filename order', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'field-studio-patches-'));
  try {
    await fs.writeFile(
      path.join(dir, 'mouse-09-rgb.field-studio-patch.v1.json'),
      JSON.stringify(validPatch({ field_key: 'rgb', navigator_ordinal: 9, patch: { field_overrides: { rgb: { field_key: 'rgb' } } } })),
      'utf8',
    );
    await fs.writeFile(
      path.join(dir, 'mouse-10-weight.field-studio-patch.v1 (1).json'),
      JSON.stringify(validPatch({
        field_key: 'weight',
        navigator_ordinal: 10,
        patch: { field_overrides: { weight: { evidence: { min_evidence_refs: 2 } } } },
      })),
      'utf8',
    );
    await fs.writeFile(
      path.join(dir, 'mouse-07-design.field-studio-patch.v1.json'),
      JSON.stringify(validPatch()),
      'utf8',
    );
    await fs.writeFile(path.join(dir, 'notes.txt'), 'ignored', 'utf8');

    const docs = await loadFieldStudioPatchDocuments({ category: 'mouse', inputDir: dir });
    assert.deepEqual(docs.map((doc) => doc.field_key), ['design', 'rgb', 'weight']);
    assert.equal(docs[2].source_file, 'mouse-10-weight.field-studio-patch.v1 (1).json');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('importFieldStudioPatchDirectory applies a batch then validates the full resulting map', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'field-studio-import-'));
  try {
    await fs.writeFile(
      path.join(dir, 'mouse-07-design.field-studio-patch.v1.json'),
      JSON.stringify(validPatch()),
      'utf8',
    );

    const result = await importFieldStudioPatchDirectory({
      category: 'mouse',
      inputDir: dir,
      fieldStudioMap: baseMap(),
      validateFieldStudioMap: (map) => ({
        valid: map.field_overrides.design.enum.policy === 'closed',
        errors: [],
        normalized: map,
      }),
    });

    assert.equal(result.applied.length, 1);
    assert.equal(result.validation.valid, true);
    assert.equal(result.fieldStudioMap.field_overrides.design.enum.policy, 'closed');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('applyFieldStudioPatchDocuments applies multiple validated key files as one map update', () => {
  const docs = [
    validPatch(),
    validPatch({
      field_key: 'weight',
      navigator_ordinal: 24,
      patch: {
        field_overrides: {
          weight: {
            evidence: { min_evidence_refs: 2 },
          },
        },
      },
    }),
  ];

  const next = applyFieldStudioPatchDocuments(baseMap(), docs);
  assert.equal(next.field_overrides.design.enum.policy, 'closed');
  assert.equal(next.field_overrides.weight.evidence.min_evidence_refs, 2);
});

test('parseFieldStudioPatchPayloadFiles validates uploaded JSON files against category and filename', () => {
  const docs = parseFieldStudioPatchPayloadFiles({
    category: 'mouse',
    files: [
      {
        fileName: 'mouse-07-design.field-studio-patch.v1.json',
        content: JSON.stringify(validPatch()),
      },
    ],
  });

  assert.equal(docs.length, 1);
  assert.equal(docs[0].source_file, 'mouse-07-design.field-studio-patch.v1.json');
  assert.equal(docs[0].field_key, 'design');

  const duplicateNamedDocs = parseFieldStudioPatchPayloadFiles({
    category: 'mouse',
    files: [
      {
        fileName: 'mouse-07-design.field-studio-patch.v1 (1).json',
        content: JSON.stringify(validPatch()),
      },
      {
        fileName: 'mouse-09-weight.field-studio-patch.v1 (2).json',
        content: JSON.stringify(validPatch({
          field_key: 'weight',
          navigator_ordinal: 9,
          patch: {
            field_overrides: {
              weight: { evidence: { min_evidence_refs: 2 } },
            },
          },
        })),
      },
    ],
  });
  assert.deepEqual(
    duplicateNamedDocs.map((doc) => doc.source_file),
    [
      'mouse-07-design.field-studio-patch.v1 (1).json',
      'mouse-09-weight.field-studio-patch.v1 (2).json',
    ],
  );
  assert.deepEqual(duplicateNamedDocs.map((doc) => doc.field_key), ['design', 'weight']);

  assert.throws(
    () => parseFieldStudioPatchPayloadFiles({
      category: 'keyboard',
      files: [
        {
          fileName: 'mouse-07-design.field-studio-patch.v1.json',
          content: JSON.stringify(validPatch()),
        },
      ],
    }),
    /does not match requested category/i,
  );
});

test('previewFieldStudioPatchDocuments returns a change log for key edits and component additions', () => {
  const componentPatch = validPatch({
    field_key: 'switch_type',
    navigator_ordinal: 12,
    patch: {
      field_overrides: {
        switch_type: {
          component: { type: 'switch' },
        },
      },
      component_sources: [
        {
          component_type: 'switch',
          roles: {
            properties: [
              {
                field_key: 'switch_type',
                variance_policy: 'authoritative',
              },
            ],
          },
        },
      ],
    },
  });

  const preview = previewFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: {
      ...baseMap(),
      selected_keys: ['design', 'weight', 'switch', 'switch_type'],
      field_overrides: {
        ...baseMap().field_overrides,
        switch: {
          field_key: 'switch',
          enum: { policy: 'open_prefer_known', source: 'component_db.switch' },
        },
      },
    },
    patchDocs: [validPatch(), componentPatch],
    validateFieldStudioMap: (map) => ({
      valid: true,
      errors: [],
      warnings: ['normalized ok'],
      normalized: map,
    }),
  });

  assert.equal(preview.valid, true);
  assert.deepEqual(preview.files.map((file) => file.fieldKey), ['design', 'switch_type']);
  assert.ok(
    preview.changes.some((change) => (
      change.kind === 'field_override'
      && change.action === 'updated'
      && change.path === 'field_overrides.design.enum.policy'
      && change.before === 'open_prefer_known'
      && change.after === 'closed'
    )),
  );
  assert.ok(
    preview.changes.some((change) => (
      change.kind === 'component_source'
      && change.action === 'added'
      && change.componentType === 'switch'
    )),
  );
  assert.deepEqual(preview.validation.warnings, ['normalized ok']);
});

test('importFieldStudioPatchDocuments applies uploaded docs through full map validation', () => {
  const result = importFieldStudioPatchDocuments({
    category: 'mouse',
    fieldStudioMap: baseMap(),
    patchDocs: [validPatch()],
    validateFieldStudioMap: (map) => ({
      valid: map.field_overrides.design.enum.policy === 'closed',
      errors: [],
      normalized: {
        ...map,
        version: 3,
      },
    }),
  });

  assert.equal(result.applied.length, 1);
  assert.equal(result.fieldStudioMap.version, 3);
  assert.equal(result.changes.length > 0, true);
});

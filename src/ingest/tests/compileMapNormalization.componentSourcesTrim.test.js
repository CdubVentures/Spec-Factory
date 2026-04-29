import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeFieldStudioMap,
  validateFieldStudioMap,
} from '../compileMapNormalization.js';
import { buildComponentSourceSummary } from '../compileComponentHelpers.js';

test('normalizeFieldStudioMap strips workbook metadata from component_sources rows', () => {
  const normalized = normalizeFieldStudioMap({
    component_sources: [
      {
        type: 'sensor',
        component_type: 'sensor',
        mode: 'sheet',
        sheet: 'sensors',
        header_row: 1,
        first_data_row: 2,
        start_row: 2,
        row_end: 0,
        stop_after_blank_primary: 10,
        stop_after_blank_names: 10,
        auto_derive_aliases: true,
        primary_identifier_column: 'C',
        maker_column: 'B',
        canonical_name_column: 'C',
        name_column: 'C',
        brand_column: 'B',
        alias_columns: ['D'],
        link_columns: ['J'],
        property_columns: ['F'],
        roles: {
          primary_identifier: 'C',
          maker: 'B',
          aliases: ['D'],
          links: ['J'],
          properties: [
            {
              key: 'dpi',
              column: 'F',
              field_key: 'dpi',
              type: 'number',
              unit: 'dpi',
              variance_policy: 'upper_bound',
              tolerance: 5,
              constraints: ['dpi >= 100'],
              component_only: true,
            },
          ],
        },
        priority: {
          required_level: 'non_mandatory',
          availability: 'sometimes',
          difficulty: 'medium',
        },
        ai_assist: { reasoning_note: 'review sensors' },
      },
    ],
  });

  assert.deepEqual(normalized.component_sources, [
    {
      component_type: 'sensor',
      roles: {
        properties: [
          {
            field_key: 'dpi',
            type: 'number',
            unit: 'dpi',
            variance_policy: 'upper_bound',
            tolerance: 5,
            constraints: ['dpi >= 100'],
            component_only: true,
          },
        ],
      },
    },
  ]);
});

test('validateFieldStudioMap accepts trimmed component_sources and rejects only live component contracts', () => {
  const valid = validateFieldStudioMap({
    component_sources: [
      {
        component_type: 'sensor',
        roles: {
          properties: [
            { field_key: 'dpi', type: 'number', variance_policy: 'upper_bound' },
          ],
        },
      },
    ],
  });
  assert.equal(valid.valid, true, valid.errors.join('; '));

  const missingType = validateFieldStudioMap({
    component_sources: [{ roles: { properties: [] } }],
  });
  assert.equal(missingType.valid, false);
  assert.ok(missingType.errors.some((error) => error.includes('type is required')));

  const missingFieldKey = validateFieldStudioMap({
    component_sources: [
      { component_type: 'sensor', roles: { properties: [{ type: 'number' }] } },
    ],
  });
  assert.equal(missingFieldKey.valid, false);
  assert.ok(missingFieldKey.errors.some((error) => error.includes('property mapping missing key')));

  const badVariancePolicy = validateFieldStudioMap({
    component_sources: [
      {
        component_type: 'sensor',
        roles: {
          properties: [{ field_key: 'dpi', variance_policy: 'sometimes' }],
        },
      },
    ],
  });
  assert.equal(badVariancePolicy.valid, false);
  assert.ok(badVariancePolicy.errors.some((error) => error.includes('invalid variance_policy')));

  const identityFacetProperty = validateFieldStudioMap({
    component_sources: [
      {
        component_type: 'sensor',
        roles: {
          properties: [
            { field_key: 'sensor_brand', type: 'string', variance_policy: 'authoritative' },
            { field_key: 'sensor_link', type: 'url', variance_policy: 'authoritative' },
          ],
        },
      },
    ],
  });
  assert.equal(identityFacetProperty.valid, false);
  assert.ok(
    identityFacetProperty.errors.some((error) => error.includes('sensor_brand') && error.includes('identity facet')),
    identityFacetProperty.errors.join('; '),
  );
  assert.ok(
    identityFacetProperty.errors.some((error) => error.includes('sensor_link') && error.includes('identity facet')),
    identityFacetProperty.errors.join('; '),
  );
});

test('component_sources preserve semantic attribute types beyond string and number', () => {
  const warnings = [];
  const normalized = normalizeFieldStudioMap({
    component_sources: [
      {
        component_type: 'sensor',
        roles: {
          properties: [
            {
              field_key: 'sensor_date',
              type: 'date',
              variance_policy: 'authoritative',
              constraints: ['sensor_date <= release_date'],
            },
            {
              field_key: 'flawless_sensor',
              type: 'boolean',
              variance_policy: 'upper_bound',
            },
            {
              field_key: 'operating_range',
              type: 'range',
              unit: 'c',
              variance_policy: 'range',
              tolerance: 2,
            },
          ],
        },
      },
    ],
  }, { warnings });

  assert.deepEqual(normalized.component_sources[0].roles.properties, [
    {
      field_key: 'sensor_date',
      type: 'date',
      unit: '',
      variance_policy: 'authoritative',
      constraints: ['sensor_date <= release_date'],
    },
    {
      field_key: 'flawless_sensor',
      type: 'boolean',
      unit: '',
      variance_policy: 'authoritative',
    },
    {
      field_key: 'operating_range',
      type: 'range',
      unit: 'c',
      variance_policy: 'range',
      tolerance: 2,
    },
  ]);
  assert.ok(
    warnings.some((warning) => warning.includes('flawless_sensor') && warning.includes('coerced to')),
    `expected boolean upper_bound coercion warning, got: ${JSON.stringify(warnings)}`,
  );

  const valid = validateFieldStudioMap(normalized);
  assert.equal(valid.valid, true, valid.errors.join('; '));
});

test('buildComponentSourceSummary preserves component property metadata without columns', () => {
  const summary = buildComponentSourceSummary({
    map: {
      component_sources: [
        {
          component_type: 'encoder',
          roles: {
            properties: [
              {
                field_key: 'encoder_steps',
                type: 'number',
                unit: '',
                variance_policy: 'authoritative',
                constraints: ['encoder_steps > 0'],
                component_only: true,
              },
            ],
          },
        },
      ],
    },
    componentDb: {
      encoder: [{ name: 'TTC Gold' }],
    },
    fieldsRuntime: {},
  });

  assert.deepEqual(summary.encoder.roles.properties, [
    {
      key: 'encoder_steps',
      type: 'number',
      unit: '',
      field_key: 'encoder_steps',
      variance_policy: 'authoritative',
      constraints: ['encoder_steps > 0'],
      component_only: true,
    },
  ]);
  assert.equal('field_studio' in summary.encoder, false);
  assert.equal('sheet' in summary.encoder, false);
  assert.equal('name_column' in summary.encoder, false);
});

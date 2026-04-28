import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  compileCategoryFieldStudio,
  createMouseCompileWorkspace,
  saveFieldStudioMap,
  seedComponentDb,
} from './helpers/categoryCompileHarness.js';

function componentSource(componentType, properties) {
  return {
    component_type: componentType,
    roles: { properties },
  };
}

test('compileCategoryFieldStudio includes component property keys even when missing from extracted key list', async () => {
  const workspace = await createMouseCompileWorkspace({
    localWorkbook: true,
    tempPrefix: 'spec-harvester-category-compile-component-prop-keys-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  // WHY: Phase 4 INV-1 — every component_sources entry needs a self-locked
  // parent field rule. selected_keys must include the component types declared
  // in component_sources.
  fieldStudioMap.selected_keys = ['sensor', 'encoder'];
  fieldStudioMap.component_sources = [
    componentSource('encoder', [
      {
        field_key: 'encoder_steps',
        type: 'number',
        unit: '',
        variance_policy: 'authoritative',
      },
    ]),
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true, JSON.stringify(result.errors || []));

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.equal(
      Boolean(fieldRules?.fields?.encoder_steps),
      true,
      'encoder_steps should be materialized from component_sources roles.properties',
    );
  } finally {
    await cleanup();
  }
});

test('compileCategoryFieldStudio auto-generates component identity projection keys', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-component-identity-projections-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.selected_keys = ['sensor'];
  fieldStudioMap.field_overrides = {
    sensor_brand: {
      contract: { type: 'number', shape: 'list' },
      type: 'number',
      ui: { label: 'Sensor Maker' },
    },
    sensor_link: {
      enum: {
        policy: 'closed',
        source: 'data_lists.sensor_link',
      },
      enum_policy: 'closed',
      enum_source: { type: 'known_values', ref: 'sensor_link' },
    },
  };
  fieldStudioMap.data_lists = [
    {
      field: 'sensor_brand',
      mode: 'scratch',
      manual_values: ['PixArt', 'Razer'],
    },
  ];
  fieldStudioMap.component_sources = [
    componentSource('sensor', []),
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true, JSON.stringify(result.errors || []));

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    const brand = fieldRules.fields?.sensor_brand;
    const link = fieldRules.fields?.sensor_link;

    assert.ok(brand, 'sensor_brand should be materialized from component_sources identity facets');
    assert.equal(brand.contract?.type, 'string');
    assert.equal(brand.contract?.shape, 'scalar');
    assert.equal(brand.enum?.policy, 'open_prefer_known');
    assert.equal(brand.enum?.source, 'data_lists.sensor_brand');
    assert.equal(brand.ui?.label, 'Sensor Brand');
    assert.deepEqual(brand.component_identity_projection, {
      component_type: 'sensor',
      facet: 'brand',
    });

    assert.ok(link, 'sensor_link should be materialized from component_sources identity facets');
    assert.equal(link.contract?.type, 'url');
    assert.equal(link.contract?.shape, 'scalar');
    assert.equal(link.enum?.policy, 'open');
    assert.equal(link.enum?.source, null);
    assert.equal(link.ui?.label, 'Sensor Link');
    assert.deepEqual(link.component_identity_projection, {
      component_type: 'sensor',
      facet: 'link',
    });

    assert.deepEqual(
      fieldRules.component_db_sources?.sensor?.roles?.properties,
      [],
      'identity facets are not authored component attributes',
    );
  } finally {
    await cleanup();
  }
});

test('FRC-05-B - buildStudioFieldRule emits constraints for component property fields', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-frc05b-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  // WHY: Phase 4 INV-2 — selected_keys auto-locks via component_sources match.
  // This fixture only declares sensor; drop switch/encoder from selected_keys
  // so they don't become orphan locked rules.
  fieldStudioMap.selected_keys = fieldStudioMap.selected_keys.filter(
    (k) => !['switch', 'encoder'].includes(k),
  );
  fieldStudioMap.component_sources = [
    componentSource('sensor', [
      {
        field_key: 'dpi',
        type: 'number',
        unit: 'dpi',
        variance_policy: 'upper_bound',
      },
      {
        field_key: 'sensor_date',
        type: 'string',
        unit: '',
        variance_policy: 'authoritative',
        constraints: ['sensor_date <= release_date'],
      },
    ]),
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });
    await seedComponentDb(generatedRoot);

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true);

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    const sensorDate = fieldRules.fields?.sensor_date;
    assert.ok(sensorDate, 'sensor_date field should exist in compiled output');
    assert.ok(
      Array.isArray(sensorDate.constraints),
      'sensor_date.constraints should be an array (buildStudioFieldRule must emit constraints)',
    );
    assert.deepStrictEqual(
      sensorDate.constraints,
      ['sensor_date <= release_date'],
      'sensor_date constraints should carry through from field_studio_map component_sources',
    );

    const dpi = fieldRules.fields?.dpi;
    assert.ok(dpi, 'dpi field should exist');
    assert.ok(Array.isArray(dpi.constraints), 'dpi.constraints should be an empty array');
    assert.deepStrictEqual(dpi.constraints, []);
  } finally {
    await cleanup();
  }
});

test('FRC-05-C - buildStudioFieldRule auto-derives property_keys from component_sources', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-frc05c-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  // Phase 4 INV-2 — drop unused component-typed selected_keys.
  fieldStudioMap.selected_keys = fieldStudioMap.selected_keys.filter(
    (k) => !['switch', 'encoder'].includes(k),
  );
  fieldStudioMap.component_sources = [
    componentSource('sensor', [
      {
        field_key: 'dpi',
        type: 'number',
        unit: 'dpi',
        variance_policy: 'upper_bound',
      },
      {
        field_key: 'sensor_date',
        type: 'string',
        unit: '',
        variance_policy: 'authoritative',
        constraints: ['sensor_date <= release_date'],
      },
    ]),
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });
    await seedComponentDb(generatedRoot);

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true);

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    const sensor = fieldRules.fields?.sensor;
    assert.ok(sensor, 'sensor field should exist in compiled output');
    // Phase 2: `component` block retired entirely from compile output.
    // The single linkage is `enum.source = component_db.<X>`. property_keys
    // come at runtime from field_studio_map.component_sources.
    assert.equal(sensor.component, undefined, 'component block should not be emitted');
    assert.equal(sensor.enum?.source, 'component_db.sensor', 'enum.source must carry the component_db linkage');
  } finally {
    await cleanup();
  }
});

test('FRC-05-F - component property type and variance_policy propagate to generated field rules', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-frc05f-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.component_sources = [
    componentSource('sensor', [
      {
        field_key: 'dpi',
        type: 'number',
        unit: 'dpi',
        variance_policy: 'upper_bound',
      },
      {
        field_key: 'sensor_date',
        type: 'string',
        unit: '',
        variance_policy: 'authoritative',
        constraints: ['sensor_date <= release_date'],
      },
    ]),
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true);

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.equal(fieldRules?.fields?.dpi?.variance_policy, 'upper_bound');
    assert.equal(fieldRules?.fields?.sensor_date?.variance_policy, 'authoritative');
    assert.equal(fieldRules?.fields?.sensor_date?.data_type, 'string');
    assert.equal(fieldRules?.fields?.sensor_date?.contract?.type, 'string');
  } finally {
    await cleanup();
  }
});

test('FRC-05-G - component integer properties compile with type=integer', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-frc05g-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.component_sources = [
    componentSource('sensor', [
      {
        field_key: 'dpi',
        type: 'number',
        unit: 'dpi',
        variance_policy: 'upper_bound',
      },
      {
        field_key: 'sensor_rank',
        type: 'integer',
        unit: '',
        variance_policy: 'authoritative',
      },
    ]),
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true);

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    // WHY: parse_template eliminated. Verify type is correct instead.
    assert.equal(fieldRules?.fields?.sensor_rank?.contract?.type, 'integer');
  } finally {
    await cleanup();
  }
});

test('FRC-05-H - numeric component properties with known values compile as closed enum', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-frc05h-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.component_sources = [
    componentSource('encoder', [
      {
        field_key: 'encoder_steps',
        type: 'number',
        unit: '',
        variance_policy: 'authoritative',
      },
    ]),
  ];
  fieldStudioMap.data_lists = [
    {
      field: 'encoder_steps',
      mode: 'scratch',
      sheet: '',
      value_column: '',
      header_row: 0,
      row_start: 2,
      row_end: 0,
      normalize: 'lower_trim',
      delimiter: '',
      manual_values: ['16', '20', '24'],
    },
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true);

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.equal(fieldRules?.fields?.encoder_steps?.enum?.policy, 'closed');
    assert.equal(fieldRules?.fields?.encoder_steps?.enum?.source, 'data_lists.encoder_steps');
  } finally {
    await cleanup();
  }
});

test('compileCategoryFieldStudio summarizes component property coverage warnings instead of per-entity missing lists', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-component-warning-summary-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  // Phase 4 INV-2 — drop unused component-typed selected_keys.
  fieldStudioMap.selected_keys = fieldStudioMap.selected_keys.filter(
    (k) => !['switch', 'encoder'].includes(k),
  );
  fieldStudioMap.component_sources = [
    componentSource('sensor', [
      { field_key: 'dpi', type: 'number', unit: 'dpi', variance_policy: 'upper_bound' },
      { field_key: 'sensor_date', type: 'string', unit: '', variance_policy: 'authoritative' },
      { field_key: 'flawless_sensor', type: 'string', unit: '', variance_policy: 'authoritative' },
    ]),
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });
    await seedComponentDb(generatedRoot, {
      sensors: {
        component_type: 'sensor',
        items: [
          { name: 'PAW3950', maker: 'PixArt', aliases: [], links: [], properties: { dpi: 30000 } },
          { name: 'HERO 2', maker: 'Logitech', aliases: [], links: [], properties: { dpi: 44000 } },
          { name: 'Focus Pro Gen 2', maker: 'Razer', aliases: [], links: [], properties: {} },
        ],
      },
    });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true);

    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const perEntityMissingWarnings = warnings.filter((warning) => String(warning).includes('missing properties:'));
    assert.equal(
      perEntityMissingWarnings.length,
      0,
      `missing warnings should be summarized by property coverage, got: ${JSON.stringify(perEntityMissingWarnings.slice(0, 5))}`,
    );

    const coverageWarnings = warnings.filter((warning) => (
      String(warning).includes('property "')
      && String(warning).includes('coverage')
    ));
    assert.ok(
      coverageWarnings.length > 0,
      'expected property-coverage warnings when component properties are sparse',
    );
  } finally {
    await cleanup();
  }
});

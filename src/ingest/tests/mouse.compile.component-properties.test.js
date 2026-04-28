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
    {
      type: 'encoder',
      mode: 'sheet',
      sheet: 'encoder',
      auto_derive_aliases: true,
      header_row: 1,
      first_data_row: 2,
      stop_after_blank_primary: 10,
      roles: {
        primary_identifier: 'C',
        maker: 'B',
        aliases: [],
        links: ['G'],
        properties: [
          {
            column: 'E',
            field_key: 'encoder_steps',
            type: 'number',
            unit: '',
            variance_policy: 'authoritative',
            constraints: [],
          },
        ],
      },
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
    {
      type: 'sensor',
      sheet: 'sensors',
      auto_derive_aliases: true,
      header_row: 1,
      first_data_row: 2,
      stop_after_blank_primary: 10,
      roles: {
        primary_identifier: 'C',
        maker: 'B',
        aliases: [],
        links: ['J'],
        properties: [
          {
            column: 'F',
            field_key: 'dpi',
            type: 'number',
            unit: 'dpi',
            variance_policy: 'upper_bound',
            constraints: [],
          },
          {
            column: 'I',
            field_key: 'sensor_date',
            type: 'string',
            unit: '',
            variance_policy: 'authoritative',
            constraints: ['sensor_date <= release_date'],
          },
        ],
      },
    },
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
    {
      type: 'sensor',
      sheet: 'sensors',
      auto_derive_aliases: true,
      header_row: 1,
      first_data_row: 2,
      stop_after_blank_primary: 10,
      roles: {
        primary_identifier: 'C',
        maker: 'B',
        aliases: [],
        links: ['J'],
        properties: [
          {
            column: 'F',
            field_key: 'dpi',
            type: 'number',
            unit: 'dpi',
            variance_policy: 'upper_bound',
            constraints: [],
          },
          {
            column: 'I',
            field_key: 'sensor_date',
            type: 'string',
            unit: '',
            variance_policy: 'authoritative',
            constraints: ['sensor_date <= release_date'],
          },
        ],
      },
    },
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
    {
      type: 'sensor',
      sheet: 'sensors',
      auto_derive_aliases: true,
      header_row: 1,
      first_data_row: 2,
      stop_after_blank_primary: 10,
      roles: {
        primary_identifier: 'C',
        maker: 'B',
        aliases: [],
        links: ['J'],
        properties: [
          {
            column: 'F',
            field_key: 'dpi',
            type: 'number',
            unit: 'dpi',
            variance_policy: 'upper_bound',
            constraints: [],
          },
          {
            column: 'I',
            field_key: 'sensor_date',
            type: 'string',
            unit: '',
            variance_policy: 'authoritative',
            constraints: ['sensor_date <= release_date'],
          },
        ],
      },
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
    {
      type: 'sensor',
      sheet: 'sensors',
      auto_derive_aliases: true,
      header_row: 1,
      first_data_row: 2,
      stop_after_blank_primary: 10,
      roles: {
        primary_identifier: 'C',
        maker: 'B',
        aliases: [],
        links: ['J'],
        properties: [
          {
            column: 'F',
            field_key: 'dpi',
            type: 'number',
            unit: 'dpi',
            variance_policy: 'upper_bound',
            constraints: [],
          },
          {
            column: 'A',
            field_key: 'sensor_rank',
            type: 'integer',
            unit: '',
            variance_policy: 'authoritative',
            constraints: [],
          },
        ],
      },
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
    {
      type: 'encoder',
      sheet: 'encoder',
      auto_derive_aliases: true,
      header_row: 1,
      first_data_row: 2,
      stop_after_blank_primary: 10,
      roles: {
        primary_identifier: 'C',
        maker: 'B',
        aliases: [],
        links: ['G'],
        properties: [
          {
            column: 'E',
            field_key: 'encoder_steps',
            type: 'number',
            unit: '',
            variance_policy: 'authoritative',
            constraints: [],
          },
        ],
      },
    },
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
    {
      type: 'sensor',
      sheet: 'sensors',
      auto_derive_aliases: true,
      header_row: 1,
      first_data_row: 2,
      stop_after_blank_primary: 10,
      roles: {
        primary_identifier: 'C',
        maker: 'B',
        aliases: [],
        links: ['J'],
        properties: [
          { column: 'F', field_key: 'dpi', type: 'number', unit: 'dpi', variance_policy: 'upper_bound', constraints: [] },
          { column: 'I', field_key: 'sensor_date', type: 'string', unit: '', variance_policy: 'authoritative', constraints: [] },
          { column: 'P', field_key: 'flawless_sensor', type: 'string', unit: '', variance_policy: 'authoritative', constraints: [] },
        ],
      },
    },
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

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  compileCategoryFieldStudio,
  loadFieldStudioMap,
  saveFieldStudioMap,
  validateFieldStudioMap
} from '../src/ingest/categoryCompile.js';
import { getMouseFieldStudioSourcePath } from './fixtures/mouseFieldStudioWorkbookFixture.js';

function mouseFieldStudioSourcePath() {
  return getMouseFieldStudioSourcePath();
}

function buildMouseFieldStudioMap(fieldStudioSourcePath) {
  return {
    version: 1,
    field_studio_source_path: fieldStudioSourcePath,
    sheet_roles: [
      { sheet: 'dataEntry', role: 'product_table' },
      { sheet: 'dataEntry', role: 'field_key_list' }
    ],
    key_list: {
      sheet: 'dataEntry',
      source: 'column_range',
      column: 'B',
      row_start: 9,
      row_end: 83
    },
    product_table: {
      sheet: 'dataEntry',
      layout: 'matrix',
      brand_row: 3,
      model_row: 4,
      variant_row: 5,
      value_col_start: 'C',
      value_col_end: '',
      sample_columns: 18
    },
    expectations: {
      required_fields: ['connection', 'weight', 'dpi'],
      critical_fields: ['polling_rate'],
      expected_easy_fields: ['side_buttons'],
      expected_sometimes_fields: ['sensor'],
      deep_fields: ['release_date']
    },
    enum_lists: [],
    component_sheets: [],
    field_overrides: {},
    selected_keys: [
      'connection', 'connectivity', 'weight', 'lngth', 'width', 'height',
      'dpi', 'polling_rate', 'sensor', 'sensor_brand', 'switch', 'switch_brand',
      'side_buttons', 'middle_buttons', 'release_date', 'shape', 'coating',
      'feet_material', 'lighting', 'cable_length', 'encoder', 'mcu',
      'click_latency', 'sensor_latency', 'lift_off_distance', 'form_factor',
      'click_latency_list', 'sensor_latency_list', 'click_force', 'shift_latency'
    ],
    component_sources: [
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
            { column: 'F', field_key: 'dpi', type: 'number', unit: 'dpi', variance_policy: 'upper_bound', constraints: [] }
          ]
        }
      },
      {
        type: 'switch',
        sheet: 'switches',
        auto_derive_aliases: true,
        header_row: 1,
        first_data_row: 2,
        stop_after_blank_primary: 10,
        roles: {
          primary_identifier: 'C',
          maker: 'B',
          aliases: [],
          links: [],
          properties: []
        }
      },
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
          links: [],
          properties: []
        }
      }
    ]
  };
}

async function seedComponentDb(generatedRoot, components = {}) {
  const componentRoot = path.join(generatedRoot, 'component_db');
  await fs.mkdir(componentRoot, { recursive: true });
  const defaults = {
    sensors: {
      component_type: 'sensor',
      items: [
        { name: 'PAW3950', maker: 'PixArt', aliases: ['paw-3950'], links: [], properties: { dpi: 30000 } },
        { name: 'HERO 2', maker: 'Logitech', aliases: ['hero-2'], links: [], properties: { dpi: 44000 } },
        { name: 'Focus Pro Gen 2', maker: 'Razer', aliases: ['focus-pro-gen-2'], links: [], properties: { dpi: 30000 } }
      ]
    },
    switches: {
      component_type: 'switch',
      items: [
        { name: 'Optical Gen 3', maker: 'Razer', aliases: ['optical-gen-3'], links: [], properties: {} },
        { name: 'Lightforce', maker: 'Logitech', aliases: ['lightforce'], links: [], properties: {} }
      ]
    },
    encoders: {
      component_type: 'encoder',
      items: [
        { name: 'TTC Gold', maker: 'TTC', aliases: ['ttc-gold'], links: [], properties: {} }
      ]
    },
    materials: {
      component_type: 'material',
      items: [
        { name: 'PTFE', maker: '', aliases: ['ptfe'], links: [], properties: {} }
      ]
    }
  };
  const merged = { ...defaults, ...components };
  for (const [fileName, data] of Object.entries(merged)) {
    await fs.writeFile(
      path.join(componentRoot, `${fileName}.json`),
      JSON.stringify(data, null, 2),
      'utf8'
    );
  }
}

function assertSubsetDeep(expected, actual, pathLabel = 'root') {
  if (Array.isArray(expected)) {
    assert.equal(Array.isArray(actual), true, `${pathLabel} expected array`);
    assert.equal(actual.length, expected.length, `${pathLabel} length mismatch`);
    for (let index = 0; index < expected.length; index += 1) {
      assertSubsetDeep(expected[index], actual[index], `${pathLabel}[${index}]`);
    }
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.equal(Boolean(actual) && typeof actual === 'object', true, `${pathLabel} expected object`);
    for (const key of Object.keys(expected)) {
      assert.equal(Object.prototype.hasOwnProperty.call(actual, key), true, `${pathLabel}.${key} missing`);
      assertSubsetDeep(expected[key], actual[key], `${pathLabel}.${key}`);
    }
    return;
  }
  assert.equal(actual, expected, `${pathLabel} mismatch`);
}

test('compileCategoryFieldStudio includes component property keys even when missing from extracted key list', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-category-compile-component-prop-keys-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  const categoryRoot = path.join(helperRoot, 'mouse');
  await fs.mkdir(categoryRoot, { recursive: true });
  const sourceFieldStudioSourcePath = mouseFieldStudioSourcePath();
  const localFieldStudioSourcePath = path.join(categoryRoot, 'mouseData.xlsm');
  await fs.copyFile(sourceFieldStudioSourcePath, localFieldStudioSourcePath);
  const fieldStudioMap = buildMouseFieldStudioMap(localFieldStudioSourcePath);
  fieldStudioMap.selected_keys = ['sensor'];
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
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });
    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: localFieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });
    assert.equal(result.compiled, true, JSON.stringify(result.errors || []));

    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.equal(Boolean(fieldRules?.fields?.encoder_steps), true, 'encoder_steps should be materialized from component_sources roles.properties');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('compileCategoryFieldStudio rejects cyclic key migration maps', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-category-compile-key-cycle-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  const categoryRoot = path.join(helperRoot, 'mouse');
  await fs.mkdir(categoryRoot, { recursive: true });
  const sourceFieldStudioSourcePath = mouseFieldStudioSourcePath();
  const localFieldStudioSourcePath = path.join(categoryRoot, 'mouseData.xlsm');
  await fs.copyFile(sourceFieldStudioSourcePath, localFieldStudioSourcePath);
  const fieldStudioMap = buildMouseFieldStudioMap(localFieldStudioSourcePath);
  fieldStudioMap.selected_keys = ['connection', 'weight'];
  fieldStudioMap.field_overrides = {
    connection: {
      canonical_key: 'weight',
      ui: {
        label: 'connection',
      },
    },
    weight: {
      canonical_key: 'connection',
      ui: {
        label: 'weight',
      },
    },
  };

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: localFieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    assert.equal(result.compiled, false);
    assert.equal(
      (result.errors || []).some((row) => String(row).includes('key_migrations: cycle detected')),
      true,
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('compileCategoryFieldStudio keeps key migrations aligned to generated field keys', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-category-compile-key-map-align-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  const categoryRoot = path.join(helperRoot, 'mouse');
  await fs.mkdir(categoryRoot, { recursive: true });
  const sourceFieldStudioSourcePath = mouseFieldStudioSourcePath();
  const localFieldStudioSourcePath = path.join(categoryRoot, 'mouseData.xlsm');
  await fs.copyFile(sourceFieldStudioSourcePath, localFieldStudioSourcePath);
  const fieldStudioMap = buildMouseFieldStudioMap(localFieldStudioSourcePath);
  fieldStudioMap.selected_keys = ['lngth'];
  fieldStudioMap.field_overrides = {
    ...(fieldStudioMap.field_overrides || {}),
    lngth: {
      canonical_key: 'length',
      ui: {
        label: 'Length',
      },
    },
  };

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: localFieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });
    assert.equal(result.compiled, true, JSON.stringify(result.errors || []));

    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    const keyMigrations = JSON.parse(await fs.readFile(path.join(generatedRoot, 'key_migrations.json'), 'utf8'));
    const keyMap = keyMigrations?.key_map || {};

    assert.equal(Boolean(fieldRules?.fields?.lngth), true, 'fixture should still compile lngth field key');
    assert.equal(keyMap.length, 'lngth', 'canonical alias should migrate to generated key');
    assert.equal(Object.prototype.hasOwnProperty.call(keyMap, 'lngth'), false, 'migration target must be a real generated key');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('compileCategoryFieldStudio preserves saved map field_overrides consumers in generated field rules', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-category-compile-consumers-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath();
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot
      }
    });

    fieldStudioMap.field_overrides = {
      ...(fieldStudioMap.field_overrides || {}),
      connection: {
        consumers: {
          'contract.type': {
            seed: false
          },
          'enum.policy': {
            indexlab: false,
            review: false
          }
        }
      }
    };
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot
      }
    });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot
      }
    });

    assert.equal(result.compiled, true);

    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    const runtimeRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.runtime.json'), 'utf8'));

    assert.deepEqual(
      fieldRules?.fields?.connection?.consumers,
      {
        'contract.type': {
          seed: false
        },
        'enum.policy': {
          indexlab: false,
          review: false
        }
      }
    );
    assert.deepEqual(runtimeRules?.fields?.connection?.consumers, fieldRules?.fields?.connection?.consumers);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('compileCategoryFieldStudio hard-fails invalid override contract', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-category-compile-invalid-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath();
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);
  fieldStudioMap.field_overrides = {
    connection: {
      type: 'made_up_type'
    }
  };
  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot
      }
    });
    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot
      }
    });
    assert.equal(result.compiled, false);
    assert.equal(
      (result.errors || []).some((row) => String(row).includes('invalid type')),
      true
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('compileCategoryFieldStudio honors selected_keys scope from field studio map', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-category-compile-selected-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath();
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);
  fieldStudioMap.selected_keys = ['connection', 'weight'];
  fieldStudioMap.component_sources = [];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot
      }
    });
    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot
      }
    });
    assert.equal(result.compiled, true);
    assert.equal(result.selected_key_count, 2);
    assert.equal(result.field_count, 2);

    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.deepEqual(Object.keys(fieldRules.fields).sort(), ['connection', 'weight']);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('compileCategoryFieldStudio applies field_studio_map field_overrides for latency/force fields', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-category-compile-overrides-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  const categoryRoot = path.join(helperRoot, 'mouse');
  await fs.mkdir(categoryRoot, { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath();
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);
  const inlineOverrides = {
    click_latency: {
      priority: { required_level: 'expected', availability: 'sometimes', difficulty: 'hard', effort: 8 },
      contract: { type: 'number', shape: 'scalar', unit: 'ms', rounding: { decimals: 2, mode: 'nearest' }, value_form: 'single' },
      parse: { template: 'number_with_unit', unit: 'ms', unit_accepts: ['ms'], strict_unit_required: true },
      evidence: { required: true, min_evidence_refs: 1, tier_preference: ['tier2', 'tier1', 'tier3'], conflict_policy: 'resolve_by_tier_else_unknown' },
      selection_policy: { source_field: 'click_latency_list' }
    },
    click_latency_list: {
      priority: { required_level: 'optional', availability: 'sometimes', difficulty: 'hard', effort: 9 },
      contract: {
        type: 'object',
        shape: 'list',
        unit: 'ms',
        value_form: 'set',
        object_schema: {
          mode: { type: 'string' },
          ms: { type: 'number' },
          source_host: { type: 'string', required: false },
          method: { type: 'string', required: false }
        }
      },
      parse: { template: 'latency_list_modes_ms' },
      evidence: { required: true, min_evidence_refs: 1, tier_preference: ['tier2', 'tier1', 'tier3'], conflict_policy: 'preserve_all_candidates' }
    },
    sensor_latency_list: {
      priority: { required_level: 'optional', availability: 'sometimes', difficulty: 'hard', effort: 9 },
      contract: {
        type: 'object',
        shape: 'list',
        unit: 'ms',
        value_form: 'set',
        object_schema: {
          mode: { type: 'string' },
          ms: { type: 'number' },
          source_host: { type: 'string', required: false },
          method: { type: 'string', required: false }
        }
      },
      parse: { template: 'latency_list_modes_ms' }
    },
    click_force: {
      priority: { required_level: 'optional', availability: 'rare', difficulty: 'hard', effort: 6 },
      contract: { type: 'number', shape: 'scalar', unit: 'gf', rounding: { decimals: 0, mode: 'nearest' }, value_form: 'single' },
      parse: { template: 'number_with_unit', unit: 'gf', unit_accepts: ['gf', 'g'], strict_unit_required: true }
    }
  };
  fieldStudioMap.field_overrides = inlineOverrides;

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot
      }
    });
    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot
      }
    });
    assert.equal(result.compiled, true);

    const generatedRoot = path.join(categoryRoot, '_generated');
    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    for (const [fieldKey, expectedRule] of Object.entries(inlineOverrides)) {
      assert.equal(Object.prototype.hasOwnProperty.call(fieldRules.fields || {}, fieldKey), true, `generated field missing ${fieldKey}`);
      assertSubsetDeep(expectedRule, fieldRules.fields[fieldKey], `field_rules.fields.${fieldKey}`);
    }

    const clickLatency = fieldRules.fields?.click_latency || {};
    const clickLatencyList = fieldRules.fields?.click_latency_list || {};
    const sensorLatencyList = fieldRules.fields?.sensor_latency_list || {};
    const clickForce = fieldRules.fields?.click_force || {};
    assert.equal(clickLatency?.contract?.shape || clickLatency?.shape, 'scalar');
    assert.equal(clickLatencyList?.contract?.shape || clickLatencyList?.shape, 'list');
    assert.equal(clickLatencyList?.parse?.template || clickLatencyList?.parse_template, 'latency_list_modes_ms');
    assert.equal(sensorLatencyList?.parse?.template || sensorLatencyList?.parse_template, 'latency_list_modes_ms');
    assert.equal(clickForce?.contract?.unit || clickForce?.unit, 'gf');
    assert.equal(clickLatency?.selection_policy?.source_field, 'click_latency_list');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('FRC-05-B Ã¢â‚¬â€ buildStudioFieldRule emits constraints for component property fields', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-frc05b-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath();
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);
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
            constraints: []
          },
          {
            column: 'I',
            field_key: 'sensor_date',
            type: 'string',
            unit: '',
            variance_policy: 'authoritative',
            constraints: ['sensor_date <= release_date']
          }
        ]
      }
    }
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot }
    });
    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    await seedComponentDb(generatedRoot);
    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot }
    });
    assert.equal(result.compiled, true);

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));

    const sensorDate = fieldRules.fields?.sensor_date;
    assert.ok(sensorDate, 'sensor_date field should exist in compiled output');
    assert.ok(Array.isArray(sensorDate.constraints),
      'sensor_date.constraints should be an array (buildStudioFieldRule must emit constraints)');
    assert.deepStrictEqual(sensorDate.constraints, ['sensor_date <= release_date'],
      'sensor_date constraints should carry through from field_studio_map component_sources');

    const dpi = fieldRules.fields?.dpi;
    assert.ok(dpi, 'dpi field should exist');
    assert.ok(Array.isArray(dpi.constraints),
      'dpi.constraints should be an empty array');
    assert.deepStrictEqual(dpi.constraints, []);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('FRC-05-C Ã¢â‚¬â€ buildStudioFieldRule auto-derives property_keys from component_sources', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-frc05c-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath();
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);
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
            constraints: []
          },
          {
            column: 'I',
            field_key: 'sensor_date',
            type: 'string',
            unit: '',
            variance_policy: 'authoritative',
            constraints: ['sensor_date <= release_date']
          }
        ]
      }
    }
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot }
    });
    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    await seedComponentDb(generatedRoot);
    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot }
    });
    assert.equal(result.compiled, true);

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));

    const sensor = fieldRules.fields?.sensor;
    assert.ok(sensor, 'sensor field should exist in compiled output');
    assert.ok(sensor.component, 'sensor field should have a component block');
    assert.ok(sensor.component.match, 'sensor component should have a match block');
    assert.ok(Array.isArray(sensor.component.match.property_keys),
      'property_keys should be an array');
    assert.ok(sensor.component.match.property_keys.length > 0,
      'property_keys should be auto-derived from component_sources (not empty)');
    assert.deepStrictEqual(
      sensor.component.match.property_keys,
      ['dpi', 'sensor_date'],
      'property_keys should be derived from component_sources[sensor].roles.properties[].field_key'
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('FRC-05-F Ã¢â‚¬â€ component property type and variance_policy propagate to generated field rules', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-frc05f-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath();
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);
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
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true);

    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));

    assert.equal(fieldRules?.fields?.dpi?.variance_policy, 'upper_bound');
    assert.equal(fieldRules?.fields?.sensor_date?.variance_policy, 'authoritative');
    assert.equal(fieldRules?.fields?.sensor_date?.data_type, 'string');
    assert.equal(fieldRules?.fields?.sensor_date?.contract?.type, 'string');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});


test('FRC-05-G - component integer properties normalize parse_template to integer_field', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-frc05g-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath();
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);
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
            constraints: []
          },
          {
            column: 'A',
            field_key: 'sensor_rank',
            type: 'integer',
            unit: '',
            variance_policy: 'authoritative',
            constraints: []
          }
        ]
      }
    }
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot }
    });
    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot }
    });
    assert.equal(result.compiled, true);

    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.equal(fieldRules?.fields?.sensor_rank?.parse_template || fieldRules?.fields?.sensor_rank?.parse?.template, 'integer_field');
    assert.equal(fieldRules?.fields?.sensor_rank?.contract?.type, 'integer');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
test('FRC-05-H - numeric component properties with known values compile as closed enum', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-frc05h-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath();
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);
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
            constraints: []
          }
        ]
      }
    }
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
      manual_values: ['16', '20', '24']
    }
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot }
    });
    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot }
    });
    assert.equal(result.compiled, true);

    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.equal(fieldRules?.fields?.encoder_steps?.enum?.policy, 'closed');
    assert.equal(fieldRules?.fields?.encoder_steps?.enum?.source, 'data_lists.encoder_steps');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});test('FRC-05-D Ã¢â‚¬â€ compiler coerces string property variance_policy to authoritative', () => {
  const rawMap = {
    component_sources: [
      {
        type: 'sensor',
        sheet: 'sensors',
        header_row: 1,
        first_data_row: 2,
        roles: {
          primary_identifier: 'C',
          maker: 'B',
          aliases: [],
          links: ['J'],
          properties: [
            { column: 'F', field_key: 'dpi', type: 'number', variance_policy: 'upper_bound' },
            { column: 'G', field_key: 'sensor_type', type: 'string', variance_policy: 'upper_bound' },
            { column: 'I', field_key: 'sensor_date', type: 'string', variance_policy: 'range' },
            { column: 'H', field_key: 'detent_type', variance_policy: 'lower_bound' },
          ]
        }
      }
    ]
  };

  const result = validateFieldStudioMap(rawMap);

  const warnings = result.warnings || [];
  const coercionWarnings = warnings.filter(w => w.includes('variance_policy') && w.includes('authoritative'));
  assert.ok(coercionWarnings.length >= 3,
    `should have at least 3 coercion warnings for string properties, got ${coercionWarnings.length}: ${JSON.stringify(coercionWarnings)}`);
  assert.ok(coercionWarnings.find(w => w.includes('sensor_type')),
    'should warn about sensor_type string property with upper_bound');
  assert.ok(coercionWarnings.find(w => w.includes('sensor_date')),
    'should warn about sensor_date string property with range');
  assert.ok(coercionWarnings.find(w => w.includes('detent_type')),
    'should warn about detent_type (default string) with lower_bound');

  const normalizedSensor = result.normalized.component_sources[0];
  const props = normalizedSensor.roles.properties;
  const dpiProp = props.find(p => p.field_key === 'dpi');
  const sensorTypeProp = props.find(p => p.field_key === 'sensor_type');
  const sensorDateProp = props.find(p => p.field_key === 'sensor_date');
  const detentTypeProp = props.find(p => p.field_key === 'detent_type');

  assert.equal(dpiProp.variance_policy, 'upper_bound',
    'numeric property should keep upper_bound');
  assert.equal(sensorTypeProp.variance_policy, 'authoritative',
    'string property with upper_bound should be coerced to authoritative');
  assert.equal(sensorDateProp.variance_policy, 'authoritative',
    'string property with range should be coerced to authoritative');
  assert.equal(detentTypeProp.variance_policy, 'authoritative',
    'default string property with lower_bound should be coerced to authoritative');
});

test('FRC-05-E Ã¢â‚¬â€ mouse sensor component policies remain numeric upper_bound for dpi/ips/acceleration', async (t) => {
  const loaded = await loadFieldStudioMap({
    category: 'mouse',
    config: {
      categoryAuthorityRoot: path.resolve('category_authority')
    }
  });
  assert.ok(loaded?.map, 'mouse field studio map should load');

  const sources = Array.isArray(loaded.map.component_sources) ? loaded.map.component_sources : [];
  const sensorSource = sources.find((row) => String(row?.type || row?.component_type || '').toLowerCase() === 'sensor');
  if (!sensorSource) { t.skip('sensor component source not present in current field_studio_map'); return; }

  const props = Array.isArray(sensorSource?.roles?.properties) ? sensorSource.roles.properties : [];
  const findProp = (key) => props.find((prop) => (prop?.field_key || prop?.key) === key);
  const requiredPolicies = [
    { key: 'dpi', unit: 'dpi' },
    { key: 'ips', unit: 'ips' },
    { key: 'acceleration', unit: 'g' }
  ];

  for (const requirement of requiredPolicies) {
    const prop = findProp(requirement.key);
    assert.ok(prop, `sensor property '${requirement.key}' should exist in field studio map`);
    assert.equal(prop.type, 'number', `${requirement.key} should stay typed as number`);
    assert.equal(prop.unit, requirement.unit, `${requirement.key} unit should stay '${requirement.unit}'`);
    assert.equal(prop.variance_policy, 'upper_bound', `${requirement.key} variance policy should stay upper_bound`);
  }

  const validated = validateFieldStudioMap(loaded.map);
  const driftWarnings = (validated.warnings || []).filter((warning) => (
    warning.includes('coerced to \'authoritative\'')
    && (warning.includes('dpi') || warning.includes('ips') || warning.includes('acceleration'))
  ));
  assert.equal(
    driftWarnings.length,
    0,
    `mouse sensor numeric properties should not be coerced to authoritative: ${JSON.stringify(driftWarnings)}`
  );
});

test('compileCategoryFieldStudio summarizes component property coverage warnings instead of per-entity missing lists', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-component-warning-summary-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath();
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);
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
    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    await seedComponentDb(generatedRoot, {
      sensors: {
        component_type: 'sensor',
        items: [
          { name: 'PAW3950', maker: 'PixArt', aliases: [], links: [], properties: { dpi: 30000 } },
          { name: 'HERO 2', maker: 'Logitech', aliases: [], links: [], properties: { dpi: 44000 } },
          { name: 'Focus Pro Gen 2', maker: 'Razer', aliases: [], links: [], properties: {} }
        ]
      }
    });
    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true);
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const perEntityMissingWarnings = warnings.filter((warning) => String(warning).includes('missing properties:'));
    assert.equal(
      perEntityMissingWarnings.length,
      0,
      `missing warnings should be summarized by property coverage, got: ${JSON.stringify(perEntityMissingWarnings.slice(0, 5))}`
    );
    const coverageWarnings = warnings.filter((warning) => (
      String(warning).includes('property "')
      && String(warning).includes('coverage')
    ));
    assert.ok(
      coverageWarnings.length > 0,
      'expected property-coverage warnings when component properties are sparse'
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('compileCategoryFieldStudio merges enum.additional_values from saved map field_overrides into known_values', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-enum-addval-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  const categoryRoot = path.join(helperRoot, 'mouse');
  await fs.mkdir(categoryRoot, { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath();
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot }
    });

    fieldStudioMap.field_overrides = {
      ...(fieldStudioMap.field_overrides || {}),
      connection: {
        enum: {
          policy: 'open_prefer_known',
          additional_values: ['bluetooth_5_3', 'usb_c_dongle']
        }
      }
    };
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot }
    });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot }
    });
    assert.equal(result.compiled, true);

    const generatedRoot = path.join(categoryRoot, '_generated');
    const knownValuesRaw = await fs.readFile(path.join(generatedRoot, 'known_values.json'), 'utf8');
    const knownValues = JSON.parse(knownValuesRaw);
    const connectionValues = knownValues.fields?.connection || knownValues.enums?.connection?.values || [];
    assert.equal(
      connectionValues.includes('bluetooth_5_3'),
      true,
      `known_values for connection should include 'bluetooth_5_3' from additional_values, got: ${JSON.stringify(connectionValues)}`
    );
    assert.equal(
      connectionValues.includes('usb_c_dongle'),
      true,
      `known_values for connection should include 'usb_c_dongle' from additional_values, got: ${JSON.stringify(connectionValues)}`
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});





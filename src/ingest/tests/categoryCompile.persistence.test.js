import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildMouseFieldStudioMap,
  compileCategoryFieldStudio,
  loadFieldStudioMap,
  mouseFieldStudioSourcePath,
  saveFieldStudioMap,
  seedComponentDb,
} from './helpers/categoryCompileHarness.js';

test('compileCategoryFieldStudio accepts component_reference when component types are declared in map sources (app-driven)', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-component-ref-map-types-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  const categoryRoot = path.join(helperRoot, 'mouse');
  await fs.mkdir(categoryRoot, { recursive: true });
  const sourceFieldStudioSourcePath = mouseFieldStudioSourcePath(tempRoot);
  const localFieldStudioSourcePath = path.join(categoryRoot, 'mouseData.xlsm');
  await fs.copyFile(sourceFieldStudioSourcePath, localFieldStudioSourcePath);
  const fieldStudioMap = buildMouseFieldStudioMap(localFieldStudioSourcePath);
  fieldStudioMap.component_sources = [
    { component_type: 'sensor', mode: 'scratch', sheet: '', roles: { properties: [] } },
    { component_type: 'switch', mode: 'scratch', sheet: '', roles: { properties: [] } },
    { component_type: 'encoder', mode: 'scratch', sheet: '', roles: { properties: [] } },
    { component_type: 'material', mode: 'scratch', sheet: '', roles: { properties: [] } },
  ];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    const controlPlaneRoot = path.join(categoryRoot, '_control_plane');
    await fs.mkdir(controlPlaneRoot, { recursive: true });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: localFieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    assert.equal(result.compiled, true, `compile should succeed, got errors: ${JSON.stringify(result.errors || [])}`);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('saveFieldStudioMap writes canonical field studio control map', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-field-studio-map-save-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath(tempRoot);
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);

  try {
    const saved = await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });

    const controlPlane = path.join(helperRoot, 'mouse', '_control_plane');
    const fieldStudioPath = path.join(controlPlane, 'field_studio_map.json');

    assert.equal(saved.file_path, fieldStudioPath);
    assert.equal(await fs.stat(fieldStudioPath).then(() => true).catch(() => false), true);
    const mapFiles = (await fs.readdir(controlPlane))
      .filter((name) => name.endsWith('_map.json'))
      .sort();
    assert.deepEqual(mapFiles, ['field_studio_map.json']);

    const loaded = await loadFieldStudioMap({
      category: 'mouse',
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(loaded.file_path, fieldStudioPath);
    assert.equal(Boolean(loaded?.map), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('loadFieldStudioMap only reads canonical field studio map', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-field-studio-map-load-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  const controlPlane = path.join(helperRoot, 'mouse', '_control_plane');
  await fs.mkdir(controlPlane, { recursive: true });

  try {
    await fs.writeFile(
      path.join(controlPlane, 'legacy_map.json'),
      JSON.stringify({ version: 1, sheet_roles: [] }, null, 2),
      'utf8',
    );

    const legacyOnly = await loadFieldStudioMap({
      category: 'mouse',
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(legacyOnly, null);

    await fs.writeFile(
      path.join(controlPlane, 'field_studio_map.json'),
      JSON.stringify({ version: 1, sheet_roles: [{ sheet: 'dataEntry', role: 'field_key_list' }] }, null, 2),
      'utf8',
    );

    const loaded = await loadFieldStudioMap({
      category: 'mouse',
      config: { categoryAuthorityRoot: helperRoot },
    });

    assert.equal(
      loaded.file_path,
      path.join(controlPlane, 'field_studio_map.json'),
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('compileCategoryFieldStudio does not write legacy field studio map mirror', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-field-studio-map-compile-only-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath(tempRoot);
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    const controlPlane = path.join(helperRoot, 'mouse', '_control_plane');
    const fieldStudioPath = path.join(controlPlane, 'field_studio_map.json');

    const compileResult = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    assert.equal(compileResult.compiled, true, JSON.stringify(compileResult.errors || []));
    assert.equal(await fs.stat(fieldStudioPath).then(() => true).catch(() => false), true);
    const mapFiles = (await fs.readdir(controlPlane))
      .filter((name) => name.endsWith('_map.json'))
      .sort();
    assert.deepEqual(mapFiles, ['field_studio_map.json']);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('compileCategoryFieldStudio writes deterministic generated artifacts', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-category-compile-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath(tempRoot);
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);

  try {
    const saved = await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });
    assert.equal(Boolean(saved.file_path), true);

    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    await seedComponentDb(generatedRoot);

    const first = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });
    assert.equal(first.compiled, true);
    assert.equal(first.field_count > 20, true);

    const controlRoot = path.join(helperRoot, 'mouse', '_control_plane');
    const suggestionsRoot = path.join(helperRoot, 'mouse', '_suggestions');
    const fieldRulesPath = path.join(generatedRoot, 'field_rules.json');
    const knownValuesPath = path.join(generatedRoot, 'known_values.json');
    const uiCatalogPath = path.join(generatedRoot, 'ui_field_catalog.json');
    const componentRoot = path.join(generatedRoot, 'component_db');
    assert.equal(await fs.stat(fieldRulesPath).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(knownValuesPath).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(uiCatalogPath).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(path.join(controlRoot, 'field_rules.full.json')).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(path.join(suggestionsRoot, 'enums.json')).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(path.join(suggestionsRoot, 'components.json')).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(path.join(componentRoot, 'sensors.json')).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(path.join(componentRoot, 'switches.json')).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(path.join(componentRoot, 'encoders.json')).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(path.join(componentRoot, 'materials.json')).then(() => true).catch(() => false), true);

    const firstFieldRulesRaw = await fs.readFile(fieldRulesPath, 'utf8');
    const firstKnownValuesRaw = await fs.readFile(knownValuesPath, 'utf8');
    const firstUiCatalogRaw = await fs.readFile(uiCatalogPath, 'utf8');
    const firstKnownValues = JSON.parse(firstKnownValuesRaw);
    assert.equal(typeof firstKnownValues.fields, 'object');
    assert.equal((first.compile_report?.counts?.component_types || 0) > 0, true);
    assert.equal(typeof first.compile_report?.source_summary?.enum_lists, 'number');
    assert.equal(typeof first.compile_report?.diff?.fields?.changed_count, 'number');

    const second = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });
    assert.equal(second.compiled, true);

    const secondFieldRulesRaw = await fs.readFile(fieldRulesPath, 'utf8');
    const secondKnownValuesRaw = await fs.readFile(knownValuesPath, 'utf8');
    const secondUiCatalogRaw = await fs.readFile(uiCatalogPath, 'utf8');

    assert.equal(secondFieldRulesRaw, firstFieldRulesRaw);
    assert.equal(secondKnownValuesRaw, firstKnownValuesRaw);
    assert.equal(secondUiCatalogRaw, firstUiCatalogRaw);
    assert.equal(second.compile_report?.diff?.changed, false);
    assert.equal(second.compile_report?.diff?.fields?.changed_count, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('compileCategoryFieldStudio falls back to app-native compile when field studio source is missing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-category-compile-app-native-fallback-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  const categoryRoot = path.join(helperRoot, 'mouse');
  await fs.mkdir(categoryRoot, { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath(tempRoot);
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });

    const generatedRoot = path.join(categoryRoot, '_generated');
    await seedComponentDb(generatedRoot);

    const baselineCompile = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(baselineCompile.compiled, true);
    assert.equal(baselineCompile.field_count > 0, true);
    assert.equal(Object.hasOwn(baselineCompile, 'workbook_hash'), false);
    assert.equal(baselineCompile.compile_report?.compile_mode, 'field_studio');

    const missingFieldStudioSourcePath = path.join(categoryRoot, 'missing-field-studio-source.xlsm');
    const fallbackMap = {
      ...fieldStudioMap,
      field_studio_source_path: missingFieldStudioSourcePath,
    };
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap: fallbackMap,
      config: { categoryAuthorityRoot: helperRoot },
    });

    const fallbackCompile = await compileCategoryFieldStudio({
      category: 'mouse',
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(fallbackCompile.compiled, true, JSON.stringify(fallbackCompile.errors || []));
    assert.equal(fallbackCompile.field_studio_source_hash, null);
    assert.equal(Object.hasOwn(fallbackCompile, 'workbook_hash'), false);
    assert.equal(fallbackCompile.field_count, baselineCompile.field_count);
    assert.equal(fallbackCompile.compile_report?.compile_mode, 'field_studio');
    assert.equal(
      (fallbackCompile.warnings || []).some((warning) => String(warning).includes('app-native compile fallback')),
      true,
      `expected app-native fallback warning, got: ${JSON.stringify(fallbackCompile.warnings || [])}`,
    );

    assert.equal(await fs.stat(path.join(generatedRoot, 'field_rules.json')).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(path.join(generatedRoot, 'component_db', 'sensors.json')).then(() => true).catch(() => false), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('compileCategoryFieldStudio ignores sheet column bindings on scratch component sources', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-category-compile-scratch-guard-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(path.join(helperRoot, 'mouse'), { recursive: true });
  const fieldStudioSourcePath = mouseFieldStudioSourcePath(tempRoot);
  const workbookModeSensorSource = {
    type: 'sensor',
    mode: 'sheet',
    sheet: 'sensors',
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
        },
      ],
    },
  };
  const fieldStudioMap = buildMouseFieldStudioMap(fieldStudioSourcePath);
  fieldStudioMap.component_sources = [workbookModeSensorSource];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });
    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    await seedComponentDb(generatedRoot);
    const baseline = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });
    assert.equal(baseline.compiled, true);
    const baselineSensors = JSON.parse(await fs.readFile(path.join(generatedRoot, 'component_db', 'sensors.json'), 'utf8'));
    const baselineSensorCount = Array.isArray(baselineSensors.items) ? baselineSensors.items.length : 0;

    fieldStudioMap.component_sources = [
      workbookModeSensorSource,
      {
        type: 'sensor',
        mode: 'scratch',
        sheet: 'sensors',
        header_row: 1,
        first_data_row: 2,
        stop_after_blank_primary: 10,
        roles: {
          primary_identifier: 'A',
          maker: '',
          aliases: [],
          links: [],
          properties: [],
        },
      },
    ];

    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });
    const withScratch = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath: fieldStudioSourcePath,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });
    assert.equal(withScratch.compiled, true, JSON.stringify(withScratch.errors || []));
    const scratchSensors = JSON.parse(await fs.readFile(path.join(generatedRoot, 'component_db', 'sensors.json'), 'utf8'));
    const scratchSensorCount = Array.isArray(scratchSensors.items) ? scratchSensors.items.length : 0;
    assert.equal(scratchSensorCount, baselineSensorCount);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

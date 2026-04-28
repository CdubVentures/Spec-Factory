import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  compileCategoryFieldStudio,
  loadFieldStudioMap,
  saveFieldStudioMap,
  validateFieldStudioMap,
} from '../../categoryCompile.js';
import { createMouseFieldStudioSourcePath } from '../../../field-rules/tests/fixtures/mouseFieldStudioWorkbookFixture.js';

export {
  compileCategoryFieldStudio,
  loadFieldStudioMap,
  saveFieldStudioMap,
  validateFieldStudioMap,
};

export function mouseFieldStudioSourcePath(rootDir) {
  if (rootDir) {
    return createMouseFieldStudioSourcePath(rootDir);
  }
  return createMouseFieldStudioSourcePath(fs.mkdtempSync(path.join(os.tmpdir(), 'spec-factory-field-studio-')));
}

export function buildMouseFieldStudioMap(fieldStudioSourcePath) {
  return {
    version: 1,
    field_studio_source_path: fieldStudioSourcePath,
    sheet_roles: [
      { sheet: 'dataEntry', role: 'product_table' },
      { sheet: 'dataEntry', role: 'field_key_list' },
    ],
    key_list: {
      sheet: 'dataEntry',
      source: 'column_range',
      column: 'B',
      row_start: 9,
      row_end: 83,
    },
    product_table: {
      sheet: 'dataEntry',
      layout: 'matrix',
      brand_row: 3,
      model_row: 4,
      variant_row: 5,
      value_col_start: 'C',
      value_col_end: '',
      sample_columns: 18,
    },
    expectations: {
      required_fields: ['connection', 'weight', 'dpi'],
      critical_fields: ['polling_rate'],
      expected_easy_fields: ['side_buttons'],
      expected_sometimes_fields: ['sensor'],
      deep_fields: ['release_date'],
    },
    enum_lists: [],
    field_overrides: {},
    selected_keys: [
      'connection', 'connectivity', 'weight', 'lngth', 'width', 'height',
      'dpi', 'polling_rate', 'sensor', 'sensor_brand', 'switch', 'switch_brand',
      'side_buttons', 'middle_buttons', 'release_date', 'shape', 'coating',
      'feet_material', 'lighting', 'cable_length', 'encoder', 'mcu',
      'click_latency', 'sensor_latency', 'lift_off_distance', 'form_factor',
      'click_latency_list', 'sensor_latency_list', 'click_force', 'shift_latency',
    ],
    component_sources: [
      {
        component_type: 'sensor',
        roles: {
          properties: [
            { field_key: 'dpi', type: 'number', unit: 'dpi', variance_policy: 'upper_bound' },
          ],
        },
      },
      {
        component_type: 'switch',
        roles: {
          properties: [],
        },
      },
      {
        component_type: 'encoder',
        roles: {
          properties: [],
        },
      },
    ],
  };
}

export async function createMouseCompileWorkspace({
  localWorkbook = false,
  tempPrefix = 'spec-harvester-category-compile-',
} = {}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), tempPrefix));
  const helperRoot = path.join(tempRoot, 'category_authority');
  const categoryRoot = path.join(helperRoot, 'mouse');
  await fs.mkdir(categoryRoot, { recursive: true });

  const sourceFieldStudioSourcePath = mouseFieldStudioSourcePath(tempRoot);
  const fieldStudioSourcePath = localWorkbook
    ? path.join(categoryRoot, 'mouseData.xlsm')
    : sourceFieldStudioSourcePath;

  if (localWorkbook) {
    await fs.copyFile(sourceFieldStudioSourcePath, fieldStudioSourcePath);
  }

  return {
    tempRoot,
    helperRoot,
    categoryRoot,
    generatedRoot: path.join(categoryRoot, '_generated'),
    fieldStudioSourcePath,
    fieldStudioMap: buildMouseFieldStudioMap(fieldStudioSourcePath),
    cleanup: () => fs.rm(tempRoot, { recursive: true, force: true }),
  };
}

export async function seedComponentDb(generatedRoot, components = {}) {
  const componentRoot = path.join(generatedRoot, 'component_db');
  await fs.mkdir(componentRoot, { recursive: true });
  const defaults = {
    sensors: {
      component_type: 'sensor',
      items: [
        { name: 'PAW3950', maker: 'PixArt', aliases: ['paw-3950'], links: [], properties: { dpi: 30000 } },
        { name: 'HERO 2', maker: 'Logitech', aliases: ['hero-2'], links: [], properties: { dpi: 44000 } },
        { name: 'Focus Pro Gen 2', maker: 'Razer', aliases: ['focus-pro-gen-2'], links: [], properties: { dpi: 30000 } },
      ],
    },
    switches: {
      component_type: 'switch',
      items: [
        { name: 'Optical Gen 3', maker: 'Razer', aliases: ['optical-gen-3'], links: [], properties: {} },
        { name: 'Lightforce', maker: 'Logitech', aliases: ['lightforce'], links: [], properties: {} },
      ],
    },
    encoders: {
      component_type: 'encoder',
      items: [
        { name: 'TTC Gold', maker: 'TTC', aliases: ['ttc-gold'], links: [], properties: {} },
      ],
    },
    materials: {
      component_type: 'material',
      items: [
        { name: 'PTFE', maker: '', aliases: ['ptfe'], links: [], properties: {} },
      ],
    },
  };
  const merged = { ...defaults, ...components };
  for (const [fileName, data] of Object.entries(merged)) {
    await fs.writeFile(
      path.join(componentRoot, `${fileName}.json`),
      JSON.stringify(data, null, 2),
      'utf8',
    );
  }
}

export function assertSubsetDeep(expected, actual, pathLabel = 'root') {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      throw new assert.AssertionError({
        message: `${pathLabel} expected array`,
        actual,
        expected,
      });
    }
    if (actual.length !== expected.length) {
      throw new assert.AssertionError({
        message: `${pathLabel} length mismatch`,
        actual: actual.length,
        expected: expected.length,
      });
    }
    for (let index = 0; index < expected.length; index += 1) {
      assertSubsetDeep(expected[index], actual[index], `${pathLabel}[${index}]`);
    }
    return;
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') {
      throw new assert.AssertionError({
        message: `${pathLabel} expected object`,
        actual,
        expected,
      });
    }
    for (const key of Object.keys(expected)) {
      if (!Object.prototype.hasOwnProperty.call(actual, key)) {
        throw new assert.AssertionError({
          message: `${pathLabel}.${key} missing`,
          actual,
          expected,
        });
      }
      assertSubsetDeep(expected[key], actual[key], `${pathLabel}.${key}`);
    }
    return;
  }
  if (actual !== expected) {
    throw new assert.AssertionError({
      message: `${pathLabel} mismatch`,
      actual,
      expected,
    });
  }
}

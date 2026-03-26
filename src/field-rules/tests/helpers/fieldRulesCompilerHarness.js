import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createMouseFieldStudioSourcePath } from '../fixtures/mouseFieldStudioWorkbookFixture.js';

export function createMouseWorkbookPath(rootDir) {
  return createMouseFieldStudioSourcePath(rootDir);
}

export function buildMouseWorkbookMap(workbookPath) {
  return {
    version: 1,
    field_studio_source_path: workbookPath,
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
    component_sheets: [],
    field_overrides: {},
    selected_keys: [
      'brand',
      'model',
      'variant',
      'category',
      'connection',
      'weight',
      'dpi',
      'polling_rate',
      'side_buttons',
      'sensor',
      'release_date',
    ],
  };
}

export function buildMouseWorkbookMapWithOverrides({
  fieldStudioSourcePath = '',
  workbookPath,
  fieldOverrides = {},
  expectations = {},
}) {
  const resolvedSourcePath = String(fieldStudioSourcePath || workbookPath || '').trim();
  const base = buildMouseWorkbookMap(resolvedSourcePath);
  const overrideKeys = Object.keys(fieldOverrides);
  const mergedKeys = [...new Set([...(base.selected_keys || []), ...overrideKeys])];

  return {
    ...base,
    selected_keys: mergedKeys,
    expectations: {
      ...base.expectations,
      ...expectations,
    },
    field_overrides: fieldOverrides,
  };
}

export async function createCompilerWorkspace(prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const helperRoot = path.join(root, 'category_authority');
  const categoriesRoot = path.join(root, 'categories');
  return { root, helperRoot, categoriesRoot };
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeRoot(root) {
  await fs.rm(root, { recursive: true, force: true });
}

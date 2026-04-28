import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateFieldStudioMap,
} from './helpers/categoryCompileHarness.js';

test('validateFieldStudioMap reports key_list errors', () => {
  const checked = validateFieldStudioMap({
    version: 1,
    sheet_roles: [],
    key_list: {
      sheet: '',
      source: 'column_range',
    },
  });
  assert.equal(checked.valid, false);
  assert.equal(
    checked.errors.some((row) => String(row).includes('key_list')),
    true,
  );
});

test('validateFieldStudioMap accepts named_range key source', () => {
  const checked = validateFieldStudioMap({
    version: 1,
    sheet_roles: [{ sheet: 'dataEntry', role: 'field_key_list' }],
    key_list: {
      sheet: 'dataEntry',
      source: 'named_range',
      named_range: 'MouseKeys',
    },
  }, {
    sheetNames: ['dataEntry'],
  });
  assert.equal(checked.valid, true);
});

test('validateFieldStudioMap preserves selected_keys order (normalized but not sorted)', () => {
  const checked = validateFieldStudioMap({
    version: 2,
    sheet_roles: [{ sheet: 'dataEntry', role: 'field_key_list' }],
    key_list: {
      sheet: 'dataEntry',
      source: 'column_range',
      column: 'B',
      row_start: 1,
      row_end: 10,
    },
    selected_keys: ['dpi', 'connection', 'dpi', 'weight'],
  });

  assert.equal(checked.valid, true);
  assert.deepEqual(checked.normalized.selected_keys, ['dpi', 'connection', 'weight']);
});

test('validateFieldStudioMap accepts component source property maps without key_list or columns', () => {
  const checked = validateFieldStudioMap({
    version: 2,
    field_studio_source_path: '',
    key_list: null,
    product_table: null,
    data_lists: [
      {
        field: 'switch_type',
        mode: 'scratch',
        sheet: '',
        value_column: '',
        row_start: 2,
        row_end: 0,
        manual_values: ['optical', 'mechanical'],
      },
    ],
    component_sources: [
      {
        component_type: 'switch',
        roles: {
          properties: [
            { field_key: 'switch_type', type: 'string', variance_policy: 'authoritative' },
          ],
        },
      },
    ],
  });

  assert.equal(checked.valid, true);
  assert.equal(
    checked.errors.some((row) => String(row).includes('key_list: sheet is required')),
    false,
  );
  assert.equal(
    checked.errors.some((row) => String(row).includes('invalid property mapping column')),
    false,
  );
});

test('validateFieldStudioMap rejects component source rows without component_type', () => {
  const checked = validateFieldStudioMap({
    version: 2,
    field_studio_source_path: '',
    key_list: null,
    product_table: null,
    component_sources: [
      {
        roles: {
          properties: [
            { field_key: 'switch_type', type: 'string', variance_policy: 'authoritative' },
          ],
        },
      },
    ],
  });

  assert.equal(checked.valid, false);
  assert.equal(
    checked.errors.some((row) => String(row).includes('type is required')),
    true,
  );
});

test('normalizeFieldStudioMap preserves field_groups in order, trimmed and deduped', () => {
  const checked = validateFieldStudioMap({
    version: 2,
    field_groups: ['  Specs ', 'General', '', 'Specs', 'Empty Group'],
  });

  assert.deepEqual(checked.normalized.field_groups, ['Specs', 'General', 'Empty Group']);
});

test('normalizeFieldStudioMap returns empty field_groups when absent', () => {
  const checked = validateFieldStudioMap({ version: 2 });

  assert.deepEqual(checked.normalized.field_groups, []);
});

test('normalizeFieldStudioMap returns empty field_groups when not an array', () => {
  const checked = validateFieldStudioMap({ version: 2, field_groups: 'not-an-array' });

  assert.deepEqual(checked.normalized.field_groups, []);
});

test('validateFieldStudioMap still requires key_list for field-studio-source-backed maps', () => {
  const checked = validateFieldStudioMap({
    version: 2,
    field_studio_source_path: 'mouseData.xlsm',
  }, {
    sheetNames: ['dataEntry'],
  });

  assert.equal(checked.valid, false);
  assert.equal(
    checked.errors.some((row) => String(row).includes('key_list')),
    true,
  );
});

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

test('validateFieldStudioMap accepts scratch-only maps without key_list and blank property columns', () => {
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
        mode: 'scratch',
        type: 'switch',
        sheet: '',
        header_row: 1,
        first_data_row: 2,
        roles: {
          primary_identifier: 'A',
          maker: '',
          aliases: [],
          links: [],
          properties: [
            { field_key: 'switch_type', column: '', type: 'string', variance_policy: 'authoritative' },
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

test('validateFieldStudioMap rejects component_sources sheet mode without sheet binding', () => {
  const checked = validateFieldStudioMap({
    version: 2,
    field_studio_source_path: '',
    key_list: null,
    product_table: null,
    component_sources: [
      {
        type: 'switch',
        sheet: '',
        header_row: 1,
        first_data_row: 2,
        roles: {
          primary_identifier: 'A',
          maker: '',
          aliases: [],
          links: [],
          properties: [
            { field_key: 'switch_type', column: '', type: 'string', variance_policy: 'authoritative' },
          ],
        },
      },
    ],
  });

  assert.equal(checked.valid, false);
  assert.equal(
    checked.errors.some((row) => String(row).includes('component_sources: sheet is required when mode=sheet')),
    true,
  );
});

test('validateFieldStudioMap still requires key_list for field-studio-source-backed component maps', () => {
  const checked = validateFieldStudioMap({
    version: 2,
    sheet_roles: [{ sheet: 'dataEntry', role: 'product_table' }],
    component_sources: [
      {
        type: 'sensor',
        source: 'field_studio_source',
        sheet: 'sensors',
        roles: {
          primary_identifier: 'C',
          maker: 'B',
          aliases: [],
          links: [],
          properties: [],
        },
      },
    ],
  }, {
    sheetNames: ['dataEntry', 'sensors'],
  });

  assert.equal(checked.valid, false);
  assert.equal(
    checked.errors.some((row) => String(row).includes('key_list')),
    true,
  );
});

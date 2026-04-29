import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeFieldStudioMap } from '../compileMapNormalization.js';

test('normalizeFieldStudioMap characterizes representative normalized studio map output', () => {
  const normalized = normalizeFieldStudioMap({
    version: '3',
    key_list: {
      sheet: 'Keys',
      source: 'table_column',
      column: 'b',
      row_start: '2',
      row_end: '6',
    },
    product_table: {
      sheet: 'Products',
      layout: 'matrix',
      key_column: 'A',
      value_col_start: 'C',
      header_row: '1',
      data_row_start: '2',
    },
    data_lists: [
      {
        field: ' Connection ',
        mode: 'sheet',
        sheet: 'Enums',
        value_column: 'd',
        normalize: 'csv',
        row_start: '3',
        manual_values: [' wired ', 'wireless', 'wired'],
        priority: { required_level: 'mandatory' },
        ai_assist: { reasoning_note: ' enum note ' },
      },
    ],
    component_sources: [
      {
        sheet: 'Sensors',
        type: 'sensor',
        roles: {
          primary_identifier: 'A',
          maker: 'B',
          aliases: ['C'],
          properties: [
            {
              field_key: 'dpi',
              column: 'D',
              type: 'number',
              variance_policy: 'range',
            },
          ],
        },
        priority: { difficulty: 'very_hard' },
        ai_assist: { reasoning_note: 'component note' },
      },
    ],
    field_overrides: {
      empty_ai: {
        ai_assist: { reasoning_note: '' },
        evidence_required: true,
        evidence: {
          required: true,
          conflict_policy: 'manual',
          min_evidence_refs: 2,
        },
      },
      color_edition_enabled: {
        ai_assist: { color_edition_context: { enabled: false } },
      },
      pif_bool: {
        ai_assist: { pif_priority_images: true },
      },
      pif_enabled: {
        ai_assist: { pif_priority_images: { enabled: true } },
      },
    },
    tooltip_file: 'tooltips.json',
    field_groups: ['Core', 'Core', ' Specs '],
  });

  assert.deepEqual(normalized, {
    version: 3,
    field_studio_source_path: '',
    sheet_roles: [],
    key_list: {
      sheet: 'Keys',
      source: 'column_range',
      named_range: '',
      range: '',
      column: 'B',
      row_start: 2,
      row_end: 6,
    },
    key_source: {
      sheet: 'Keys',
      source: 'column_range',
      range: 'B2:B6',
      named_range: null,
      column: 'B',
      row_start: 2,
      row_end: 6,
    },
    product_table: {
      sheet: 'Products',
      layout: 'matrix',
      key_column: 'A',
      header_row: 1,
      data_row_start: 2,
      brand_row: 3,
      model_row: 4,
      variant_row: 5,
      id_row: 0,
      identifier_row: 0,
      value_col_start: 'C',
      value_col_end: '',
      sample_columns: 0,
    },
    sampling: {
      sheet: 'Products',
      layout: 'matrix',
      key_column: 'A',
      first_key_row: 2,
      value_start_column: 'C',
      sample_columns: 0,
      brand_row: 3,
      model_row: 4,
      variant_row: 5,
    },
    data_lists: [
      {
        field: 'connection',
        mode: 'sheet',
        sheet: 'Enums',
        value_column: 'D',
        header_row: 0,
        row_start: 3,
        row_end: 0,
        delimiter: '',
        manual_values: ['wired', 'wireless'],
      },
    ],
    enum_lists: [
      {
        sheet: 'Enums',
        field: 'connection',
        value_column: 'D',
        row_start: 3,
        row_end: 0,
        delimiter: '',
        header_row: 0,
      },
    ],
    enum_sources: [
      {
        sheet: 'Enums',
        bucket: 'connection',
        column: 'D',
        header_row: null,
        start_row: 3,
        end_row: null,
        delimiter: '',
      },
    ],
    component_sources: [
      {
        component_type: 'sensor',
        roles: {
          properties: [
            {
              field_key: 'dpi',
              type: 'number',
              unit: '',
              variance_policy: 'range',
            },
          ],
        },
      },
    ],
    expectations: {
      required_fields: [],
      critical_fields: [],
      expected_easy_fields: [],
      expected_sometimes_fields: [],
      deep_fields: [],
    },
    selected_keys: [],
    version_note: '',
    field_overrides: {
      empty_ai: {
        evidence: { min_evidence_refs: 2 },
      },
      color_edition_enabled: {
        ai_assist: { color_edition_context: { enabled: false } },
      },
      pif_bool: {
        ai_assist: { pif_priority_images: true },
      },
      pif_enabled: {
        ai_assist: { pif_priority_images: { enabled: true } },
      },
    },
    ui_defaults: {},
    tooltip_source: {
      path: 'tooltips.json',
      format: 'json',
    },
    identity: {
      min_identifiers: 2,
      anti_merge_rules: [],
    },
    field_groups: ['Core', 'Specs'],
    eg_toggles: {},
  });
});

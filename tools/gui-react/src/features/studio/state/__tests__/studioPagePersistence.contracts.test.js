import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadStudioPagePersistence,
} from './helpers/studioPageContractsHarness.js';

test('studio page persistence strips transient edited flags without mutating the source rules', async () => {
  const { stripEditedFlagFromRules } = await loadStudioPagePersistence();

  const sourceRules = {
    sku: {
      _edited: true,
      required_level: 'required',
      ui: {
        label: 'SKU',
      },
    },
  };

  const stripped = stripEditedFlagFromRules(sourceRules);

  assert.deepEqual(stripped, {
    sku: {
      required_level: 'required',
      ui: {
        label: 'SKU',
      },
    },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(sourceRules.sku, '_edited'), true);
});

test('studio page persistence builds a rename-aware autosave payload from the field-rules snapshot', async () => {
  const { buildStudioPersistMap } = await loadStudioPagePersistence();

  const payload = buildStudioPersistMap({
    baseMap: {
      version: 2,
      selected_keys: ['legacy_key'],
      field_overrides: {
        legacy_key: {
          enum_name: 'LegacyEnum',
        },
      },
      enum_lists: [
        {
          field: 'legacy_key',
          values: ['Legacy'],
        },
      ],
      data_lists: [
        {
          field: 'legacy_key',
          normalize: 'csv',
        },
      ],
      component_sources: [
        {
          component_type: 'sensor',
          roles: {
            properties: [
              {
                field_key: 'legacy_key',
              },
            ],
          },
        },
      ],
    },
    snapshot: {
      fieldOrder: ['__grp::identity', 'legacy_key', 'fresh_key'],
      rules: {
        legacy_key: {
          _edited: true,
          required_level: 'required',
        },
        fresh_key: {
          _edited: true,
          required_level: 'optional',
        },
      },
      renames: {
        legacy_key: 'modern_key',
      },
    },
  });

  assert.deepEqual(payload.selected_keys, ['modern_key', 'fresh_key']);
  assert.deepEqual(payload.field_overrides, {
    modern_key: {
      required_level: 'required',
    },
    fresh_key: {
      required_level: 'optional',
    },
  });
  assert.deepEqual(payload.data_lists, [
    {
      field: 'modern_key',
      normalize: 'csv',
    },
  ]);
  assert.deepEqual(payload.enum_lists, [
    {
      field: 'modern_key',
      values: ['Legacy'],
    },
  ]);
  assert.deepEqual(payload.component_sources, [
    {
      component_type: 'sensor',
      roles: {
        properties: [
          {
            field_key: 'modern_key',
          },
        ],
      },
    },
  ]);
});

test('studio page persistence propagates renames into expectations field-key arrays', async () => {
  const { buildStudioPersistMap } = await loadStudioPagePersistence();

  const payload = buildStudioPersistMap({
    baseMap: {
      version: 2,
      selected_keys: ['old_field'],
      field_overrides: {},
      expectations: {
        required_fields: ['old_field', 'other_field'],
        critical_fields: ['old_field'],
        expected_easy_fields: ['other_field'],
        expected_sometimes_fields: [],
        deep_fields: ['old_field', 'deep_only'],
      },
    },
    snapshot: {
      fieldOrder: ['old_field'],
      rules: {
        old_field: { required_level: 'required' },
      },
      renames: { old_field: 'new_field' },
    },
  });

  assert.deepEqual(payload.expectations.required_fields, ['new_field', 'other_field']);
  assert.deepEqual(payload.expectations.critical_fields, ['new_field']);
  assert.deepEqual(payload.expectations.expected_easy_fields, ['other_field']);
  assert.deepEqual(payload.expectations.expected_sometimes_fields, []);
  assert.deepEqual(payload.expectations.deep_fields, ['new_field', 'deep_only']);
});

test('studio page persistence prunes orphaned field_overrides keys not in fieldOrder', async () => {
  const { buildStudioPersistMap } = await loadStudioPagePersistence();

  const payload = buildStudioPersistMap({
    baseMap: {
      version: 2,
      selected_keys: [],
      field_overrides: {},
    },
    snapshot: {
      fieldOrder: ['__grp::main', 'active_key'],
      rules: {
        active_key: { required_level: 'required' },
        orphaned_key: { required_level: 'optional' },
      },
      renames: {},
    },
  });

  assert.deepEqual(payload.selected_keys, ['active_key']);
  assert.ok('active_key' in payload.field_overrides, 'active_key should be in field_overrides');
  assert.ok(!('orphaned_key' in payload.field_overrides), 'orphaned_key should be pruned from field_overrides');
  assert.deepEqual(payload.field_groups, ['main'], 'field_groups should be extracted from __grp:: markers');
});

test('studio page persistence extracts field_groups from __grp:: markers preserving order and deduplicating', async () => {
  const { buildStudioPersistMap } = await loadStudioPagePersistence();

  const payload = buildStudioPersistMap({
    baseMap: { version: 2, selected_keys: [], field_overrides: {} },
    snapshot: {
      fieldOrder: ['__grp::Specs', 'dpi', '__grp::General', 'brand', '__grp::Empty', '__grp::Specs'],
      rules: {
        dpi: { required_level: 'required' },
        brand: { required_level: 'optional' },
      },
      renames: {},
    },
  });

  assert.deepEqual(payload.field_groups, ['Specs', 'General', 'Empty']);
  assert.deepEqual(payload.selected_keys, ['dpi', 'brand']);
});

test('studio page persistence returns empty field_groups when fieldOrder has no group markers', async () => {
  const { buildStudioPersistMap } = await loadStudioPagePersistence();

  const payload = buildStudioPersistMap({
    baseMap: { version: 2, selected_keys: [], field_overrides: {} },
    snapshot: {
      fieldOrder: ['sku', 'weight'],
      rules: {
        sku: { required_level: 'required' },
        weight: { required_level: 'optional' },
      },
      renames: {},
    },
  });

  assert.deepEqual(payload.field_groups, []);
});

test('studio page persistence keeps autosave attempt gating stable for force and duplicate fingerprints', async () => {
  const { shouldPersistStudioDocsAttempt } = await loadStudioPagePersistence();

  assert.equal(
    shouldPersistStudioDocsAttempt({
      force: false,
      nextFingerprint: 'next-docs',
      lastSavedFingerprint: 'saved-docs',
      lastAttemptFingerprint: 'attempt-docs',
    }),
    true,
  );

  assert.equal(
    shouldPersistStudioDocsAttempt({
      force: false,
      nextFingerprint: 'saved-docs',
      lastSavedFingerprint: 'saved-docs',
      lastAttemptFingerprint: 'attempt-docs',
    }),
    false,
  );

  assert.equal(
    shouldPersistStudioDocsAttempt({
      force: false,
      nextFingerprint: 'attempt-docs',
      lastSavedFingerprint: 'saved-docs',
      lastAttemptFingerprint: 'attempt-docs',
    }),
    false,
  );

  assert.equal(
    shouldPersistStudioDocsAttempt({
      force: true,
      nextFingerprint: 'saved-docs',
      lastSavedFingerprint: 'saved-docs',
      lastAttemptFingerprint: 'saved-docs',
    }),
    true,
  );
});

test('studio page persistence preserves data_lists and enum_lists through the base map', async () => {
  const { buildStudioPersistMap } = await loadStudioPagePersistence();

  const payload = buildStudioPersistMap({
    baseMap: {
      version: 2,
      selected_keys: ['field_a'],
      field_overrides: {},
      data_lists: [
        { field: 'field_a', normalize: 'csv' },
      ],
      enum_lists: [
        { field: 'field_a', values: ['ValueA'] },
      ],
    },
    snapshot: {
      fieldOrder: ['field_a'],
      rules: {
        field_a: { required_level: 'required' },
      },
      renames: {},
    },
  });

  // WHY: buildStudioPersistMap saves selected_keys + field_overrides on
  // top of the full base map. data_lists are live data — only assembleMap
  // (MappingStudioTab) migrates them to enum_lists.
  assert.ok(Array.isArray(payload.data_lists), 'data_lists must be preserved');
  assert.deepEqual(payload.data_lists, [{ field: 'field_a', normalize: 'csv' }]);
  assert.ok(Array.isArray(payload.enum_lists), 'enum_lists must be preserved');
});

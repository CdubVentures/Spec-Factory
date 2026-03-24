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
      manual_enum_values: {
        legacy_key: ['Legacy'],
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
  assert.deepEqual(payload.manual_enum_values, {
    modern_key: ['Legacy'],
  });
  assert.deepEqual(payload.enum_lists, [
    {
      field: 'modern_key',
      values: ['Legacy'],
    },
  ]);
  assert.deepEqual(payload.data_lists, [
    {
      field: 'modern_key',
      normalize: 'csv',
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

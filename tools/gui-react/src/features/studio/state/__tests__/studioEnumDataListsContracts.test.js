import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadStudioEnumDataLists() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioEnumDataLists.ts',
    {
      prefix: 'studio-enum-data-lists-',
    },
  );
}

test('studio enum data lists are key-derived, value-preserving, and sorted', async () => {
  const { deriveStudioEnumDataLists } = await loadStudioEnumDataLists();

  const lists = deriveStudioEnumDataLists({
    rawEnumLists: [
      { field: 'shape', values: ['ergonomic'], normalize: 'lower_trim' },
      { field: 'legacy_open_list', values: ['keep'] },
    ],
    rules: {
      connection: {
        enum: { policy: 'open_prefer_known', source: 'data_lists.connection' },
      },
      form_factor: {
        enum_policy: 'closed',
        enum_source: { type: 'known_values', ref: 'form_factor' },
      },
      free_text: {
        enum: { policy: 'open', source: null },
      },
      shape: {
        enum: { policy: 'closed', source: 'data_lists.shape' },
      },
    },
    egLockedKeys: [],
    knownValues: {},
  });

  assert.deepEqual(
    lists.map((entry) => ({ field: entry.field, values: entry.manual_values })),
    [
      { field: 'connection', values: [] },
      { field: 'form_factor', values: [] },
      { field: 'legacy_open_list', values: ['keep'] },
      { field: 'shape', values: ['ergonomic'] },
    ],
  );
});

test('studio enum data lists use rule labels for names and alphabetical sorting', async () => {
  const { deriveStudioEnumDataLists } = await loadStudioEnumDataLists();

  const lists = deriveStudioEnumDataLists({
    rawEnumLists: [
      { field: 'z_key', values: ['z'] },
      { field: 'a_key', values: ['a'] },
    ],
    rules: {
      a_key: {
        label: 'Zulu Label',
        enum: { policy: 'closed', source: 'data_lists.a_key' },
      },
      z_key: {
        ui: { label: 'Alpha Label' },
        enum: { policy: 'closed', source: 'data_lists.z_key' },
      },
    },
    egLockedKeys: [],
    knownValues: {},
  });

  assert.deepEqual(
    lists.map((entry) => ({ field: entry.field, label: entry.label })),
    [
      { field: 'z_key', label: 'Alpha Label' },
      { field: 'a_key', label: 'Zulu Label' },
    ],
  );
});

test('studio enum data lists auto-create EG known lists without duplicating map rows', async () => {
  const { deriveStudioEnumDataLists } = await loadStudioEnumDataLists();

  const lists = deriveStudioEnumDataLists({
    rawEnumLists: [{ field: 'color', values: ['black'] }],
    rules: {},
    egLockedKeys: ['color', 'editions'],
    knownValues: {
      color: ['white'],
      editions: ['standard'],
    },
  });

  assert.deepEqual(
    lists.map((entry) => ({ field: entry.field, values: entry.manual_values })),
    [
      { field: 'color', values: ['black'] },
      { field: 'editions', values: ['standard'] },
    ],
  );
});

test('studio enum data list seed version changes when derived list inputs change', async () => {
  const { buildStudioEnumDataListSeedVersion } = await loadStudioEnumDataLists();

  const base = buildStudioEnumDataListSeedVersion({
    rawEnumLists: [],
    rules: {
      connection: { enum: { policy: 'open', source: null } },
    },
    egLockedKeys: ['color'],
    knownValues: { color: ['black'] },
  });
  const withKnownPolicy = buildStudioEnumDataListSeedVersion({
    rawEnumLists: [],
    rules: {
      connection: {
        enum: { policy: 'open_prefer_known', source: 'data_lists.connection' },
      },
    },
    egLockedKeys: ['color'],
    knownValues: { color: ['black'] },
  });
  const withKnownValueChange = buildStudioEnumDataListSeedVersion({
    rawEnumLists: [],
    rules: {
      connection: { enum: { policy: 'open', source: null } },
    },
    egLockedKeys: ['color'],
    knownValues: { color: ['white'] },
  });

  assert.notEqual(base, withKnownPolicy);
  assert.notEqual(base, withKnownValueChange);
});

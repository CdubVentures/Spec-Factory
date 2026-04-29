import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  removeEnumValueFromDurableSources,
  renameEnumValueInDurableSources,
} from '../enumMutationService.js';

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createHarness() {
  const root = path.join('.tmp', `_test_enum_sources_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const categoryAuthorityRoot = path.join(root, 'authority');
  const localOutputRoot = path.join(root, 'output');
  const mapPath = path.join(categoryAuthorityRoot, 'mouse', '_control_plane', 'field_studio_map.json');
  const discoveredPath = path.join(localOutputRoot, 'mouse', 'discovered_enums.json');
  const suggestionsPath = path.join(categoryAuthorityRoot, 'mouse', '_suggestions', 'enums.json');

  writeJson(mapPath, {
    data_lists: [
      { field: 'connection', manual_values: ['wired', 'wireless'] },
      { field: 'shape', manual_values: ['symmetrical'] },
    ],
  });
  writeJson(discoveredPath, {
    category: 'mouse',
    version: 1,
    values: {
      connection: [
        { value: 'wired', first_seen_at: '2026-01-01T00:00:00.000Z' },
        { value: 'bluetooth', first_seen_at: '2026-01-02T00:00:00.000Z' },
      ],
    },
  });
  writeJson(suggestionsPath, {
    suggestions: [
      { field_key: 'connection', value: 'wired', status: 'pending' },
      { field_key: 'connection', value: 'bluetooth', status: 'pending' },
    ],
  });

  return {
    root,
    config: { categoryAuthorityRoot, localOutputRoot },
    mapPath,
    discoveredPath,
    suggestionsPath,
  };
}

test('removeEnumValueFromDurableSources removes manual and discovered enum sources without deleting other candidates', () => {
  const harness = createHarness();
  try {
    const result = removeEnumValueFromDurableSources({
      category: 'mouse',
      field: 'connection',
      value: 'wired',
      config: harness.config,
    });

    assert.equal(result.changed, true);
    assert.deepEqual(readJson(harness.mapPath).data_lists[0].manual_values, ['wireless']);
    assert.deepEqual(
      readJson(harness.discoveredPath).values.connection.map((entry) => entry.value),
      ['bluetooth'],
    );
    assert.equal(readJson(harness.suggestionsPath).suggestions[0].status, 'deleted');
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true });
  }
});

test('renameEnumValueInDurableSources renames manual and discovered enum sources for rebuild', () => {
  const harness = createHarness();
  try {
    const result = renameEnumValueInDurableSources({
      category: 'mouse',
      field: 'connection',
      oldValue: 'wired',
      newValue: 'cabled',
      config: harness.config,
    });

    assert.equal(result.changed, true);
    assert.deepEqual(readJson(harness.mapPath).data_lists[0].manual_values, ['cabled', 'wireless']);
    assert.deepEqual(
      readJson(harness.discoveredPath).values.connection.map((entry) => entry.value),
      ['cabled', 'bluetooth'],
    );
    assert.equal(readJson(harness.suggestionsPath).suggestions[0].value, 'cabled');
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true });
  }
});

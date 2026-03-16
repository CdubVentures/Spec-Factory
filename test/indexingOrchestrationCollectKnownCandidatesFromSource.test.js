import test from 'node:test';
import assert from 'node:assert/strict';
import { collectKnownCandidatesFromSource } from '../src/features/indexing/orchestration/index.js';

test('collectKnownCandidatesFromSource returns first value map and known-field list excluding unk/empty', () => {
  const result = collectKnownCandidatesFromSource([
    { field: 'dpi', value: '26000' },
    { field: 'dpi', value: '32000' },
    { field: 'weight_g', value: 60 },
    { field: 'polling_hz', value: 'unk' },
    { field: '', value: 'x' },
    { field: 'sensor', value: '' },
  ]);

  assert.deepEqual(result.sourceFieldValueMap, {
    dpi: '26000',
    weight_g: '60'
  });
  assert.deepEqual(result.knownCandidatesFromSource, ['dpi', 'dpi', 'weight_g']);
});


import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyProvenance,
  ensureProvenanceField,
  tsvRowFromFields
} from '../provenanceHelpers.js';

test('createEmptyProvenance creates entries for all fields', () => {
  const result = createEmptyProvenance(['sensor', 'dpi'], { sensor: 'Focus Pro', dpi: '35000' });
  assert.equal(result.sensor.value, 'Focus Pro');
  assert.equal(result.dpi.value, '35000');
  assert.equal(result.sensor.confirmations, 0);
  assert.deepStrictEqual(result.sensor.evidence, []);
});

test('ensureProvenanceField creates missing field entry', () => {
  const prov = {};
  const result = ensureProvenanceField(prov, 'sensor', 'unk');
  assert.equal(result.value, 'unk');
  assert.equal(prov.sensor.pass_target, 1);
});

test('ensureProvenanceField returns existing field entry', () => {
  const prov = { sensor: { value: 'Focus Pro', confirmations: 3, evidence: [] } };
  const result = ensureProvenanceField(prov, 'sensor');
  assert.equal(result.value, 'Focus Pro');
  assert.equal(result.confirmations, 3);
});

test('tsvRowFromFields joins field values with tab', () => {
  const result = tsvRowFromFields(['sensor', 'dpi', 'weight'], { sensor: 'Focus Pro', dpi: '35000' });
  assert.equal(result, 'Focus Pro\t35000\t');
});

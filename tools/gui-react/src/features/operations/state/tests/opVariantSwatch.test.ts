import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { variantHexPartsForOp } from '../opVariantSwatch.ts';
import type { Operation } from '../operationsStore.ts';

const HEX_MAP = new Map<string, string>([
  ['black', '#3A3F41'],
  ['white', '#ffffff'],
  ['red', '#ef4444'],
  ['light-blue', '#60a5fa'],
]);

function makeOp(overrides: Partial<Operation> = {}): Pick<Operation, 'type' | 'variantKey'> {
  return { type: 'pif', variantKey: 'color:black', ...overrides };
}

describe('variantHexPartsForOp', () => {
  it('returns hex parts for pif op with single-color variant', () => {
    const result = variantHexPartsForOp(makeOp({ type: 'pif', variantKey: 'color:black' }), HEX_MAP);
    assert.deepEqual(result, ['#3A3F41']);
  });

  it('returns hex parts for rdf op with single-color variant', () => {
    const result = variantHexPartsForOp(makeOp({ type: 'rdf', variantKey: 'color:white' }), HEX_MAP);
    assert.deepEqual(result, ['#ffffff']);
  });

  it('returns multi-color parts for multi-atom variant key', () => {
    const result = variantHexPartsForOp(makeOp({ type: 'pif', variantKey: 'color:black+red' }), HEX_MAP);
    assert.deepEqual(result, ['#3A3F41', '#ef4444']);
  });

  it('returns empty for cef op (CEF has no variant — it IS the generator)', () => {
    const result = variantHexPartsForOp(makeOp({ type: 'cef', variantKey: 'color:black' }), HEX_MAP);
    assert.deepEqual(result, []);
  });

  it('returns empty for unknown op type', () => {
    const result = variantHexPartsForOp(makeOp({ type: 'publisher', variantKey: 'color:black' }), HEX_MAP);
    assert.deepEqual(result, []);
  });

  it('returns empty for missing variantKey', () => {
    const result = variantHexPartsForOp(makeOp({ type: 'pif', variantKey: undefined }), HEX_MAP);
    assert.deepEqual(result, []);
  });

  it('returns empty for empty variantKey', () => {
    const result = variantHexPartsForOp(makeOp({ type: 'pif', variantKey: '' }), HEX_MAP);
    assert.deepEqual(result, []);
  });

  it('returns empty for edition: variantKey (no edition lookup in scope)', () => {
    const result = variantHexPartsForOp(makeOp({ type: 'pif', variantKey: 'edition:launch-edition' }), HEX_MAP);
    assert.deepEqual(result, []);
  });

  it('drops atoms not in hex map (silent filter)', () => {
    const result = variantHexPartsForOp(makeOp({ type: 'pif', variantKey: 'color:black+nonexistent' }), HEX_MAP);
    assert.deepEqual(result, ['#3A3F41']);
  });

  it('returns empty when all atoms are missing from hex map', () => {
    const result = variantHexPartsForOp(makeOp({ type: 'pif', variantKey: 'color:foo+bar' }), HEX_MAP);
    assert.deepEqual(result, []);
  });

  it('handles hyphenated atom names', () => {
    const result = variantHexPartsForOp(makeOp({ type: 'pif', variantKey: 'color:light-blue' }), HEX_MAP);
    assert.deepEqual(result, ['#60a5fa']);
  });
});

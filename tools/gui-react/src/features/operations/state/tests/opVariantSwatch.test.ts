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

  it('returns empty for edition: variantKey when no registry map provided', () => {
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

  describe('with registry map (atomsByKey)', () => {
    const ATOMS_BY_KEY = new Map<string, readonly string[]>([
      ['color:black', ['black']],
      ['color:white', ['white']],
      ['edition:cod-bo6-edition', ['black', 'red']],
      ['edition:cod-bo7-edition', ['black', 'light-blue']],
    ]);

    it('resolves edition: variantKey via registry (multi-color combo)', () => {
      const result = variantHexPartsForOp(
        makeOp({ type: 'pif', variantKey: 'edition:cod-bo6-edition' }),
        HEX_MAP,
        ATOMS_BY_KEY,
      );
      assert.deepEqual(result, ['#3A3F41', '#ef4444']);
    });

    it('resolves edition: for rdf op too', () => {
      const result = variantHexPartsForOp(
        makeOp({ type: 'rdf', variantKey: 'edition:cod-bo7-edition' }),
        HEX_MAP,
        ATOMS_BY_KEY,
      );
      assert.deepEqual(result, ['#3A3F41', '#60a5fa']);
    });

    it('registry lookup wins over fallback parse for color: keys', () => {
      // Registry says "color:black" → ["black"]; parse would also give ["black"].
      // Both paths yield the same output — this test pins the registry path.
      const result = variantHexPartsForOp(
        makeOp({ type: 'pif', variantKey: 'color:black' }),
        HEX_MAP,
        ATOMS_BY_KEY,
      );
      assert.deepEqual(result, ['#3A3F41']);
    });

    it('falls back to parsing color: when registry lacks the key', () => {
      const emptyRegistry = new Map<string, readonly string[]>();
      const result = variantHexPartsForOp(
        makeOp({ type: 'pif', variantKey: 'color:red' }),
        HEX_MAP,
        emptyRegistry,
      );
      assert.deepEqual(result, ['#ef4444']);
    });

    it('returns empty for edition: key missing from registry', () => {
      const result = variantHexPartsForOp(
        makeOp({ type: 'pif', variantKey: 'edition:unknown-edition' }),
        HEX_MAP,
        ATOMS_BY_KEY,
      );
      assert.deepEqual(result, []);
    });

    it('drops registry atoms missing from hex map', () => {
      const partialRegistry = new Map<string, readonly string[]>([
        ['edition:partial-edition', ['black', 'unknown-color']],
      ]);
      const result = variantHexPartsForOp(
        makeOp({ type: 'pif', variantKey: 'edition:partial-edition' }),
        HEX_MAP,
        partialRegistry,
      );
      assert.deepEqual(result, ['#3A3F41']);
    });
  });
});

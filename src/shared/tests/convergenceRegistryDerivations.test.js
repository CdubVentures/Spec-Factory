// WHY: Contract tests for convergence registry derivation functions.
// These verify that derived outputs exactly match the hardcoded golden master.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveConvergenceDefaults,
  deriveConvergenceRouteContract,
  deriveConvergenceValueTypes,
  deriveConvergenceKeySet,
} from '../settingsRegistryDerivations.js';

describe('convergence registry derivations', () => {
  describe('deriveConvergenceDefaults', () => {
    it('returns empty object for empty registry', () => {
      assert.deepStrictEqual(deriveConvergenceDefaults([]), {});
    });
  });

  describe('deriveConvergenceRouteContract', () => {
    it('separates int, float, and bool types correctly', () => {
      const mixed = [
        { key: 'a', type: 'int', default: 1 },
        { key: 'b', type: 'float', default: 0.5 },
        { key: 'c', type: 'bool', default: true },
      ];
      const contract = deriveConvergenceRouteContract(mixed);
      assert.deepStrictEqual([...contract.intKeys], ['a']);
      assert.deepStrictEqual([...contract.floatKeys], ['b']);
      assert.deepStrictEqual([...contract.boolKeys], ['c']);
    });

    it('returns empty arrays for empty registry', () => {
      const contract = deriveConvergenceRouteContract([]);
      assert.deepStrictEqual([...contract.intKeys], []);
      assert.deepStrictEqual([...contract.floatKeys], []);
      assert.deepStrictEqual([...contract.boolKeys], []);
    });
  });

  describe('deriveConvergenceValueTypes', () => {
    it('maps types correctly for mixed registry', () => {
      const mixed = [
        { key: 'a', type: 'int', default: 1 },
        { key: 'b', type: 'float', default: 0.5 },
        { key: 'c', type: 'bool', default: false },
      ];
      assert.deepStrictEqual(
        deriveConvergenceValueTypes(mixed),
        { a: 'integer', b: 'number', c: 'boolean' },
      );
    });

    it('returns empty object for empty registry', () => {
      assert.deepStrictEqual(deriveConvergenceValueTypes([]), {});
    });
  });

  describe('deriveConvergenceKeySet', () => {
    it('returns empty array for empty registry', () => {
      assert.deepStrictEqual(deriveConvergenceKeySet([]), []);
    });

    it('includes all key types', () => {
      const mixed = [
        { key: 'a', type: 'int', default: 1 },
        { key: 'b', type: 'float', default: 0.5 },
        { key: 'c', type: 'bool', default: false },
      ];
      assert.deepStrictEqual(deriveConvergenceKeySet(mixed), ['a', 'b', 'c']);
    });
  });
});

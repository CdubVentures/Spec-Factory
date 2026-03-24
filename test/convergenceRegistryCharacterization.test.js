// WHY: Golden-master characterization tests locking down current convergence
// settings shape BEFORE migrating to registry-driven derivation.
// These tests must pass both before and after the migration.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';
import { CONVERGENCE_SETTINGS_ROUTE_PUT, CONVERGENCE_SETTINGS_VALUE_TYPES } from '../src/features/settings-authority/convergenceSettingsRouteContract.js';
import { CONVERGENCE_SETTINGS_KEYS } from '../src/core/config/settingsKeyMap.js';

describe('convergence settings characterization (golden master)', () => {
  it('SETTINGS_DEFAULTS.convergence has exact shape', () => {
    assert.deepStrictEqual(SETTINGS_DEFAULTS.convergence, {});
  });

  it('CONVERGENCE_SETTINGS_ROUTE_PUT.intKeys', () => {
    assert.deepStrictEqual(
      [...CONVERGENCE_SETTINGS_ROUTE_PUT.intKeys],
      [],
    );
  });

  it('CONVERGENCE_SETTINGS_ROUTE_PUT.floatKeys is empty', () => {
    assert.deepStrictEqual(
      [...CONVERGENCE_SETTINGS_ROUTE_PUT.floatKeys],
      [],
    );
  });

  it('CONVERGENCE_SETTINGS_ROUTE_PUT.boolKeys is empty', () => {
    assert.deepStrictEqual(
      [...CONVERGENCE_SETTINGS_ROUTE_PUT.boolKeys],
      [],
    );
  });

  it('CONVERGENCE_SETTINGS_VALUE_TYPES has exact shape', () => {
    assert.deepStrictEqual(
      { ...CONVERGENCE_SETTINGS_VALUE_TYPES },
      {},
    );
  });

  it('CONVERGENCE_SETTINGS_KEYS has exact contents', () => {
    assert.deepStrictEqual(
      [...CONVERGENCE_SETTINGS_KEYS],
      [],
    );
  });

});

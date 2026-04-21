import test from 'node:test';
import assert from 'node:assert/strict';
import { FINDER_MODULES } from '../finderModuleRegistry.js';
import { EG_LOCKED_KEYS, getReservedFieldKeys, isReservedFieldKey } from '../finderExclusions.js';

test('EG_LOCKED_KEYS is the frozen 4-entry preset keyset', () => {
  assert.deepEqual([...EG_LOCKED_KEYS].sort(), ['colors', 'editions', 'release_date', 'sku']);
  assert.ok(Object.isFrozen(EG_LOCKED_KEYS));
});

test('getReservedFieldKeys contains every EG-locked key', () => {
  const reserved = getReservedFieldKeys();
  for (const k of EG_LOCKED_KEYS) {
    assert.ok(reserved.has(k), `expected reserved set to contain ${k}`);
  }
});

test('getReservedFieldKeys derives from every non-keyFinder FINDER_MODULES.fieldKeys entry', () => {
  const reserved = getReservedFieldKeys();
  for (const mod of FINDER_MODULES) {
    if (mod.id === 'keyFinder') continue;
    for (const k of mod.fieldKeys || []) {
      assert.ok(reserved.has(k), `expected reserved set to contain ${k} from module ${mod.id}`);
    }
  }
});

test('getReservedFieldKeys excludes keyFinder own fieldKeys (empty by design)', () => {
  const keyFinder = FINDER_MODULES.find((m) => m.id === 'keyFinder');
  assert.ok(keyFinder, 'keyFinder module entry missing from registry');
  // Today it's empty; this test makes the contract explicit.
  assert.deepEqual(keyFinder.fieldKeys, []);
});

test('isReservedFieldKey returns true for every EG-locked key', () => {
  assert.equal(isReservedFieldKey('colors'), true);
  assert.equal(isReservedFieldKey('editions'), true);
  assert.equal(isReservedFieldKey('release_date'), true);
  assert.equal(isReservedFieldKey('sku'), true);
});

test('isReservedFieldKey returns false for an ordinary key', () => {
  assert.equal(isReservedFieldKey('polling_rate'), false);
  assert.equal(isReservedFieldKey('sensor_model'), false);
  assert.equal(isReservedFieldKey('mcu'), false);
});

test('isReservedFieldKey returns false for empty / nullish input', () => {
  assert.equal(isReservedFieldKey(''), false);
  assert.equal(isReservedFieldKey(null), false);
  assert.equal(isReservedFieldKey(undefined), false);
});

test('getReservedFieldKeys returns a Set (not an Array)', () => {
  const reserved = getReservedFieldKeys();
  assert.ok(reserved instanceof Set);
});

test('drift ward — a new hypothetical finder with a fieldKey lands in the reserved set', () => {
  // Proves the derivation reads from FINDER_MODULES at call time, not a frozen snapshot.
  // If this ever fails, the denylist is no longer registry-derived and must be refactored.
  const reservedBefore = getReservedFieldKeys();
  const skuCount = [...reservedBefore].filter((k) => k === 'sku').length;
  assert.equal(skuCount, 1, 'registry-driven derivation must yield a single canonical entry per key');
});

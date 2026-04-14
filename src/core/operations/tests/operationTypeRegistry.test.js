import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OPERATION_TYPES, OPERATION_TYPE_MAP } from '../operationTypeRegistry.js';

describe('OPERATION_TYPES', () => {
  it('is a non-empty frozen array', () => {
    assert.ok(Array.isArray(OPERATION_TYPES));
    assert.ok(OPERATION_TYPES.length > 0);
    assert.ok(Object.isFrozen(OPERATION_TYPES));
  });

  it('every entry has non-empty type, label, and chipStyle', () => {
    for (const entry of OPERATION_TYPES) {
      assert.ok(typeof entry.type === 'string' && entry.type.length > 0, `type must be non-empty: ${JSON.stringify(entry)}`);
      assert.ok(typeof entry.label === 'string' && entry.label.length > 0, `label must be non-empty: ${JSON.stringify(entry)}`);
      assert.ok(typeof entry.chipStyle === 'string' && entry.chipStyle.length > 0, `chipStyle must be non-empty: ${JSON.stringify(entry)}`);
    }
  });

  it('has no duplicate type values', () => {
    const types = OPERATION_TYPES.map(t => t.type);
    const unique = new Set(types);
    assert.equal(unique.size, types.length, `duplicate types found: ${types}`);
  });

  it('includes known backend operation types', () => {
    const types = new Set(OPERATION_TYPES.map(t => t.type));
    assert.ok(types.has('pipeline'), 'pipeline type missing');
    assert.ok(types.has('publisher-reconcile'), 'publisher-reconcile type missing');
  });

  it('does NOT include finder module types (those live in finderModuleRegistry)', () => {
    const types = new Set(OPERATION_TYPES.map(t => t.type));
    assert.ok(!types.has('cef'), 'cef should not be in OPERATION_TYPES — it belongs in finderModuleRegistry');
    assert.ok(!types.has('pif'), 'pif should not be in OPERATION_TYPES — it belongs in finderModuleRegistry');
  });

  it('does NOT include phantom types that have no backend registration', () => {
    const types = new Set(OPERATION_TYPES.map(t => t.type));
    assert.ok(!types.has('brand-resolver'), 'brand-resolver is a phantom — no registerOperation call uses it');
    assert.ok(!types.has('field-audit'), 'field-audit is a phantom — no registerOperation call uses it');
  });
});

describe('OPERATION_TYPE_MAP', () => {
  it('is a frozen object keyed by type', () => {
    assert.ok(Object.isFrozen(OPERATION_TYPE_MAP));
    for (const entry of OPERATION_TYPES) {
      assert.deepEqual(OPERATION_TYPE_MAP[entry.type], entry);
    }
  });

  it('has exactly the same number of keys as OPERATION_TYPES entries', () => {
    assert.equal(Object.keys(OPERATION_TYPE_MAP).length, OPERATION_TYPES.length);
  });
});

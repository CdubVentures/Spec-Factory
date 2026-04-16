import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_REGISTRY, COMMAND_REGISTRY_MAP } from '../commandRegistry.js';

describe('COMMAND_REGISTRY — contract', () => {
  const REQUIRED_KEYS = ['type', 'executionMode', 'stages', 'mutatesCategory', 'handlerExport', 'handlerModule'];

  it('is a frozen array', () => {
    assert.ok(Array.isArray(COMMAND_REGISTRY));
    assert.ok(Object.isFrozen(COMMAND_REGISTRY));
  });

  it('every entry has all required keys', () => {
    for (const entry of COMMAND_REGISTRY) {
      for (const key of REQUIRED_KEYS) {
        assert.ok(key in entry, `entry ${entry.type} missing key "${key}"`);
      }
    }
  });

  it('no duplicate types', () => {
    const types = COMMAND_REGISTRY.map(e => e.type);
    assert.deepStrictEqual(types, [...new Set(types)]);
  });

  it('stages is a non-empty array of strings for every entry', () => {
    for (const entry of COMMAND_REGISTRY) {
      assert.ok(Array.isArray(entry.stages), `${entry.type}: stages must be array`);
      assert.ok(entry.stages.length > 0, `${entry.type}: stages must be non-empty`);
      for (const s of entry.stages) {
        assert.strictEqual(typeof s, 'string');
      }
    }
  });

  it('executionMode is in-process or child-process', () => {
    for (const entry of COMMAND_REGISTRY) {
      assert.ok(
        entry.executionMode === 'in-process' || entry.executionMode === 'child-process',
        `${entry.type}: invalid executionMode "${entry.executionMode}"`,
      );
    }
  });

  it('mutatesCategory is boolean', () => {
    for (const entry of COMMAND_REGISTRY) {
      assert.strictEqual(typeof entry.mutatesCategory, 'boolean', `${entry.type}`);
    }
  });

  it('contains compile and validate entries', () => {
    const types = COMMAND_REGISTRY.map(e => e.type);
    assert.ok(types.includes('compile'), 'missing compile');
    assert.ok(types.includes('validate'), 'missing validate');
  });
});

describe('COMMAND_REGISTRY_MAP — contract', () => {
  it('is a frozen object', () => {
    assert.ok(Object.isFrozen(COMMAND_REGISTRY_MAP));
  });

  it('has O(1) lookup for every registry entry', () => {
    for (const entry of COMMAND_REGISTRY) {
      assert.strictEqual(COMMAND_REGISTRY_MAP[entry.type], entry);
    }
  });

  it('lookup for unknown type returns undefined', () => {
    assert.strictEqual(COMMAND_REGISTRY_MAP['nonexistent'], undefined);
  });
});

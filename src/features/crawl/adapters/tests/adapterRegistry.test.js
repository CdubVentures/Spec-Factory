import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAdapter, ADAPTER_REGISTRY } from '../adapterRegistry.js';

describe('ADAPTER_REGISTRY', () => {
  it('contains crawlee adapter', () => {
    assert.ok(ADAPTER_REGISTRY.crawlee, 'crawlee registered');
    assert.equal(ADAPTER_REGISTRY.crawlee.name, 'crawlee');
    assert.equal(typeof ADAPTER_REGISTRY.crawlee.create, 'function');
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(ADAPTER_REGISTRY));
  });
});

describe('resolveAdapter', () => {
  it('resolves known adapter name', () => {
    const entry = resolveAdapter('crawlee');
    assert.equal(entry.name, 'crawlee');
    assert.equal(typeof entry.create, 'function');
  });

  it('throws for unknown adapter with available list', () => {
    assert.throws(
      () => resolveAdapter('doesNotExist'),
      (err) => {
        assert.ok(err.message.includes('doesNotExist'), 'includes requested name');
        assert.ok(err.message.includes('crawlee'), 'lists available adapters');
        return true;
      },
    );
  });

  it('throws for empty string', () => {
    assert.throws(() => resolveAdapter(''));
  });
});

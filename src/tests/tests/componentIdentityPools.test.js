import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentIdentityPools } from '../testDataProvider.js';

test('identity pools are app-generated without spreadsheet dependency', async () => {
  const pools = await loadComponentIdentityPools({
    componentTypes: ['sensor', 'switch', 'encoder', 'material'],
    strict: true,
  });

  assert.equal(Object.keys(pools).length, 4);
  for (const [type, pool] of Object.entries(pools)) {
    assert.equal(pool.source, 'app_generated', `${type}: source should be app_generated`);
    assert.equal(Array.isArray(pool.names), true, `${type}: names should be array`);
    assert.equal(Array.isArray(pool.brands), true, `${type}: brands should be array`);
    assert.equal(pool.names.length >= 12, true, `${type}: names should have coverage`);
    assert.equal(pool.brands.length >= 2, true, `${type}: brands should have at least two values`);
  }
});

test('identity pools are deterministic for same component type set', async () => {
  const first = await loadComponentIdentityPools({
    componentTypes: ['sensor', 'switch'],
    strict: true,
  });
  const second = await loadComponentIdentityPools({
    componentTypes: ['sensor', 'switch'],
    strict: true,
  });
  assert.deepEqual(first, second);
});

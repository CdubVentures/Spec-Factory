// WHY: Phase F — contract tests for the brand identifier resolver.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBrandIdentifier } from '../resolveBrandIdentifier.js';

function mockAppDb(brands = []) {
  return {
    findBrandByAlias(query) {
      const q = String(query).trim().toLowerCase();
      return brands.find(b =>
        b.canonical_name.toLowerCase() === q ||
        (b.aliases || []).some(a => a.toLowerCase() === q)
      ) || null;
    },
  };
}

describe('resolveBrandIdentifier', () => {
  it('returns identifier when found by canonical_name', () => {
    const appDb = mockAppDb([{ canonical_name: 'Razer', identifier: 'b5a50d8f', aliases: [] }]);
    assert.equal(resolveBrandIdentifier(appDb, 'Razer'), 'b5a50d8f');
  });

  it('returns identifier when found by alias', () => {
    const appDb = mockAppDb([{ canonical_name: 'Logitech G', identifier: '84a009b9', aliases: ['Logitech'] }]);
    assert.equal(resolveBrandIdentifier(appDb, 'Logitech'), '84a009b9');
  });

  it('returns empty string when appDb is null', () => {
    assert.equal(resolveBrandIdentifier(null, 'Razer'), '');
  });

  it('returns empty string when appDb is undefined', () => {
    assert.equal(resolveBrandIdentifier(undefined, 'Razer'), '');
  });

  it('returns empty string when appDb lacks findBrandByAlias', () => {
    assert.equal(resolveBrandIdentifier({}, 'Razer'), '');
  });

  it('returns empty string when brand not found', () => {
    const appDb = mockAppDb([{ canonical_name: 'Razer', identifier: 'b5a50d8f', aliases: [] }]);
    assert.equal(resolveBrandIdentifier(appDb, 'UnknownBrand'), '');
  });

  it('returns empty string when name is empty', () => {
    const appDb = mockAppDb([{ canonical_name: 'Razer', identifier: 'b5a50d8f', aliases: [] }]);
    assert.equal(resolveBrandIdentifier(appDb, ''), '');
  });

  it('returns empty string when name is null', () => {
    const appDb = mockAppDb([]);
    assert.equal(resolveBrandIdentifier(appDb, null), '');
  });

  it('returns empty string when name is undefined', () => {
    const appDb = mockAppDb([]);
    assert.equal(resolveBrandIdentifier(appDb, undefined), '');
  });

  it('never throws even if findBrandByAlias throws', () => {
    const appDb = {
      findBrandByAlias() { throw new Error('db corruption'); },
    };
    assert.equal(resolveBrandIdentifier(appDb, 'Razer'), '');
  });

  it('trims whitespace from display name before lookup', () => {
    const appDb = mockAppDb([{ canonical_name: 'Razer', identifier: 'b5a50d8f', aliases: [] }]);
    assert.equal(resolveBrandIdentifier(appDb, '  Razer  '), 'b5a50d8f');
  });
});

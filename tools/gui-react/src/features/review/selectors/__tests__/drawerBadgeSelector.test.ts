import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDrawerBadge } from '../drawerBadgeSelector.ts';
import { isVariantBackedField, VARIANT_BACKED_FIELDS } from '../../../color-edition-finder/index.ts';

describe('resolveDrawerBadge', () => {
  it('returns "variant" for colors with published value', () => {
    assert.equal(resolveDrawerBadge('colors', true), 'variant');
  });

  it('returns "variant" for editions with published value', () => {
    assert.equal(resolveDrawerBadge('editions', true), 'variant');
  });

  it('returns "value" for a non-variant field (release_date) with published value and no variant_dependent flag', () => {
    assert.equal(resolveDrawerBadge('release_date', true), 'value');
  });

  it('returns "variant" when variant_dependent flag is set (backend-signalled)', () => {
    assert.equal(resolveDrawerBadge('release_date', true, true), 'variant');
  });

  it('returns "value" for name field with published value', () => {
    assert.equal(resolveDrawerBadge('name', true), 'value');
  });

  it('returns null when nothing is published, even for variant fields', () => {
    assert.equal(resolveDrawerBadge('colors', false), null);
    assert.equal(resolveDrawerBadge('release_date', false), null);
  });
});

describe('isVariantBackedField (CEF public API)', () => {
  it('recognises colors and editions as variant-backed', () => {
    assert.equal(isVariantBackedField('colors'), true);
    assert.equal(isVariantBackedField('editions'), true);
  });

  it('rejects non-variant fields', () => {
    assert.equal(isVariantBackedField('name'), false);
    assert.equal(isVariantBackedField('release_date'), false);
    assert.equal(isVariantBackedField('weight'), false);
  });

  it('exports the canonical list without mutation', () => {
    assert.deepEqual([...VARIANT_BACKED_FIELDS], ['colors', 'editions']);
  });
});

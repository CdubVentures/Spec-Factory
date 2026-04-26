import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  patchCachedBrand,
  removeCachedBrand,
} from '../brandCacheOptimism.ts';
import type { Brand } from '../../../../types/product.ts';

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    slug: 'acme',
    canonical_name: 'Acme',
    identifier: 'acme',
    aliases: ['A'],
    categories: ['mouse'],
    website: 'https://acme.example',
    added_at: '2026-01-01T00:00:00.000Z',
    added_by: 'test',
    ...overrides,
  };
}

describe('brand cache optimism', () => {
  it('removes a deleted brand from the cached list immediately', () => {
    const rows = [brand(), brand({ slug: 'contoso', identifier: 'contoso' })];

    assert.deepEqual(removeCachedBrand(rows, 'acme'), [
      brand({ slug: 'contoso', identifier: 'contoso' }),
    ]);
  });

  it('patches editable brand fields without accepting unrelated payload keys', () => {
    const rows = [brand()];

    assert.deepEqual(
      patchCachedBrand(rows, 'acme', {
        name: 'Acme Pro',
        aliases: ['A', 'Pro'],
        categories: ['keyboard'],
        website: 'https://pro.example',
        ignored: 'value',
      }),
      [
        brand({
          canonical_name: 'Acme Pro',
          aliases: ['A', 'Pro'],
          categories: ['keyboard'],
          website: 'https://pro.example',
        }),
      ],
    );
  });
});

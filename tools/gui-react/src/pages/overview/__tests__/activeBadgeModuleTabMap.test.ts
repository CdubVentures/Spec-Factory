import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { resolveModuleTabId } from '../activeBadgeModuleTabMap.ts';

describe('resolveModuleTabId', () => {
  it('maps each finder module id to its IndexLab tab id', () => {
    strictEqual(resolveModuleTabId('cef'), 'colorEditionFinder');
    strictEqual(resolveModuleTabId('pif'), 'productImageFinder');
    strictEqual(resolveModuleTabId('rdf'), 'releaseDateFinder');
    strictEqual(resolveModuleTabId('skf'), 'skuFinder');
    strictEqual(resolveModuleTabId('kf'), 'keyFinder');
  });

  it('returns null for pipeline (no dedicated finder tab)', () => {
    strictEqual(resolveModuleTabId('pipeline'), null);
  });

  it('returns null for unknown module ids', () => {
    strictEqual(resolveModuleTabId(''), null);
    strictEqual(resolveModuleTabId('nope'), null);
  });
});

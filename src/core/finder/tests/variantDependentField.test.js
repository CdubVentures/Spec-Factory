// WHY: Single source of truth for whether a field's published state is per-variant.
// Any field owned by a `variantFieldProducer` module (e.g. releaseDateFinder.release_date)
// must return true. Fields owned by `variantGenerator` / `variantArtifactProducer` modules,
// or unowned fields, must return false.

import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import {
  isVariantDependentField,
  getFinderModuleForField,
} from '../finderModuleRegistry.js';

describe('isVariantDependentField', () => {
  it('returns true for release_date (variantFieldProducer)', () => {
    strictEqual(isVariantDependentField('release_date'), true);
  });

  it('returns false for colors (variantGenerator, not variant-dependent by this definition)', () => {
    strictEqual(isVariantDependentField('colors'), false);
  });

  it('returns false for editions (variantGenerator, not variant-dependent by this definition)', () => {
    strictEqual(isVariantDependentField('editions'), false);
  });

  it('returns false for unowned fields (weight, name)', () => {
    strictEqual(isVariantDependentField('weight'), false);
    strictEqual(isVariantDependentField('name'), false);
  });

  it('returns false for empty / null / undefined', () => {
    strictEqual(isVariantDependentField(''), false);
    strictEqual(isVariantDependentField(null), false);
    strictEqual(isVariantDependentField(undefined), false);
  });
});

describe('getFinderModuleForField', () => {
  it('returns the releaseDateFinder module for release_date', () => {
    const mod = getFinderModuleForField('release_date');
    strictEqual(mod?.id, 'releaseDateFinder');
    strictEqual(mod?.moduleClass, 'variantFieldProducer');
  });

  it('returns the colorEditionFinder module for colors', () => {
    const mod = getFinderModuleForField('colors');
    strictEqual(mod?.id, 'colorEditionFinder');
    strictEqual(mod?.moduleClass, 'variantGenerator');
  });

  it('returns the colorEditionFinder module for editions', () => {
    const mod = getFinderModuleForField('editions');
    strictEqual(mod?.id, 'colorEditionFinder');
  });

  it('returns null for unowned fields', () => {
    strictEqual(getFinderModuleForField('weight'), null);
    strictEqual(getFinderModuleForField('name'), null);
  });

  it('returns null for empty / null / undefined', () => {
    strictEqual(getFinderModuleForField(''), null);
    strictEqual(getFinderModuleForField(null), null);
    strictEqual(getFinderModuleForField(undefined), null);
  });
});

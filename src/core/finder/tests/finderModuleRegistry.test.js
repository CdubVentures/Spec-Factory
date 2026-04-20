/**
 * finderModuleRegistry — deriveFinderPaths(id) contract tests.
 *
 * The helper folds 5 previously-authored string fields (featurePath, routeFile,
 * registrarExport, panelFeaturePath, panelExport) plus one implicit derivation
 * (schemaModule — formerly a special case in generateFinderTypes.js) into a
 * single pure function over `id`.
 *
 * Golden-master discipline: the 3 existing finders' values are locked byte-for-
 * byte. Future scalar finders inherit the derivation without authoring paths.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFinderPaths } from '../finderModuleRegistry.js';

describe('deriveFinderPaths — existing finders (byte-identical to prior registry)', () => {
  it('releaseDateFinder', () => {
    assert.deepEqual(deriveFinderPaths('releaseDateFinder'), {
      featurePath: 'release-date',
      routeFile: 'releaseDateFinderRoutes',
      registrarExport: 'registerReleaseDateFinderRoutes',
      panelFeaturePath: 'release-date-finder',
      panelExport: 'ReleaseDateFinderPanel',
      schemaModule: 'releaseDateSchema',
      adapterModule: 'releaseDateLlmAdapter',
    });
  });

  it('colorEditionFinder', () => {
    assert.deepEqual(deriveFinderPaths('colorEditionFinder'), {
      featurePath: 'color-edition',
      routeFile: 'colorEditionFinderRoutes',
      registrarExport: 'registerColorEditionFinderRoutes',
      panelFeaturePath: 'color-edition-finder',
      panelExport: 'ColorEditionFinderPanel',
      schemaModule: 'colorEditionSchema',
      adapterModule: 'colorEditionLlmAdapter',
    });
  });

  it('productImageFinder', () => {
    assert.deepEqual(deriveFinderPaths('productImageFinder'), {
      featurePath: 'product-image',
      routeFile: 'productImageFinderRoutes',
      registrarExport: 'registerProductImageFinderRoutes',
      panelFeaturePath: 'product-image-finder',
      panelExport: 'ProductImageFinderPanel',
      schemaModule: 'productImageSchema',
      adapterModule: 'productImageLlmAdapter',
    });
  });
});

describe('deriveFinderPaths — hypothetical future scalar finders', () => {
  it('skuFinder (single-word stem)', () => {
    assert.deepEqual(deriveFinderPaths('skuFinder'), {
      featurePath: 'sku',
      routeFile: 'skuFinderRoutes',
      registrarExport: 'registerSkuFinderRoutes',
      panelFeaturePath: 'sku-finder',
      panelExport: 'SkuFinderPanel',
      schemaModule: 'skuSchema',
      adapterModule: 'skuLlmAdapter',
    });
  });

  it('pricingFinder', () => {
    assert.deepEqual(deriveFinderPaths('pricingFinder'), {
      featurePath: 'pricing',
      routeFile: 'pricingFinderRoutes',
      registrarExport: 'registerPricingFinderRoutes',
      panelFeaturePath: 'pricing-finder',
      panelExport: 'PricingFinderPanel',
      schemaModule: 'pricingSchema',
      adapterModule: 'pricingLlmAdapter',
    });
  });

  it('discontinuedFinder (longer stem)', () => {
    const paths = deriveFinderPaths('discontinuedFinder');
    assert.equal(paths.featurePath, 'discontinued');
    assert.equal(paths.panelFeaturePath, 'discontinued-finder');
    assert.equal(paths.panelExport, 'DiscontinuedFinderPanel');
    assert.equal(paths.schemaModule, 'discontinuedSchema');
  });
});

describe('deriveFinderPaths — edge cases', () => {
  it('id without Finder suffix is used as-is for featurePath (no silent strip)', () => {
    const paths = deriveFinderPaths('ticker');
    // No Finder suffix to strip, so featurePath mirrors kebab(id)
    assert.equal(paths.featurePath, 'ticker');
    assert.equal(paths.routeFile, 'tickerRoutes');
    assert.equal(paths.registrarExport, 'registerTickerRoutes');
    assert.equal(paths.panelFeaturePath, 'ticker');
    assert.equal(paths.panelExport, 'TickerPanel');
    assert.equal(paths.schemaModule, 'tickerSchema');
    assert.equal(paths.adapterModule, 'tickerLlmAdapter');
  });

  it('pure function — no registry access, deterministic', () => {
    const first = deriveFinderPaths('releaseDateFinder');
    const second = deriveFinderPaths('releaseDateFinder');
    assert.deepEqual(first, second);
    // Different input → different output
    const third = deriveFinderPaths('skuFinder');
    assert.notDeepEqual(first, third);
  });
});

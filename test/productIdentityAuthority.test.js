import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferIdentityFromProductId,
  resolveAuthoritativeProductIdentity,
  resolveProductIdentity,
} from '../src/features/catalog/identity/productIdentityAuthority.js';

test('inferIdentityFromProductId parses category-prefixed product ids', () => {
  const identity = inferIdentityFromProductId('mouse-razer-viper-v3-pro', 'mouse');
  assert.equal(identity.brand, 'Razer');
  assert.equal(identity.model, 'Viper V3 Pro');
  assert.equal(identity.variant, '');
});

test('resolveAuthoritativeProductIdentity prioritizes catalog identity', () => {
  const resolved = resolveAuthoritativeProductIdentity({
    category: 'mouse',
    productId: 'mouse-razer-viper-v3-pro',
    catalogProduct: {
      id: 21,
      identifier: 'cat_21',
      brand: 'Razer Catalog',
      model: 'Viper Catalog',
      variant: 'SE',
    },
    dbProduct: {
      id: 33,
      identifier: 'db_33',
      brand: 'Razer Db',
      model: 'Viper Db',
      variant: 'DB',
    },
    normalizedIdentity: {
      id: 44,
      identifier: 'norm_44',
      brand: 'Razer Norm',
      model: 'Viper Norm',
      variant: 'NRM',
    },
  });

  assert.equal(resolved.id, 21);
  assert.equal(resolved.identifier, 'cat_21');
  assert.equal(resolved.brand, 'Razer Catalog');
  assert.equal(resolved.model, 'Viper Catalog');
  assert.equal(resolved.variant, 'SE');
});

test('resolveAuthoritativeProductIdentity falls back to db then normalized then inferred', () => {
  const resolved = resolveAuthoritativeProductIdentity({
    category: 'mouse',
    productId: 'mouse-acer-cestus-310',
    catalogProduct: {},
    dbProduct: {
      id: 7,
      identifier: 'db_7',
      brand: 'Acer Db',
      model: 'Cestus Db',
      variant: '',
    },
    normalizedIdentity: {
      id: 0,
      identifier: 'norm_1',
      brand: 'Acer Norm',
      model: 'Cestus Norm',
      variant: 'N',
    },
  });

  assert.equal(resolved.id, 7);
  assert.equal(resolved.identifier, 'db_7');
  assert.equal(resolved.brand, 'Acer Db');
  assert.equal(resolved.model, 'Cestus Db');
  assert.equal(resolved.variant, '');
});

test('resolveAuthoritativeProductIdentity uses inferred identity when no sources exist', () => {
  const resolved = resolveAuthoritativeProductIdentity({
    category: 'mouse',
    productId: 'mouse-logitech-g-pro-x-superlight-2',
  });

  assert.equal(resolved.id, 0);
  assert.equal(resolved.identifier, '');
  assert.equal(resolved.brand, 'Logitech');
  assert.equal(resolved.model, 'G Pro X Superlight 2');
  assert.equal(resolved.variant, '');
});

test('resolveAuthoritativeProductIdentity preserves explicit empty catalog variant', () => {
  const resolved = resolveAuthoritativeProductIdentity({
    category: 'mouse',
    productId: 'mouse-razer-viper-v3-pro-pro',
    catalogProduct: {
      variant: '',
    },
    dbProduct: {
      variant: 'Pro',
    },
    normalizedIdentity: {
      variant: 'Legacy',
    },
  });

  assert.equal(resolved.variant, '');
});

test('resolveProductIdentity uses catalog-first identity when loader and specDb are provided', async () => {
  let loadCalls = 0;
  const resolved = await resolveProductIdentity({
    category: 'mouse',
    productId: 'mouse-razer-viper-v3-pro',
    config: {},
    loadProductCatalog: async () => {
      loadCalls += 1;
      return {
        products: {
          'mouse-razer-viper-v3-pro': {
            id: 21,
            identifier: 'cat_21',
            brand: 'Razer Catalog',
            model: 'Viper Catalog',
            variant: 'SE',
          },
        },
      };
    },
    specDb: {
      getProduct: () => ({
        id: 33,
        identifier: 'db_33',
        brand: 'Razer Db',
        model: 'Viper Db',
        variant: 'DB',
      }),
    },
    normalizedIdentity: {
      id: 44,
      identifier: 'norm_44',
      brand: 'Razer Norm',
      model: 'Viper Norm',
      variant: 'NRM',
    },
  });

  assert.equal(loadCalls, 1);
  assert.equal(resolved.id, 21);
  assert.equal(resolved.identifier, 'cat_21');
  assert.equal(resolved.brand, 'Razer Catalog');
  assert.equal(resolved.model, 'Viper Catalog');
  assert.equal(resolved.variant, 'SE');
});

test('resolveProductIdentity falls back to specDb identity when catalog does not contain product', async () => {
  const resolved = await resolveProductIdentity({
    category: 'mouse',
    productId: 'mouse-hyperx-pulsefire-haste',
    config: {},
    loadProductCatalog: async () => ({ products: {} }),
    specDb: {
      getProduct: () => ({
        id: 7,
        identifier: 'db_7',
        brand: 'HyperX Db',
        model: 'Pulsefire Haste Db',
        variant: '',
      }),
    },
    normalizedIdentity: {
      id: 0,
      identifier: '',
      brand: 'Stale',
      model: 'Stale',
      variant: 'Legacy',
    },
  });

  assert.equal(resolved.id, 7);
  assert.equal(resolved.identifier, 'db_7');
  assert.equal(resolved.brand, 'HyperX Db');
  assert.equal(resolved.model, 'Pulsefire Haste Db');
  assert.equal(resolved.variant, '');
});

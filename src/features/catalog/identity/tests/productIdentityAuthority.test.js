import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferIdentityFromProductId,
  resolveAuthoritativeProductIdentity,
  resolveProductIdentity,
} from '../productIdentityAuthority.js';

test('inferIdentityFromProductId returns empty for hex-based ids', () => {
  const identity = inferIdentityFromProductId('mouse-a1b2c3d4', 'mouse');
  assert.equal(identity.brand, '');
  assert.equal(identity.model, '');
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

test('resolveAuthoritativeProductIdentity returns empty when no sources exist', () => {
  const resolved = resolveAuthoritativeProductIdentity({
    category: 'mouse',
    productId: 'mouse-a1b2c3d4',
  });

  assert.equal(resolved.id, 0);
  assert.equal(resolved.identifier, '');
  assert.equal(resolved.brand, '');
  assert.equal(resolved.model, '');
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

// --- base_model resolution ---

test('resolveAuthoritativeProductIdentity includes base_model from catalog', () => {
  const resolved = resolveAuthoritativeProductIdentity({
    productId: 'mouse-001',
    category: 'mouse',
    catalogProduct: {
      id: 1,
      identifier: 'cat_1',
      brand: 'Finalmouse',
      base_model: 'ULX Prophecy',
      model: 'ULX Prophecy Scream',
      variant: 'Scream',
    },
  });
  assert.equal(resolved.base_model, 'ULX Prophecy');
  assert.equal(resolved.model, 'ULX Prophecy Scream');
  assert.equal(resolved.variant, 'Scream');
});

test('resolveAuthoritativeProductIdentity falls back to db base_model when catalog empty', () => {
  const resolved = resolveAuthoritativeProductIdentity({
    productId: 'mouse-001',
    category: 'mouse',
    catalogProduct: {},
    dbProduct: {
      brand: 'Finalmouse',
      base_model: 'ULX Prophecy',
      model: 'ULX Prophecy Scream',
      variant: 'Scream',
    },
  });
  assert.equal(resolved.base_model, 'ULX Prophecy');
});

test('resolveAuthoritativeProductIdentity base_model is empty when no sources have it', () => {
  const resolved = resolveAuthoritativeProductIdentity({
    productId: 'mouse-001',
    category: 'mouse',
  });
  assert.equal(resolved.base_model, '');
});

// WHY: After catalog removal, hierarchy is db → normalized → inferred. specDb wins.
test('resolveProductIdentity uses specDb identity as primary authority', async () => {
  const resolved = await resolveProductIdentity({
    category: 'mouse',
    productId: 'mouse-razer-viper-v3-pro',
    config: {},
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

  assert.equal(resolved.id, 33);
  assert.equal(resolved.identifier, 'db_33');
  assert.equal(resolved.brand, 'Razer Db');
  assert.equal(resolved.model, 'Viper Db');
  assert.equal(resolved.variant, 'DB');
});

test('resolveProductIdentity falls back to normalizedIdentity when specDb has no product', async () => {
  const resolved = await resolveProductIdentity({
    category: 'mouse',
    productId: 'mouse-hyperx-pulsefire-haste',
    config: {},
    specDb: {
      getProduct: () => null,
    },
    normalizedIdentity: {
      id: 7,
      identifier: 'norm_7',
      brand: 'HyperX Norm',
      model: 'Pulsefire Haste Norm',
      variant: '',
    },
  });

  assert.equal(resolved.id, 7);
  assert.equal(resolved.identifier, 'norm_7');
  assert.equal(resolved.brand, 'HyperX Norm');
  assert.equal(resolved.model, 'Pulsefire Haste Norm');
  assert.equal(resolved.variant, '');
});

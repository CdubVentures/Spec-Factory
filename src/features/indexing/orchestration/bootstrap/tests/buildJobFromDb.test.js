import test from 'node:test';
import assert from 'node:assert/strict';

import { buildJobFromDb } from '../buildJobFromDb.js';

// WHY: Contract tests for buildJobFromDb — the DB-first job resolution path.
// This function replaces fixture-file loading with a direct DB lookup.

function mockSpecDb(product) {
  return { getProduct: () => product };
}

const CATEGORY = 'mouse';
const PRODUCT_ID = 'mouse-abc12345';

test('buildJobFromDb — happy path returns full job object', () => {
  const db = mockSpecDb({
    brand: 'Razer',
    base_model: 'Viper V3 Pro',
    model: 'Viper V3 Pro',
    variant: '4K',
    seed_urls: '["https://razer.com/viper"]',
  });

  const job = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });

  assert.deepEqual(job, {
    productId: PRODUCT_ID,
    category: CATEGORY,
    identityLock: {
      brand: 'Razer',
      base_model: 'Viper V3 Pro',
      model: 'Viper V3 Pro 4K',
      variant: '4K',
      brand_identifier: '',
      sku: '',
      title: '',
    },
    seedUrls: ['https://razer.com/viper'],
  });
});

test('buildJobFromDb — returns null when brand is empty', () => {
  const db = mockSpecDb({ brand: '', model: 'Viper' });
  const result = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });
  assert.equal(result, null);
});

test('buildJobFromDb — returns null when base_model is empty', () => {
  const db = mockSpecDb({ brand: 'Razer', base_model: '', model: 'Viper' });
  const result = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });
  assert.equal(result, null);
});

test('buildJobFromDb — returns null when product not found', () => {
  const db = mockSpecDb(null);
  const result = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });
  assert.equal(result, null);
});

test('buildJobFromDb — returns null when specDb is null', () => {
  const result = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: null });
  assert.equal(result, null);
});

test('buildJobFromDb — returns null when productId is empty', () => {
  const db = mockSpecDb({ brand: 'Razer', model: 'Viper' });
  const result = buildJobFromDb({ productId: '', category: CATEGORY, specDb: db });
  assert.equal(result, null);
});

test('buildJobFromDb — returns null when category is empty', () => {
  const db = mockSpecDb({ brand: 'Razer', model: 'Viper' });
  const result = buildJobFromDb({ productId: PRODUCT_ID, category: '', specDb: db });
  assert.equal(result, null);
});

test('buildJobFromDb — null seed_urls yields empty array', () => {
  const db = mockSpecDb({ brand: 'Razer', base_model: 'Viper', model: 'Viper', seed_urls: null });
  const job = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });
  assert.deepEqual(job.seedUrls, []);
});

test('buildJobFromDb — JSON string seed_urls is parsed', () => {
  const db = mockSpecDb({ brand: 'X', base_model: 'Y', model: 'Y', seed_urls: '["a","b"]' });
  const job = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });
  assert.deepEqual(job.seedUrls, ['a', 'b']);
});

test('buildJobFromDb — invalid JSON seed_urls yields empty array', () => {
  const db = mockSpecDb({ brand: 'X', base_model: 'Y', model: 'Y', seed_urls: 'not-json' });
  const job = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });
  assert.deepEqual(job.seedUrls, []);
});

test('buildJobFromDb — trims whitespace from brand/model/variant', () => {
  const db = mockSpecDb({ brand: '  Razer  ', base_model: '  Viper  ', model: '  Viper  ', variant: '  Pro  ' });
  const job = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });
  assert.equal(job.identityLock.brand, 'Razer');
  assert.equal(job.identityLock.base_model, 'Viper');
  assert.equal(job.identityLock.model, 'Viper Pro');
  assert.equal(job.identityLock.variant, 'Pro');
});

test('buildJobFromDb — missing variant defaults to empty string', () => {
  const db = mockSpecDb({ brand: 'Razer', base_model: 'Viper', model: 'Viper' });
  const job = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });
  assert.equal(job.identityLock.variant, '');
});

// WHY: Fabricated variant stripping — variant tokens already in model must be stripped.
test('buildJobFromDb — fabricated variant stripped: model="OP1 8k", variant="8k"', () => {
  const db = mockSpecDb({ brand: 'Endgame Gear', base_model: 'OP1 8k', model: 'OP1 8k', variant: '8k' });
  const job = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });
  assert.equal(job.identityLock.variant, '');
});

test('buildJobFromDb — fabricated variant stripped: model="Cestus 310", variant="310"', () => {
  const db = mockSpecDb({ brand: 'Acer', base_model: 'Cestus 310', model: 'Cestus 310', variant: '310' });
  const job = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });
  assert.equal(job.identityLock.variant, '');
});

test('buildJobFromDb — real variant preserved: model="Viper V3 Pro", variant="Wireless"', () => {
  const db = mockSpecDb({ brand: 'Razer', base_model: 'Viper V3 Pro', model: 'Viper V3 Pro', variant: 'Wireless' });
  const job = buildJobFromDb({ productId: PRODUCT_ID, category: CATEGORY, specDb: db });
  assert.equal(job.identityLock.variant, 'Wireless');
});

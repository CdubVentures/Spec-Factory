import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  createCatalogBuilder,
  createCompiledComponentDbPatcher,
} from '../catalogHelpers.js';
import {
  createCatalogProduct,
  createCatalogInput,
  createCatalogSummary,
  createNormalizedIdentity,
  createCompiledComponentRecord,
} from './helpers/appApiTestBuilders.js';

function cleanVariant(variant) {
  const token = String(variant ?? '').trim().toLowerCase();
  if (token === '' || token === 'unk' || token === 'unknown' || token === 'n/a') return '';
  return String(variant).trim();
}

function normText(value) {
  return String(value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function catalogKey(brand, model, variant) {
  return `${normText(brand)}|${normText(model)}|${normText(cleanVariant(variant))}`;
}

function createCatalogStorageFixture() {
  const seedInput = createCatalogInput();
  const orphanInput = createCatalogInput({
    productId: 'mouse-ghost-phantom',
    active: false,
    identityLock: {
      brand: 'Ghost',
      model: 'Phantom',
      variant: '',
    },
  });
  const latestBase = 'out/mouse/mouse-acme-orbit-x1/latest';

  return {
    async listInputKeys() {
      return ['inputs/seed.json', 'inputs/orphan.json'];
    },
    async readJsonOrNull(key) {
      if (key === 'inputs/seed.json') return seedInput;
      if (key === 'inputs/orphan.json') return orphanInput;
      if (key === `${latestBase}/summary.json`) return createCatalogSummary();
      if (key === `${latestBase}/normalized.json`) return createNormalizedIdentity();
      return null;
    },
    resolveOutputKey(category, productId) {
      return `out/${category}/${productId}/latest`;
    },
    async objectExists(key) {
      return key.includes('mouse-acme-orbit-x1');
    },
  };
}

function createBuildCatalog(overrides = {}) {
  return createCatalogBuilder({
    config: { localMode: true },
    storage: createCatalogStorageFixture(),
    getSpecDb: () => ({
      id: 'fake-specdb',
      getSummaryForProduct: (pid) => pid === 'mouse-acme-orbit-x1' ? createCatalogSummary() : null,
      getNormalizedForProduct: (pid) => pid === 'mouse-acme-orbit-x1' ? createNormalizedIdentity() : null,
      getTrafficLightForProduct: () => null,
    }),
    loadQueueState: async () => ({
      state: {
        products: {
          'mouse-acme-orbit-x1': { status: 'complete' },
        },
      },
    }),
    loadProductCatalog: async () => ({
      products: {
        'mouse-acme-orbit-x1': createCatalogProduct(),
      },
    }),
    cleanVariant,
    catalogKey,
    path,
    ...overrides,
  });
}

test('catalog builder merges storage enrichment onto seeded catalog rows and skips orphans', async () => {
  const buildCatalog = createBuildCatalog();

  const rows = await buildCatalog('mouse');
  assert.deepEqual(rows, [
    {
      productId: 'mouse-acme-orbit-x1',
      id: 10,
      identifier: '',
      brand: 'Acme',
      model: 'Orbit X1',
      base_model: '',
      variant: '',
      status: 'complete',
      hasFinal: true,
      validated: true,
      confidence: 0.86,
      coverage: 0.77,
      fieldsFilled: 7,
      fieldsTotal: 9,
      lastRun: '2026-02-26T10:00:00.000Z',
      inActive: true,
    },
  ]);
});

test('catalog builder falls back to pending defaults when queue state loading fails', async () => {
  const seedInput = createCatalogInput({ active: false });
  const buildCatalog = createBuildCatalog({
    storage: {
      async listInputKeys() {
        return ['inputs/seed.json'];
      },
      async readJsonOrNull(key) {
        if (key === 'inputs/seed.json') return seedInput;
        return null;
      },
      resolveOutputKey(category, productId) {
        return `out/${category}/${productId}/latest`;
      },
      async objectExists() {
        return false;
      },
    },
    getSpecDb: () => null,
    loadQueueState: async () => {
      throw new Error('queue offline');
    },
  });

  const rows = await buildCatalog('mouse');
  assert.deepEqual(rows, [
    {
      productId: 'mouse-acme-orbit-x1',
      id: 10,
      identifier: '',
      brand: 'Acme',
      model: 'Orbit X1',
      base_model: '',
      variant: '',
      status: 'pending',
      hasFinal: false,
      validated: false,
      confidence: 0,
      coverage: 0,
      fieldsFilled: 0,
      fieldsTotal: 0,
      lastRun: '',
      inActive: true,
    },
  ]);
});

test('compiled component db patcher writes updated matching item', async () => {
  const writes = [];
  const patchDb = createCompiledComponentDbPatcher({
    helperRoot: '/tmp/helper',
    listFiles: async () => ['component-db.json'],
    safeReadJson: async () => ({
      component_type: 'sensor',
      items: [createCompiledComponentRecord()],
    }),
    fs: {
      async writeFile(filePath, payload) {
        writes.push({ filePath, payload });
      },
    },
    path,
  });

  await patchDb(
    'mouse',
    'sensor',
    'PixArt PMW',
    { dpi: 26000 },
    { name: 'PixArt PMW 3395', maker: 'PixArt', links: ['https://example.com'], aliases: ['PMW3395'] },
  );

  assert.equal(writes.length, 1);
  assert.equal(
    writes[0].filePath,
    path.join('/tmp/helper', 'mouse', '_generated', 'component_db', 'component-db.json'),
  );
  assert.deepEqual(JSON.parse(writes[0].payload), {
    component_type: 'sensor',
    items: [
      {
        name: 'PixArt PMW 3395',
        maker: 'PixArt',
        links: ['https://example.com'],
        aliases: ['PMW3395'],
        properties: {
          dpi: 26000,
        },
      },
    ],
  });
});

test('compiled component db patcher skips writes when the target entity is absent', async () => {
  const writes = [];
  const patchDb = createCompiledComponentDbPatcher({
    helperRoot: '/tmp/helper',
    listFiles: async () => ['component-db.json'],
    safeReadJson: async () => ({
      component_type: 'sensor',
      items: [createCompiledComponentRecord({ name: 'PAW 3311' })],
    }),
    fs: {
      async writeFile(filePath, payload) {
        writes.push({ filePath, payload });
      },
    },
    path,
  });

  await patchDb(
    'mouse',
    'sensor',
    'PixArt PMW',
    { dpi: 26000 },
    { name: 'PixArt PMW 3395' },
  );

  assert.deepEqual(writes, []);
});

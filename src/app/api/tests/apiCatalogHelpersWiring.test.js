import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  createCatalogBuilder,
  createCompiledComponentDbPatcher,
} from '../catalogHelpers.js';

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

test('catalog builder merges storage enrichment onto seeded catalog rows and skips orphans', async () => {
  const loadProductCatalog = async () => ({
    products: {
      'mouse-acme-orbit-x1': {
        brand: 'Acme',
        model: 'Orbit X1',
        variant: '',
        id: 10,
      },
    },
  });

  const storage = {
    async listInputKeys() {
      return ['inputs/seed.json', 'inputs/orphan.json'];
    },
    async readJsonOrNull(key) {
      if (key === 'inputs/seed.json') {
        return {
          productId: 'mouse-acme-orbit-x1',
          identityLock: { brand: 'Acme', model: 'Orbit X1', variant: '' },
          active: true,
        };
      }
      if (key === 'inputs/orphan.json') {
        return {
          productId: 'mouse-ghost-phantom',
          identityLock: { brand: 'Ghost', model: 'Phantom', variant: '' },
        };
      }
      if (key.includes('mouse-acme-orbit-x1') && key.includes('/summary.json')) {
        return {
          validated: true,
          confidence: 0.86,
          coverage_overall_percent: 77,
          fields_filled: 7,
          fields_total: 9,
          generated_at: '2026-02-26T10:00:00.000Z',
        };
      }
      if (key.includes('mouse-acme-orbit-x1') && key.includes('/normalized.json')) {
        return {
          identity: {
            brand: 'Acme',
            model: 'Orbit X1',
            variant: 'Core',
          },
        };
      }
      return null;
    },
    resolveOutputKey(category, productId) {
      return `out/${category}/${productId}/latest`;
    },
    async objectExists(key) {
      return key.includes('mouse-acme-orbit-x1');
    },
  };

  const buildCatalog = createCatalogBuilder({
    config: { localMode: true },
    storage,
    getSpecDb: () => ({ id: 'fake-specdb' }),
    loadQueueState: async () => ({
      state: {
        products: {
          'mouse-acme-orbit-x1': { status: 'complete' },
        },
      },
    }),
    loadProductCatalog,
    cleanVariant,
    catalogKey,
    path,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].productId, 'mouse-acme-orbit-x1');
  assert.equal(rows[0].status, 'complete');
  assert.equal(rows[0].hasFinal, true);
  assert.equal(rows[0].validated, true);
  assert.equal(rows[0].fieldsFilled, 7);
  assert.equal(rows[0].fieldsTotal, 9);
});

test('compiled component db patcher writes updated matching item', async () => {
  const writes = [];
  const patchDb = createCompiledComponentDbPatcher({
    helperRoot: '/tmp/helper',
    listFiles: async () => ['component-db.json'],
    safeReadJson: async () => ({
      component_type: 'sensor',
      items: [
        {
          name: 'PixArt PMW',
          maker: 'OldMaker',
          links: [],
          aliases: [],
          properties: { dpi: 1000 },
        },
      ],
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
  const parsed = JSON.parse(writes[0].payload);
  assert.equal(parsed.items[0].name, 'PixArt PMW 3395');
  assert.equal(parsed.items[0].maker, 'PixArt');
  assert.equal(parsed.items[0].properties.dpi, 26000);
  assert.deepEqual(parsed.items[0].aliases, ['PMW3395']);
});

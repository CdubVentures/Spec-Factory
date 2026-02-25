import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadCatalogProducts,
  loadCatalogProductsWithFields,
  discoverCategoriesLocal
} from '../src/catalog/catalogProductLoader.js';

async function tmpDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'wb-loader-'));
}

async function cleanup(dir) {
  try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
}

async function writeProductCatalog(root, category, products) {
  const controlPlaneDir = path.join(root, category, '_control_plane');
  await fs.mkdir(controlPlaneDir, { recursive: true });
  const doc = {
    _doc: 'Per-category product catalog. Managed by GUI.',
    _version: 1,
    products
  };
  await fs.writeFile(
    path.join(controlPlaneDir, 'product_catalog.json'),
    JSON.stringify(doc, null, 2),
    'utf8'
  );
}

// --- discoverCategoriesLocal ---

test('discoverCategoriesLocal: lists category directories', async () => {
  const root = await tmpDir();
  try {
    await fs.mkdir(path.join(root, 'mouse'));
    await fs.mkdir(path.join(root, 'keyboard'));
    await fs.mkdir(path.join(root, 'headset'));
    // _ prefixed dirs should be excluded
    await fs.mkdir(path.join(root, '_global'));
    await fs.mkdir(path.join(root, '_generated'));

    const cats = await discoverCategoriesLocal({ helperFilesRoot: root });
    assert.deepEqual(cats, ['headset', 'keyboard', 'mouse']);
  } finally {
    await cleanup(root);
  }
});

test('discoverCategoriesLocal: returns empty for missing root', async () => {
  const cats = await discoverCategoriesLocal({ helperFilesRoot: '/nonexistent/path' });
  assert.deepEqual(cats, []);
});

test('discoverCategoriesLocal: returns empty for empty directory', async () => {
  const root = await tmpDir();
  try {
    const cats = await discoverCategoriesLocal({ helperFilesRoot: root });
    assert.deepEqual(cats, []);
  } finally {
    await cleanup(root);
  }
});

test('discoverCategoriesLocal: excludes files (only directories)', async () => {
  const root = await tmpDir();
  try {
    await fs.mkdir(path.join(root, 'mouse'));
    await fs.writeFile(path.join(root, 'config.json'), '{}');

    const cats = await discoverCategoriesLocal({ helperFilesRoot: root });
    assert.deepEqual(cats, ['mouse']);
  } finally {
    await cleanup(root);
  }
});

// --- loadCatalogProducts ---

test('loadCatalogProducts: returns empty for missing category', async () => {
  const products = await loadCatalogProducts({ category: '', config: {} });
  assert.deepEqual(products, []);
});

test('loadCatalogProducts: returns empty when no catalog is configured', async () => {
  const root = await tmpDir();
  try {
    await fs.mkdir(path.join(root, 'mouse', '_control_plane'), { recursive: true });
    const products = await loadCatalogProducts({ category: 'mouse', config: { helperFilesRoot: root } });
    assert.deepEqual(products, []);
  } finally {
    await cleanup(root);
  }
});

test('loadCatalogProducts: reads identities from product catalog', async () => {
  const root = await tmpDir();
  try {
    await writeProductCatalog(root, 'mouse', {
      'mouse-logitech-g502': {
        brand: 'Logitech',
        model: 'G502',
        variant: '',
      },
      'mouse-razer-viper-v3-pro': {
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: '  ',
      },
      // Invalid row should be ignored.
      'mouse-bad-row': {
        brand: '',
        model: 'Unknown',
      }
    });
    const products = await loadCatalogProducts({
      category: 'mouse',
      config: { helperFilesRoot: root }
    });
    assert.deepEqual(products, [
      { brand: 'Logitech', model: 'G502', variant: '' },
      { brand: 'Razer', model: 'Viper V3 Pro', variant: '' }
    ]);
  } finally {
    await cleanup(root);
  }
});

// --- loadCatalogProductsWithFields ---

test('loadCatalogProductsWithFields: returns empty for missing category', async () => {
  const products = await loadCatalogProductsWithFields({ category: '', config: {} });
  assert.deepEqual(products, []);
});

test('loadCatalogProductsWithFields: returns empty when no catalog is configured', async () => {
  const root = await tmpDir();
  try {
    await fs.mkdir(path.join(root, 'mouse', '_control_plane'), { recursive: true });
    const products = await loadCatalogProductsWithFields({ category: 'mouse', config: { helperFilesRoot: root } });
    assert.deepEqual(products, []);
  } finally {
    await cleanup(root);
  }
});

test('loadCatalogProductsWithFields: merges catalog identities with override values', async () => {
  const root = await tmpDir();
  try {
    await writeProductCatalog(root, 'mouse', {
      'mouse-logitech-g502': {
        brand: 'Logitech',
        model: 'G502',
        variant: '',
      },
      'mouse-razer-viper-v3-pro': {
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: '',
      }
    });
    const overridesDir = path.join(root, 'mouse', '_overrides');
    await fs.mkdir(overridesDir, { recursive: true });
    await fs.writeFile(
      path.join(overridesDir, 'mouse-logitech-g502.overrides.json'),
      JSON.stringify({
        product_id: 'mouse-logitech-g502',
        overrides: {
          weight: {
            override_value: '89g'
          },
          connection: {
            value: 'wireless'
          },
          ignored_empty: {
            override_value: ''
          }
        }
      }, null, 2),
      'utf8'
    );

    const products = await loadCatalogProductsWithFields({
      category: 'mouse',
      config: { helperFilesRoot: root }
    });
    assert.equal(products.length, 2);
    assert.deepEqual(products[0], {
      brand: 'Logitech',
      model: 'G502',
      variant: '',
      canonical_fields: {
        weight: '89g',
        connection: 'wireless'
      }
    });
    assert.deepEqual(products[1], {
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: '',
      canonical_fields: {}
    });
  } finally {
    await cleanup(root);
  }
});

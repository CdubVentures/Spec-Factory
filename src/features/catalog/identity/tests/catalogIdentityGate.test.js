import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildCanonicalIdentityIndex,
  evaluateIdentityGate,
  loadCanonicalIdentityIndex
} from '../identityGate.js';

async function makeConfig() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'identity-gate-'));
  return { categoryAuthorityRoot: root, _tmp: root };
}

async function cleanup(config) {
  try { await fs.rm(config._tmp, { recursive: true, force: true }); } catch {}
}

async function writeCatalog(config, category, products) {
  const dir = path.join(config.categoryAuthorityRoot, category, '_control_plane');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'product_catalog.json'),
    JSON.stringify({ _version: 1, products }, null, 2),
    'utf8'
  );
}

test('identity gate rejects fabricated variant substring', async () => {
  const config = await makeConfig();
  try {
    await writeCatalog(config, 'mouse', {
      'mouse-acer-cestus-310': { brand: 'Acer', base_model: 'Cestus 310', model: 'Cestus 310', variant: '' }
    });
    const canonicalIndex = await loadCanonicalIdentityIndex({ config, category: 'mouse' });
    const gate = evaluateIdentityGate({
      category: 'mouse',
      brand: 'Acer',
      model: 'Cestus 310',
      variant: '310',
      canonicalIndex
    });
    assert.equal(gate.valid, false);
    assert.equal(gate.reason, 'variant_is_model_substring');
    assert.equal(gate.canonicalProductId, 'mouse-acer-cestus-310');
  } finally {
    await cleanup(config);
  }
});

test('identity gate rejects non-empty variant when canonical empty variant exists', async () => {
  const config = await makeConfig();
  try {
    await writeCatalog(config, 'mouse', {
      'mouse-logitech-g-pro-x-superlight-2': {
        brand: 'Logitech',
        base_model: 'G Pro X Superlight 2',
        model: 'G Pro X Superlight 2',
        variant: ''
      }
    });
    const canonicalIndex = await loadCanonicalIdentityIndex({ config, category: 'mouse' });
    const gate = evaluateIdentityGate({
      category: 'mouse',
      brand: 'Logitech',
      model: 'G Pro X Superlight 2',
      variant: 'Wireless',
      canonicalIndex
    });
    assert.equal(gate.valid, false);
    assert.equal(gate.reason, 'canonical_without_variant_exists');
    assert.equal(gate.canonicalProductId, 'mouse-logitech-g-pro-x-superlight-2');
  } finally {
    await cleanup(config);
  }
});

test('identity gate accepts legitimate variant when variant exists in canonical set', async () => {
  const config = await makeConfig();
  try {
    await writeCatalog(config, 'mouse', {
      'mouse-razer-viper-v3-pro-white': {
        brand: 'Razer',
        base_model: 'Viper V3 Pro',
        model: 'Viper V3 Pro',
        variant: 'White'
      }
    });
    const canonicalIndex = await loadCanonicalIdentityIndex({ config, category: 'mouse' });
    const gate = evaluateIdentityGate({
      category: 'mouse',
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: 'White',
      canonicalIndex
    });
    assert.equal(gate.valid, true);
    assert.equal(gate.reason, null);
    assert.equal(gate.canonicalProductId, 'mouse-razer-viper-v3-pro-white');
  } finally {
    await cleanup(config);
  }
});

// --- split-identity tests ---

test('identity gate: indexes on base_model for split identities', () => {
  const index = buildCanonicalIdentityIndex({
    category: 'mouse',
    source: 'test',
    products: [
      { productId: 'mouse-001', brand: 'Finalmouse', base_model: 'ULX Prophecy', model: 'ULX Prophecy Scream', variant: 'Scream' },
    ]
  });
  const gate = evaluateIdentityGate({
    category: 'mouse',
    brand: 'Finalmouse',
    model: 'ULX Prophecy',
    variant: 'Scream',
    canonicalIndex: index
  });
  assert.equal(gate.valid, true);
  assert.equal(gate.canonicalProductId, 'mouse-001');
});

test('identity gate: full model does NOT match split-identity pair keyed on base_model', () => {
  const index = buildCanonicalIdentityIndex({
    category: 'mouse',
    source: 'test',
    products: [
      { productId: 'mouse-001', brand: 'Finalmouse', base_model: 'ULX Prophecy', model: 'ULX Prophecy Scream', variant: 'Scream' },
    ]
  });
  const gate = evaluateIdentityGate({
    category: 'mouse',
    brand: 'Finalmouse',
    model: 'ULX Prophecy Scream',
    variant: '',
    canonicalIndex: index
  });
  // Full model pair doesn't exist in index → permissive (no canonical set), but no productId match
  assert.equal(gate.canonicalProductId, '');
});

test('identity gate returns empty index when product catalog is missing', async () => {
  const config = await makeConfig();
  try {
    const catDir = path.join(config.categoryAuthorityRoot, 'mouse');
    await fs.mkdir(catDir, { recursive: true });

    const canonicalIndex = await loadCanonicalIdentityIndex({ config, category: 'mouse' });
    assert.equal(canonicalIndex.source, 'none');
    assert.equal(canonicalIndex.pairVariants.size, 0);

    // With empty index, all identities are valid (no canonical set to conflict with)
    const gate = evaluateIdentityGate({
      category: 'mouse',
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: '',
      canonicalIndex
    });
    assert.equal(gate.valid, true);
  } finally {
    await cleanup(config);
  }
});

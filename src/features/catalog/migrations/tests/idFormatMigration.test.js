import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { migrateProductIds } from '../idFormatMigration.js';
import { loadProductCatalog } from '../../products/productCatalog.js';

async function tmpConfig() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'id-migration-'));
  return { categoryAuthorityRoot: dir, _tmpDir: dir };
}

async function seedCatalog(config, category, products) {
  const cpDir = path.join(config.categoryAuthorityRoot, category, '_control_plane');
  await fs.mkdir(cpDir, { recursive: true });
  await fs.writeFile(
    path.join(cpDir, 'product_catalog.json'),
    JSON.stringify({ _version: 1, products }),
  );
}

async function cleanup(config) {
  try { await fs.rm(config._tmpDir, { recursive: true, force: true }); } catch {}
}

describe('migrateProductIds', () => {
  test('dry run reports what would migrate without changing anything', async () => {
    const config = await tmpConfig();
    try {
      await seedCatalog(config, 'mouse', {
        'mouse-razer-viper-v3-pro': {
          id: 1, identifier: 'a1b2c3d4', brand: 'Razer', model: 'Viper V3 Pro',
          variant: '', status: 'active', seed_urls: [], added_at: '', added_by: 'seed',
        },
      });

      const result = await migrateProductIds({ config, category: 'mouse', dryRun: true });
      assert.equal(result.ok, true);
      assert.equal(result.migrated, 1);
      assert.equal(result.results[0].status, 'would_migrate');
      assert.equal(result.results[0].newPid, 'mouse-a1b2c3d4');

      // Catalog unchanged
      const catalog = await loadProductCatalog(config, 'mouse');
      assert.ok(catalog.products['mouse-razer-viper-v3-pro']);
      assert.ok(!catalog.products['mouse-a1b2c3d4']);
    } finally {
      await cleanup(config);
    }
  });

  test('migrates slug-based product to hex format', async () => {
    const config = await tmpConfig();
    try {
      await seedCatalog(config, 'mouse', {
        'mouse-razer-viper-v3-pro': {
          id: 1, identifier: 'a1b2c3d4', brand: 'Razer', model: 'Viper V3 Pro',
          variant: '', status: 'active', seed_urls: [], added_at: '', added_by: 'seed',
        },
      });

      const result = await migrateProductIds({ config, category: 'mouse' });
      assert.equal(result.ok, true);
      assert.equal(result.migrated, 1);
      assert.equal(result.results[0].oldPid, 'mouse-razer-viper-v3-pro');
      assert.equal(result.results[0].newPid, 'mouse-a1b2c3d4');

      // Catalog updated
      const catalog = await loadProductCatalog(config, 'mouse');
      assert.ok(!catalog.products['mouse-razer-viper-v3-pro']);
      assert.ok(catalog.products['mouse-a1b2c3d4']);
      assert.equal(catalog.products['mouse-a1b2c3d4'].brand, 'Razer');
    } finally {
      await cleanup(config);
    }
  });

  test('skips already hex-format products', async () => {
    const config = await tmpConfig();
    try {
      await seedCatalog(config, 'mouse', {
        'mouse-a1b2c3d4': {
          id: 1, identifier: 'a1b2c3d4', brand: 'Razer', model: 'Viper V3 Pro',
          variant: '', status: 'active', seed_urls: [], added_at: '', added_by: 'seed',
        },
      });

      const result = await migrateProductIds({ config, category: 'mouse' });
      assert.equal(result.ok, true);
      assert.equal(result.skipped, 1);
      assert.equal(result.migrated, 0);
    } finally {
      await cleanup(config);
    }
  });

  test('fails gracefully for products without identifier', async () => {
    const config = await tmpConfig();
    try {
      await seedCatalog(config, 'mouse', {
        'mouse-no-identifier': {
          id: 1, identifier: '', brand: 'Test', model: 'NoId',
          variant: '', status: 'active', seed_urls: [], added_at: '', added_by: 'seed',
        },
      });

      const result = await migrateProductIds({ config, category: 'mouse' });
      assert.equal(result.ok, false);
      assert.equal(result.failed, 1);
      assert.equal(result.results[0].status, 'failed_no_identifier');
    } finally {
      await cleanup(config);
    }
  });

  test('handles mixed catalog (some slug, some hex)', async () => {
    const config = await tmpConfig();
    try {
      await seedCatalog(config, 'mouse', {
        'mouse-razer-viper': {
          id: 1, identifier: 'aaaa1111', brand: 'Razer', model: 'Viper',
          variant: '', status: 'active', seed_urls: [], added_at: '', added_by: 'seed',
        },
        'mouse-bbbb2222': {
          id: 2, identifier: 'bbbb2222', brand: 'Logitech', model: 'G502',
          variant: '', status: 'active', seed_urls: [], added_at: '', added_by: 'seed',
        },
      });

      const result = await migrateProductIds({ config, category: 'mouse' });
      assert.equal(result.ok, true);
      assert.equal(result.migrated, 1);
      assert.equal(result.skipped, 1);

      const catalog = await loadProductCatalog(config, 'mouse');
      assert.ok(catalog.products['mouse-aaaa1111']);
      assert.ok(catalog.products['mouse-bbbb2222']);
      assert.ok(!catalog.products['mouse-razer-viper']);
    } finally {
      await cleanup(config);
    }
  });

  test('reports failure when artifact migration fails', async () => {
    const config = await tmpConfig();
    try {
      await seedCatalog(config, 'mouse', {
        'mouse-failing-artifacts': {
          id: 1, identifier: 'fail0001', brand: 'Test', model: 'FailArtifacts',
          variant: '', status: 'active', seed_urls: [], added_at: '', added_by: 'seed',
        },
      });

      // Storage that lists real keys but fails on write (simulating artifact migration failure)
      const failStorage = {
        outputPrefix: 'specs/outputs',
        async listKeys(prefix) {
          // Return a fake key under the old product's latest dir so migration attempts the copy
          if (prefix.includes('mouse-failing-artifacts')) return [`${prefix}/normalized.json`];
          return [];
        },
        async readBuffer(key) { return Buffer.from('{}'); },
        async readText(key) { return '{}'; },
        async readJsonOrNull() { return null; },
        async objectExists() { return false; },
        async writeObject() { throw new Error('storage_write_failed'); },
        async deleteObject() { throw new Error('storage_delete_failed'); },
        resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
      };

      const result = await migrateProductIds({
        config,
        category: 'mouse',
        storage: failStorage,
      });
      // WHY: If artifact migration fails, the overall result must NOT report ok=true.
      // The catalog rekey + SQL rekey succeed, but artifacts are orphaned.
      assert.equal(result.ok, false, `expected ok=false when artifacts fail, got ok=${result.ok}`);
      assert.equal(result.results[0].status, 'failed');
    } finally {
      await cleanup(config);
    }
  });

  test('writes rename log entry', async () => {
    const config = await tmpConfig();
    try {
      await seedCatalog(config, 'mouse', {
        'mouse-test-product': {
          id: 1, identifier: 'deadbeef', brand: 'Test', model: 'Product',
          variant: '', status: 'active', seed_urls: [], added_at: '', added_by: 'seed',
        },
      });

      await migrateProductIds({ config, category: 'mouse' });

      const logPath = path.join(config.categoryAuthorityRoot, 'mouse', '_control_plane', 'rename_log.json');
      const log = JSON.parse(await fs.readFile(logPath, 'utf8'));
      assert.ok(Array.isArray(log.entries));
      assert.equal(log.entries[0].old_slug, 'mouse-test-product');
      assert.equal(log.entries[0].new_slug, 'mouse-deadbeef');
      assert.equal(log.entries[0].migration_type, 'id_format_migration');
    } finally {
      await cleanup(config);
    }
  });
});

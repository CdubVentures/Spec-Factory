import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { writeProductIdentity } from '../writeProductIdentity.js';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'product-id-'));
}

describe('writeProductIdentity', () => {
  test('creates product.json with identity at correct path', () => {
    const root = makeTmpDir();
    const result = writeProductIdentity({
      productId: 'mouse-abc123',
      category: 'mouse',
      identity: { brand: 'Razer', model: 'Viper V3 Pro', variant: '', sku: '', title: '' },
      identifier: 'abc123',
      productRoot: root,
    });

    assert.equal(result.productPath, path.join(root, 'mouse-abc123', 'product.json'));
    assert.ok(fs.existsSync(result.productPath));

    const written = JSON.parse(fs.readFileSync(result.productPath, 'utf8'));
    assert.equal(written.schema_version, 1);
    assert.equal(written.checkpoint_type, 'product');
    assert.equal(written.product_id, 'mouse-abc123');
    assert.equal(written.category, 'mouse');
    assert.equal(written.identity.brand, 'Razer');
    assert.equal(written.identity.model, 'Viper V3 Pro');
    assert.equal(written.identity.identifier, 'abc123');
    assert.equal(written.identity.status, 'active');
    assert.equal(written.runs_completed, 0);
    assert.deepEqual(written.sources, []);
    assert.deepEqual(written.fields, {});
    assert.deepEqual(written.provenance, {});
    assert.match(written.created_at, /^\d{4}-\d{2}-\d{2}T/);

    fs.rmSync(root, { recursive: true });
  });

  test('does not overwrite existing product.json', () => {
    const root = makeTmpDir();
    writeProductIdentity({
      productId: 'mouse-abc123',
      category: 'mouse',
      identity: { brand: 'Razer', model: 'Viper' },
      productRoot: root,
    });
    const firstWritten = JSON.parse(fs.readFileSync(path.join(root, 'mouse-abc123', 'product.json'), 'utf8'));
    const firstCreatedAt = firstWritten.created_at;

    // Second call — should NOT overwrite
    const result = writeProductIdentity({
      productId: 'mouse-abc123',
      category: 'mouse',
      identity: { brand: 'CHANGED', model: 'CHANGED' },
      productRoot: root,
    });

    assert.equal(result.created, false);
    const secondWritten = JSON.parse(fs.readFileSync(path.join(root, 'mouse-abc123', 'product.json'), 'utf8'));
    assert.equal(secondWritten.identity.brand, 'Razer');
    assert.equal(secondWritten.created_at, firstCreatedAt);

    fs.rmSync(root, { recursive: true });
  });

  test('defaults missing fields to safe values', () => {
    const root = makeTmpDir();
    writeProductIdentity({
      productId: 'mouse-minimal',
      category: 'mouse',
      identity: { brand: 'Test', model: 'Min' },
      productRoot: root,
    });

    const written = JSON.parse(fs.readFileSync(path.join(root, 'mouse-minimal', 'product.json'), 'utf8'));
    assert.equal(written.identity.variant, '');
    assert.equal(written.identity.base_model, '');
    assert.equal(written.identity.brand_identifier, '');
    assert.equal(written.identity.identifier, '');
    assert.equal(written.identity.status, 'active');

    fs.rmSync(root, { recursive: true });
  });

  test('returns created: true on first write', () => {
    const root = makeTmpDir();
    const result = writeProductIdentity({
      productId: 'mouse-new',
      category: 'mouse',
      identity: { brand: 'New', model: 'Product' },
      productRoot: root,
    });
    assert.equal(result.created, true);
    fs.rmSync(root, { recursive: true });
  });
});

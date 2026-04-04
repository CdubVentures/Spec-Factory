// ── Consolidated Overrides I/O — Boundary Test Matrix ────────────────────────
//
// Tests for src/shared/consolidatedOverrides.js
// Covers: path resolution, read (missing/valid/invalid), write (atomic),
// upsert (new/merge/update), remove (present/absent), serialization.

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  resolveConsolidatedOverridePath,
  readConsolidatedOverrides,
  readProductFromConsolidated,
  writeConsolidatedOverrides,
  upsertProductInConsolidated,
  removeProductFromConsolidated,
} from '../consolidatedOverrides.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'consolidated-overrides-test-'));
}

function makeConfig(tmpDir) {
  return { categoryAuthorityRoot: tmpDir };
}

function sampleProductEntry(overrides = {}) {
  return {
    review_status: 'in_progress',
    review_started_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    overrides,
  };
}

function sampleOverrideField(value = '63g') {
  return {
    override_value: value,
    override_source: 'candidate_selection',
    override_reason: null,
    override_provenance: null,
    overridden_at: '2026-04-01T00:00:00.000Z',
    candidate_id: 'cand-001',
    value,
    set_at: '2026-04-01T00:00:00.000Z',
  };
}

async function writeRawFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

// ── Path Resolution ──────────────────────────────────────────────────────────

describe('resolveConsolidatedOverridePath', () => {
  test('returns correct path for category', () => {
    const config = { categoryAuthorityRoot: '/root/category_authority' };
    const result = resolveConsolidatedOverridePath({ config, category: 'mouse' });
    const expected = path.resolve('/root/category_authority', 'mouse', '_overrides', 'overrides.json');
    assert.equal(result, expected);
  });

  test('defaults categoryAuthorityRoot to category_authority', () => {
    const result = resolveConsolidatedOverridePath({ config: {}, category: 'keyboard' });
    assert.ok(result.endsWith(path.join('keyboard', '_overrides', 'overrides.json')));
  });
});

// ── Read — Missing / Valid / Invalid ─────────────────────────────────────────

describe('readConsolidatedOverrides', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  test('returns empty envelope when file missing', async () => {
    const config = makeConfig(tmpDir);
    const result = await readConsolidatedOverrides({ config, category: 'mouse' });
    assert.equal(result.version, 2);
    assert.equal(result.category, 'mouse');
    assert.deepEqual(result.products, {});
    assert.ok(result.updated_at);
  });

  test('parses valid v2 file', async () => {
    const config = makeConfig(tmpDir);
    const filePath = resolveConsolidatedOverridePath({ config, category: 'mouse' });
    const envelope = {
      version: 2,
      category: 'mouse',
      updated_at: '2026-04-01T00:00:00.000Z',
      products: {
        'mouse-abc': sampleProductEntry({ weight: sampleOverrideField() }),
      },
    };
    await writeRawFile(filePath, JSON.stringify(envelope, null, 2));

    const result = await readConsolidatedOverrides({ config, category: 'mouse' });
    assert.equal(result.version, 2);
    assert.equal(result.category, 'mouse');
    assert.ok(result.products['mouse-abc']);
    assert.equal(result.products['mouse-abc'].overrides.weight.override_value, '63g');
  });

  test('returns empty envelope for invalid JSON (no throw)', async () => {
    const config = makeConfig(tmpDir);
    const filePath = resolveConsolidatedOverridePath({ config, category: 'mouse' });
    await writeRawFile(filePath, '{corrupt json!!!');

    const result = await readConsolidatedOverrides({ config, category: 'mouse' });
    assert.equal(result.version, 2);
    assert.equal(result.category, 'mouse');
    assert.deepEqual(result.products, {});
  });
});

// ── Read Product ─────────────────────────────────────────────────────────────

describe('readProductFromConsolidated', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  test('returns null when file missing', async () => {
    const config = makeConfig(tmpDir);
    const result = await readProductFromConsolidated({ config, category: 'mouse', productId: 'mouse-abc' });
    assert.equal(result, null);
  });

  test('returns null when product absent from file', async () => {
    const config = makeConfig(tmpDir);
    const filePath = resolveConsolidatedOverridePath({ config, category: 'mouse' });
    await writeRawFile(filePath, JSON.stringify({ version: 2, category: 'mouse', updated_at: '', products: {} }));

    const result = await readProductFromConsolidated({ config, category: 'mouse', productId: 'mouse-abc' });
    assert.equal(result, null);
  });

  test('returns entry when product present', async () => {
    const config = makeConfig(tmpDir);
    const filePath = resolveConsolidatedOverridePath({ config, category: 'mouse' });
    const entry = sampleProductEntry({ weight: sampleOverrideField() });
    await writeRawFile(filePath, JSON.stringify({ version: 2, category: 'mouse', updated_at: '', products: { 'mouse-abc': entry } }));

    const result = await readProductFromConsolidated({ config, category: 'mouse', productId: 'mouse-abc' });
    assert.ok(result);
    assert.equal(result.review_status, 'in_progress');
    assert.equal(result.overrides.weight.override_value, '63g');
  });
});

// ── Write ────────────────────────────────────────────────────────────────────

describe('writeConsolidatedOverrides', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  test('creates file with correct JSON', async () => {
    const config = makeConfig(tmpDir);
    const envelope = {
      version: 2,
      category: 'mouse',
      updated_at: '2026-04-01T00:00:00.000Z',
      products: { 'mouse-abc': sampleProductEntry() },
    };
    await writeConsolidatedOverrides({ config, category: 'mouse', envelope });

    const filePath = resolveConsolidatedOverridePath({ config, category: 'mouse' });
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 2);
    assert.ok(parsed.products['mouse-abc']);
  });

  test('atomic write leaves no tmp file on success', async () => {
    const config = makeConfig(tmpDir);
    const envelope = { version: 2, category: 'mouse', updated_at: '', products: {} };
    await writeConsolidatedOverrides({ config, category: 'mouse', envelope });

    const filePath = resolveConsolidatedOverridePath({ config, category: 'mouse' });
    const tmpPath = filePath + '.tmp';
    await assert.rejects(fs.stat(tmpPath), { code: 'ENOENT' });
  });
});

// ── Upsert ───────────────────────────────────────────────────────────────────

describe('upsertProductInConsolidated', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  test('adds product to empty (missing) file', async () => {
    const config = makeConfig(tmpDir);
    const entry = sampleProductEntry({ weight: sampleOverrideField() });
    await upsertProductInConsolidated({ config, category: 'mouse', productId: 'mouse-abc', productEntry: entry });

    const result = await readConsolidatedOverrides({ config, category: 'mouse' });
    assert.equal(Object.keys(result.products).length, 1);
    assert.ok(result.products['mouse-abc']);
    assert.equal(result.products['mouse-abc'].overrides.weight.override_value, '63g');
  });

  test('merges into existing file, preserves other products', async () => {
    const config = makeConfig(tmpDir);
    const entryA = sampleProductEntry({ weight: sampleOverrideField('100g') });
    await upsertProductInConsolidated({ config, category: 'mouse', productId: 'mouse-a', productEntry: entryA });

    const entryB = sampleProductEntry({ height: sampleOverrideField('40mm') });
    await upsertProductInConsolidated({ config, category: 'mouse', productId: 'mouse-b', productEntry: entryB });

    const result = await readConsolidatedOverrides({ config, category: 'mouse' });
    assert.equal(Object.keys(result.products).length, 2);
    assert.equal(result.products['mouse-a'].overrides.weight.override_value, '100g');
    assert.equal(result.products['mouse-b'].overrides.height.override_value, '40mm');
  });

  test('updates existing product entry', async () => {
    const config = makeConfig(tmpDir);
    const entryV1 = sampleProductEntry({ weight: sampleOverrideField('60g') });
    await upsertProductInConsolidated({ config, category: 'mouse', productId: 'mouse-abc', productEntry: entryV1 });

    const entryV2 = { ...sampleProductEntry({ weight: sampleOverrideField('63g') }), review_status: 'approved' };
    await upsertProductInConsolidated({ config, category: 'mouse', productId: 'mouse-abc', productEntry: entryV2 });

    const result = await readConsolidatedOverrides({ config, category: 'mouse' });
    assert.equal(Object.keys(result.products).length, 1);
    assert.equal(result.products['mouse-abc'].overrides.weight.override_value, '63g');
    assert.equal(result.products['mouse-abc'].review_status, 'approved');
  });
});

// ── Remove ───────────────────────────────────────────────────────────────────

describe('removeProductFromConsolidated', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  test('removes product, preserves others', async () => {
    const config = makeConfig(tmpDir);
    await upsertProductInConsolidated({ config, category: 'mouse', productId: 'mouse-a', productEntry: sampleProductEntry() });
    await upsertProductInConsolidated({ config, category: 'mouse', productId: 'mouse-b', productEntry: sampleProductEntry() });

    await removeProductFromConsolidated({ config, category: 'mouse', productId: 'mouse-a' });

    const result = await readConsolidatedOverrides({ config, category: 'mouse' });
    assert.equal(Object.keys(result.products).length, 1);
    assert.ok(!result.products['mouse-a']);
    assert.ok(result.products['mouse-b']);
  });

  test('removing missing product is a no-op', async () => {
    const config = makeConfig(tmpDir);
    await upsertProductInConsolidated({ config, category: 'mouse', productId: 'mouse-a', productEntry: sampleProductEntry() });

    await removeProductFromConsolidated({ config, category: 'mouse', productId: 'mouse-nonexistent' });

    const result = await readConsolidatedOverrides({ config, category: 'mouse' });
    assert.equal(Object.keys(result.products).length, 1);
    assert.ok(result.products['mouse-a']);
  });
});

// ── Write Serialization ──────────────────────────────────────────────────────

describe('concurrent writes', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  test('concurrent upserts to same category do not lose data', async () => {
    const config = makeConfig(tmpDir);
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        upsertProductInConsolidated({
          config,
          category: 'mouse',
          productId: `mouse-${i}`,
          productEntry: sampleProductEntry({ weight: sampleOverrideField(`${60 + i}g`) }),
        })
      );
    }
    await Promise.all(promises);

    const result = await readConsolidatedOverrides({ config, category: 'mouse' });
    assert.equal(Object.keys(result.products).length, 5, 'all 5 products should be present');
    for (let i = 0; i < 5; i++) {
      assert.ok(result.products[`mouse-${i}`], `mouse-${i} should be present`);
    }
  });
});

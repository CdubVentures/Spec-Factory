import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../../s3/storage.js';
import { createQueueAdapter } from '../queueStorageAdapter.js';

function makeStorage(tempRoot) {
  return createStorage({
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs'
  });
}

function makeSpecDb(category) {
  const rows = new Map();
  const toRow = (productId, patch = {}) => ({
    category,
    product_id: productId,
    s3key: patch.s3key || '',
    status: patch.status || 'pending',
    priority: patch.priority ?? 3,
    attempts_total: patch.attempts_total ?? 0,
    retry_count: patch.retry_count ?? 0,
    max_attempts: patch.max_attempts ?? 3,
    next_retry_at: patch.next_retry_at ?? null,
    last_run_id: patch.last_run_id ?? null,
    cost_usd_total: patch.cost_usd_total ?? 0,
    rounds_completed: patch.rounds_completed ?? 0,
    next_action_hint: patch.next_action_hint ?? null,
    last_urls_attempted: Array.isArray(patch.last_urls_attempted) ? patch.last_urls_attempted : [],
    last_error: patch.last_error ?? null,
    last_started_at: patch.last_started_at ?? null,
    last_completed_at: patch.last_completed_at ?? null,
    updated_at: patch.updated_at || new Date().toISOString(),
    last_summary: patch.last_summary ?? null,
  });

  return {
    category,
    db: { transaction: (fn) => (...args) => fn(...args) },
    getQueueProduct: (productId) => rows.get(String(productId || '').trim()) || null,
    getAllQueueProducts: (statusFilter) => {
      const all = [...rows.values()];
      return statusFilter ? all.filter((r) => r.status === statusFilter) : all;
    },
    upsertQueueProduct: (row) => {
      rows.set(String(row.product_id || '').trim(), toRow(row.product_id, row));
    },
    updateQueueProductPatch: (productId, patch) => {
      const existing = rows.get(String(productId || '').trim());
      if (!existing) return null;
      const merged = toRow(productId, { ...existing, ...patch });
      rows.set(String(productId || '').trim(), merged);
      return merged;
    },
    selectNextQueueProductSql: () => {
      const eligible = [...rows.values()].filter((r) =>
        !['complete', 'blocked', 'paused', 'skipped', 'failed', 'exhausted', 'needs_manual'].includes(r.status)
      );
      if (!eligible.length) return null;
      eligible.sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
      return eligible[0];
    },
    deleteQueueProduct: (productId) => ({ changes: rows.delete(String(productId || '').trim()) ? 1 : 0 }),
    clearQueueByStatus: (status) => {
      const removed = [];
      for (const [id, row] of rows) {
        if (row.status === status) { removed.push(id); rows.delete(id); }
      }
      return { changes: removed.length };
    },
  };
}

// ── Factory tests ───────────────────────────────────────────────────

test('createQueueAdapter returns sqlite adapter when specDb provided', () => {
  const specDb = makeSpecDb('mouse');
  const adapter = createQueueAdapter({ storage: null, category: 'mouse', specDb });
  assert.equal(typeof adapter.get, 'function');
  assert.equal(typeof adapter.getAll, 'function');
  assert.equal(typeof adapter.save, 'function');
  assert.equal(typeof adapter.saveBatch, 'function');
  assert.equal(typeof adapter.delete, 'function');
  assert.equal(typeof adapter.clearByStatus, 'function');
  assert.equal(typeof adapter.selectNext, 'function');
  assert.equal(typeof adapter.patch, 'function');
});

test('createQueueAdapter returns json adapter when specDb is null', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-adapter-factory-'));
  const storage = makeStorage(tempRoot);
  try {
    const adapter = createQueueAdapter({ storage, category: 'mouse', specDb: null });
    assert.equal(typeof adapter.get, 'function');
    assert.equal(typeof adapter.getAll, 'function');
    assert.equal(typeof adapter.save, 'function');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

// ── SQLite adapter tests ────────────────────────────────────────────

test('sqlite adapter get returns normalized row', async () => {
  const specDb = makeSpecDb('mouse');
  specDb.upsertQueueProduct({ product_id: 'mouse-a', s3key: 'k/a.json', status: 'running', priority: 2 });
  const adapter = createQueueAdapter({ storage: null, category: 'mouse', specDb });

  const row = await adapter.get('mouse-a');
  assert.equal(row.productId || row.product_id, 'mouse-a');
  assert.equal(row.status, 'running');
  assert.equal(row.priority, 2);
});

test('sqlite adapter get returns null for missing product', async () => {
  const specDb = makeSpecDb('mouse');
  const adapter = createQueueAdapter({ storage: null, category: 'mouse', specDb });
  assert.equal(await adapter.get('nonexistent'), null);
});

test('sqlite adapter getAll returns all rows, filtered by status', async () => {
  const specDb = makeSpecDb('mouse');
  specDb.upsertQueueProduct({ product_id: 'a', status: 'pending' });
  specDb.upsertQueueProduct({ product_id: 'b', status: 'complete' });
  specDb.upsertQueueProduct({ product_id: 'c', status: 'pending' });
  const adapter = createQueueAdapter({ storage: null, category: 'mouse', specDb });

  const all = await adapter.getAll();
  assert.equal(all.length, 3);

  const pending = await adapter.getAll('pending');
  assert.equal(pending.length, 2);
});

test('sqlite adapter save and then get round-trips', async () => {
  const specDb = makeSpecDb('mouse');
  const adapter = createQueueAdapter({ storage: null, category: 'mouse', specDb });

  await adapter.save('mouse-new', { s3key: 'k/new.json', status: 'pending', priority: 4 });
  const row = await adapter.get('mouse-new');
  assert.equal(row.status, 'pending');
  assert.equal(row.priority, 4);
});

test('sqlite adapter saveBatch writes multiple products', async () => {
  const specDb = makeSpecDb('mouse');
  const adapter = createQueueAdapter({ storage: null, category: 'mouse', specDb });

  await adapter.saveBatch({
    'mouse-1': { s3key: 'k/1.json', status: 'pending' },
    'mouse-2': { s3key: 'k/2.json', status: 'running' },
  });

  const all = await adapter.getAll();
  assert.equal(all.length, 2);
});

test('sqlite adapter delete removes a product', async () => {
  const specDb = makeSpecDb('mouse');
  specDb.upsertQueueProduct({ product_id: 'mouse-del', status: 'failed' });
  const adapter = createQueueAdapter({ storage: null, category: 'mouse', specDb });

  const result = await adapter.delete('mouse-del');
  assert.equal(result.changes, 1);
  assert.equal(await adapter.get('mouse-del'), null);
});

test('sqlite adapter clearByStatus removes matching rows', async () => {
  const specDb = makeSpecDb('mouse');
  specDb.upsertQueueProduct({ product_id: 'a', status: 'failed' });
  specDb.upsertQueueProduct({ product_id: 'b', status: 'failed' });
  specDb.upsertQueueProduct({ product_id: 'c', status: 'pending' });
  const adapter = createQueueAdapter({ storage: null, category: 'mouse', specDb });

  const result = await adapter.clearByStatus('failed');
  assert.equal(result.removed_count, 2);
  assert.ok(result.removed_product_ids.includes('a'));
  const remaining = await adapter.getAll();
  assert.equal(remaining.length, 1);
});

test('sqlite adapter selectNext returns top eligible row', async () => {
  const specDb = makeSpecDb('mouse');
  specDb.upsertQueueProduct({ product_id: 'hi', status: 'pending', priority: 1 });
  specDb.upsertQueueProduct({ product_id: 'lo', status: 'pending', priority: 5 });
  specDb.upsertQueueProduct({ product_id: 'done', status: 'complete' });
  const adapter = createQueueAdapter({ storage: null, category: 'mouse', specDb });

  const next = await adapter.selectNext();
  assert.ok(next);
  assert.equal(next.product_id || next.productId, 'hi');
});

// ── JSON adapter tests ──────────────────────────────────────────────

test('json adapter save and get round-trips via storage', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-adapter-json-'));
  const storage = makeStorage(tempRoot);
  const adapter = createQueueAdapter({ storage, category: 'mouse', specDb: null });

  try {
    await adapter.save('mouse-j1', { s3key: 'k/j1.json', status: 'pending', priority: 2 });
    const row = await adapter.get('mouse-j1');
    assert.equal(row.status, 'pending');
    assert.equal(row.priority, 2);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('json adapter getAll returns all products from storage', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-adapter-json-all-'));
  const storage = makeStorage(tempRoot);
  const adapter = createQueueAdapter({ storage, category: 'mouse', specDb: null });

  try {
    await adapter.save('a', { status: 'pending' });
    await adapter.save('b', { status: 'complete' });
    const all = await adapter.getAll();
    assert.equal(all.length, 2);

    const pending = await adapter.getAll('pending');
    assert.equal(pending.length, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('json adapter clearByStatus removes matching and returns ids', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-adapter-json-clear-'));
  const storage = makeStorage(tempRoot);
  const adapter = createQueueAdapter({ storage, category: 'mouse', specDb: null });

  try {
    await adapter.save('a', { status: 'failed' });
    await adapter.save('b', { status: 'failed' });
    await adapter.save('c', { status: 'pending' });

    const result = await adapter.clearByStatus('failed');
    assert.equal(result.removed_count, 2);
    assert.ok(result.removed_product_ids.includes('a'));

    const remaining = await adapter.getAll();
    assert.equal(remaining.length, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

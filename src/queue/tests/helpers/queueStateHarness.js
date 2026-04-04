import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createStorage } from '../../../core/storage/storage.js';

export function createQueueStorage(tempRoot) {
  return createStorage({
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs'
  });
}

export async function withTempQueueStorage(prefix, run) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const storage = createQueueStorage(tempRoot);
  try {
    return await run({ tempRoot, storage });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export function createSpecDb(category) {
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
    db: {
      transaction: (fn) => (...args) => fn(...args),
    },
    getQueueProduct: (productId) => rows.get(String(productId || '').trim()) || null,
    getAllQueueProducts: (statusFilter) => {
      const all = [...rows.values()];
      if (!statusFilter) return all;
      return all.filter((row) => row.status === statusFilter);
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
      const eligible = [...rows.values()].filter((row) =>
        !['complete', 'blocked', 'paused', 'skipped', 'failed', 'exhausted', 'needs_manual'].includes(row.status)
      );
      if (!eligible.length) return null;
      eligible.sort((left, right) => (left.priority ?? 3) - (right.priority ?? 3));
      return eligible[0];
    },
    deleteQueueProduct: (productId) => ({ changes: rows.delete(String(productId || '').trim()) ? 1 : 0 }),
    clearQueueByStatus: (status) => {
      const removed = [];
      for (const [id, row] of rows) {
        if (row.status === status) {
          removed.push(id);
          rows.delete(id);
        }
      }
      return { changes: removed.length };
    },
  };
}

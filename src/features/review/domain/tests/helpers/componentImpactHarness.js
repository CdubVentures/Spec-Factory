import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../../../../../db/specDb.js';
import { loadQueueState, saveQueueState } from '../../../../../queue/queueState.js';
import {
  cascadeComponentChange,
  cascadeEnumChange,
  findProductsReferencingComponent,
} from '../../componentImpact.js';

export {
  cascadeComponentChange,
  cascadeEnumChange,
  findProductsReferencingComponent,
  loadQueueState,
  saveQueueState,
};

function createStorage() {
  const objects = new Map();
  return {
    readTextOrNull: async (key) => objects.get(key) ?? null,
    writeObject: async (key, body) => {
      objects.set(key, Buffer.isBuffer(body) ? body.toString('utf8') : Buffer.from(body).toString('utf8'));
    },
    resolveOutputKey: (...parts) => ['specs', 'outputs', ...parts].filter(Boolean).join('/'),
  };
}

export async function createHarness() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-component-impact-'));
  const outputRoot = path.join(tempRoot, 'out');
  const storage = createStorage();

  const category = 'mouse';
  const specDb = new SpecDb({ dbPath: ':memory:', category });

  return { tempRoot, outputRoot, storage, specDb, category };
}

export async function cleanupHarness(harness) {
  try {
    harness?.specDb?.close();
  } finally {
    await fs.rm(harness.tempRoot, { recursive: true, force: true });
  }
}

export function upsertQueueRow(specDb, productId, status = 'complete') {
  specDb.upsertQueueProduct({
    product_id: productId,
    status,
    priority: 3,
    attempts_total: 0,
    retry_count: 0,
    max_attempts: 3,
  });
}

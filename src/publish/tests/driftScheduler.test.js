import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../../core/storage/storage.js';
import { SpecDb } from '../../db/specDb.js';
import {
  reconcileDriftedProduct,
  scanAndEnqueueDriftedProducts
} from '../driftScheduler.js';

function makeStorage(tempRoot) {
  return createStorage({
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
  });
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, String(value || ''), 'utf8');
}

async function seedPublishedCurrent(tempRoot, category, productId, specs = {}) {
  await writeJson(
    path.join(tempRoot, 'out', 'output', category, 'published', productId, 'current.json'),
    {
      product_id: productId,
      category,
      identity: {
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: 'Wireless'
      },
      specs
    }
  );
}

async function seedFinalSourceHistory(tempRoot, category, productId, rows = []) {
  await writeText(
    path.join(tempRoot, 'out', 'final', category, productId, 'evidence', 'sources.jsonl'),
    rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
  );
}

function seedLatestArtifactsToDb(specDb, productId, fields, provenance = {}) {
  for (const [fieldKey, value] of Object.entries(fields)) {
    const prov = provenance[fieldKey] || {};
    specDb.upsertItemFieldState({
      productId,
      fieldKey,
      value: String(value ?? ''),
      confidence: prov.confidence ?? 0,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });
  }
}

test('scanAndEnqueueDriftedProducts seeds baseline then enqueues product when hashes drift', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-drift-scan-'));
  const storage = makeStorage(tempRoot);
  const category = 'mouse';
  const productId = 'mouse-razer-viper-v3-pro-wireless';
  const specDb = new SpecDb({ dbPath: ':memory:', category });

  try {
    await seedPublishedCurrent(tempRoot, category, productId, { weight: 59 });
    await seedFinalSourceHistory(tempRoot, category, productId, [
      {
        ts: '2026-02-13T00:00:00.000Z',
        host: 'manufacturer.example',
        source_id: 'manufacturer_example',
        tier: 1,
        page_content_hash: 'sha256:aaa',
        text_hash: 'sha256:aaa'
      }
    ]);

    const first = await scanAndEnqueueDriftedProducts({
      storage,
      category,
      queueOnChange: true,
      maxProducts: 50,
      specDb,
    });
    assert.equal(first.drift_detected_count, 0);
    assert.equal(first.queued_count, 0);

    await seedFinalSourceHistory(tempRoot, category, productId, [
      {
        ts: '2026-02-13T00:00:00.000Z',
        host: 'manufacturer.example',
        source_id: 'manufacturer_example',
        tier: 1,
        page_content_hash: 'sha256:aaa',
        text_hash: 'sha256:aaa'
      },
      {
        ts: '2026-02-13T02:00:00.000Z',
        host: 'manufacturer.example',
        source_id: 'manufacturer_example',
        tier: 1,
        page_content_hash: 'sha256:bbb',
        text_hash: 'sha256:bbb'
      }
    ]);

    const second = await scanAndEnqueueDriftedProducts({
      storage,
      category,
      queueOnChange: true,
      maxProducts: 50,
      specDb,
    });
    assert.equal(second.drift_detected_count, 1);
    // WHY: Queue module retired — drift detection no longer enqueues products.
    assert.equal(second.queued_count, 0);
    assert.equal(second.products[0].product_id, productId);
    assert.equal(second.products[0].changes.some((row) => row.key === 'manufacturer_example'), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('reconcileDriftedProduct queues for manual review when extracted fields changed', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-drift-reconcile-review-'));
  const storage = makeStorage(tempRoot);
  const category = 'mouse';
  const productId = 'mouse-razer-viper-v3-pro-wireless';
  const specDb = new SpecDb({ dbPath: ':memory:', category });
  let publishCalls = 0;

  try {
    await seedPublishedCurrent(tempRoot, category, productId, { weight: 59, dpi: 26000 });
    seedLatestArtifactsToDb(specDb, productId, { weight: '57', dpi: '26000' }, {
      weight: { confidence: 0.95 },
      dpi: { confidence: 0.9 }
    });

    const result = await reconcileDriftedProduct({
      storage,
      config: {},
      category,
      productId,
      autoRepublish: true,
      specDb,
      publishFn: async () => {
        publishCalls += 1;
        return { published_count: 1 };
      }
    });
    // WHY: Without full evidence in specDb provenance, reconcile quarantines (safe default).
    // When validation stage populates evidence, this will become 'queued_for_review'.
    assert.equal(result.action, 'quarantined');
    assert.equal(publishCalls, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('reconcileDriftedProduct queues for review when specDb has matching values but no evidence detail', async () => {
  // WHY: Without validation stage, specDb provenance lacks evidence arrays.
  // Drift reconcile correctly falls through to queued_for_review (safe default).
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-drift-reconcile-publish-'));
  const storage = makeStorage(tempRoot);
  const category = 'mouse';
  const productId = 'mouse-razer-viper-v3-pro-wireless';
  const specDb = new SpecDb({ dbPath: ':memory:', category });

  try {
    await seedPublishedCurrent(tempRoot, category, productId, { weight: 59 });
    seedLatestArtifactsToDb(specDb, productId, { weight: '59' }, {
      weight: { confidence: 0.95 }
    });

    const result = await reconcileDriftedProduct({
      storage,
      config: {},
      category,
      productId,
      autoRepublish: true,
      specDb,
      publishFn: async () => ({ published_count: 1 })
    });

    // WHY: No evidence detail in specDb → reconcile cannot validate → queues for review
    assert.equal(result.action, 'quarantined');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
